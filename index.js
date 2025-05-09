// index.js
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, ActivityType } = require('discord.js'); // Added ActivityType
const dotenv = require('dotenv');
const { initializeDatabase, getAllConnectedUsers, addHistoryEntries, getDbInstance } = require('./utils/database'); // Added new DB imports
const { startWebServer } = require('./web/server');
const { initializeNgrok, getUserSpotifyApi, updateRedirectUri } = require('./utils/spotify'); // Added getUserSpotifyApi, updateRedirectUri
const SpotifyWebApi = require('spotify-web-api-node'); // Needed for type checking
const trackerLogger = require('./utils/trackerLogger'); // <-- Add this line

dotenv.config();

// --- Environment Variable Checks ---
const requiredEnv = ['DISCORD_TOKEN', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'GEMINI_API_KEY', 'PORT'];
const missingEnv = requiredEnv.filter(envVar => !process.env[envVar]);
if (missingEnv.length > 0) {
    console.error(`[FATAL ERROR] Missing required environment variables: ${missingEnv.join(', ')}`);
    process.exit(1);
}
// --- End Check ---

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
    ]
});

// --- Command Handling ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`[Commands] Loaded command ${command.data.name}`);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// --- Variable for Tracking Interval ---
let recentTrackInterval = null; // Holds the interval ID for shutdown

// --- Event Handling ---
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('your Spotify stats 👀', { type: ActivityType.Watching }); // Use ActivityType enum

    // Initialize Database
    try {
        initializeDatabase();
        console.log('[Database] Initialized successfully.');
    } catch (dbError) {
        console.error('[FATAL ERROR] Failed to initialize database:', dbError);
        process.exit(1);
    }

    // Start Web Server & Ngrok
    try {
        const port = process.env.PORT || 8888;
        const ngrokUrl = await initializeNgrok(port);
        if (ngrokUrl) {
            console.log(`[Ngrok] Tunnel running at: ${ngrokUrl}`);
            console.log(`[Spotify] IMPORTANT: Update SPOTIFY_REDIRECT_URI in Spotify Developer Dashboard to: ${ngrokUrl}/callback`);
            // Dynamic update happens inside initializeNgrok now via updateRedirectUri
            startWebServer(client, port);
            console.log(`[Web Server] Listening on port ${port} for Spotify callback.`);

            // --- Start Recent Track Polling AFTER everything is ready ---
            startRecentTrackPolling(); // Call the new function

        } else {
             console.error('[FATAL ERROR] Failed to initialize Ngrok. Spotify authentication will not work.');
             // process.exit(1); // Decide if critical
        }
    } catch (webError) {
        console.error('[FATAL ERROR] Failed to start web server or Ngrok:', webError);
        process.exit(1);
    }

    // Start the recent track polling
    startRecentTrackPolling();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        try { await interaction.reply({ content: 'Error: Command not found!', ephemeral: true }); }
        catch (replyError) { console.error(`[Interaction Error] Failed to reply to unknown command:`, replyError); }
        return;
    }
    try {
        console.log(`[Interaction] User ${interaction.user.tag} (${interaction.user.id}) used command: /${interaction.commandName}`);
        await command.execute(interaction);
    } catch (error) {
        console.error(`[Interaction Error] Error executing /${interaction.commandName}:`, error);
        const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage).catch(followUpError => console.error(`[Interaction Error] Failed to follow up after error:`, followUpError));
        } else {
            await interaction.reply(errorMessage).catch(replyError => console.error(`[Interaction Error] Failed to reply with error:`, replyError));
        }
    }
});

// --- Recent Track Polling Functionality ---

const POLLING_INTERVAL_MS = 60 * 1000; // 1 minute
const DELAY_BETWEEN_USERS_MS = 500; // 0.5 seconds delay between checking each user

async function pollRecentTracks() {
    trackerLogger.log('Starting recent track poll cycle...');
    const users = getAllConnectedUsers();
    if (!users || users.length === 0) {
        trackerLogger.log('No connected users found to poll.');
        return;
    }

    trackerLogger.log(`Found ${users.length} connected users to check.`);
    let totalFetched = 0;
    let totalAdded = 0;
    let totalSkipped = 0;
    let usersFailed = 0;

    for (const user of users) {
        trackerLogger.log(`Processing user ${user.discord_id}...`);
        try {
            const spotifyApi = await getUserSpotifyApi(user.discord_id); // Handles token refresh

            if (!spotifyApi) {
                trackerLogger.warn(`Could not get valid Spotify API client for user ${user.discord_id}. Skipping.`);
                usersFailed++;
                continue;
            }

            // Fetch recently played tracks (max 50)
            trackerLogger.log(`Fetching recent tracks for user ${user.discord_id}...`);
            const recentData = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 50 });

            if (recentData.body && recentData.body.items && recentData.body.items.length > 0) {
                trackerLogger.log(`Found ${recentData.body.items.length} recent tracks for user ${user.discord_id}`);
                totalFetched += recentData.body.items.length;
                const entriesToSave = [];

                for (const item of recentData.body.items) {
                    if (!item.track || !item.played_at || !item.track.name || !item.track.artists || item.track.artists.length === 0) {
                        trackerLogger.warn(`Skipping invalid item for user ${user.discord_id}:`, item);
                        continue;
                    }

                    // Convert played_at (ISO 8601 string) to Unix timestamp (seconds)
                    let timestampInSeconds;
                    try {
                        const playedAtDate = new Date(item.played_at);
                        if (isNaN(playedAtDate.getTime())) throw new Error('Invalid date parsed');
                        timestampInSeconds = Math.floor(playedAtDate.getTime() / 1000);
                    } catch (timeError) {
                        trackerLogger.warn(`Error parsing 'played_at' timestamp ${item.played_at} for user ${user.discord_id}. Skipping item.`, timeError);
                        continue;
                    }

                    entriesToSave.push({
                        ts: timestampInSeconds,
                        ms_played: item.track.duration_ms || 180000, // Use actual duration or default to 3 minutes
                        track_name: item.track.name,
                        artist_name: item.track.artists[0].name,
                        album_name: item.track.album?.name,
                        spotify_track_uri: item.track.uri,
                        source: 'recent'
                    });
                }

                if (entriesToSave.length > 0) {
                    trackerLogger.log(`Saving ${entriesToSave.length} entries for user ${user.discord_id}...`);
                    const result = addHistoryEntries(user.discord_id, entriesToSave, 'recent');
                    trackerLogger.log(`Save results for user ${user.discord_id}: Added ${result.added}, Skipped ${result.skipped}`);
                    totalAdded += result.added;
                    totalSkipped += result.skipped;
                } else {
                    trackerLogger.log(`No valid entries to save for user ${user.discord_id}`);
                }
            } else {
                trackerLogger.log(`No recent tracks found for user ${user.discord_id}`);
            }
        } catch (error) {
            usersFailed++;
            if (error instanceof SpotifyWebApi.SpotifyWebApiError || error.body?.error) {
                const spotifyError = error.body?.error || {};
                const statusCode = error.statusCode;
                trackerLogger.error(`Spotify API Error for user ${user.discord_id}: Status ${statusCode}, Message: ${spotifyError.message || error.message}`);
                if (statusCode === 429) { 
                    trackerLogger.warn('Rate limit hit. Consider increasing interval or delay.'); 
                } else if (statusCode === 401 || statusCode === 403) { 
                    trackerLogger.warn(`Auth error for user ${user.discord_id}. They may need to /connect again.`); 
                }
            } else {
                trackerLogger.error(`Unexpected Error processing user ${user.discord_id}:`, error);
            }
        }

        // Add a small delay before processing the next user to avoid hammering the API
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_USERS_MS));
    }

    trackerLogger.log(`Poll cycle finished. Processed ${users.length} users. Total Fetched Items: ${totalFetched}, Added: ${totalAdded}, Skipped: ${totalSkipped}, Failed Users: ${usersFailed}.`);
}

function startRecentTrackPolling() {
    if (recentTrackInterval) {
        console.warn('[Tracker] Polling interval already started.');
        return;
    }
    console.log(`[Tracker] Starting recent track polling every ${POLLING_INTERVAL_MS / 1000 / 60} minutes.`);
    // Run once immediately, then set interval
    pollRecentTracks().catch(err => console.error('[Tracker] Initial poll failed:', err)); // Run initial poll
    recentTrackInterval = setInterval(() => {
        pollRecentTracks().catch(err => console.error('[Tracker] Poll cycle failed:', err)); // Catch errors in interval calls
    }, POLLING_INTERVAL_MS);
}

// --- Login ---
client.login(process.env.DISCORD_TOKEN);

// --- Graceful Shutdown ---
const ngrok = require('ngrok'); // Ensure ngrok is required here

async function shutdown(signal) {
    console.log(`\n[${signal}] Received signal. Shutting down gracefully...`);

    // 0. Stop Polling Interval
    if (recentTrackInterval) {
        console.log('[Shutdown] Stopping track polling interval...');
        clearInterval(recentTrackInterval);
        recentTrackInterval = null; // Clear variable
        console.log('[Shutdown] Polling interval stopped.');
    }

    // 1. Disconnect Ngrok
    try {
        console.log('[Shutdown] Disconnecting Ngrok...');
        await ngrok.disconnect();
        console.log('[Shutdown] Ngrok disconnected.');
    } catch (err) {
        console.error('[Shutdown] Error disconnecting Ngrok:', err);
    }

    // 2. Close Database Connection
    try {
        const db = getDbInstance();
        if (db && db.open) {
             console.log('[Shutdown] Closing database connection...');
             db.close((err) => { // Use callback for close confirmation/error
                 if (err) {
                     console.error('[Shutdown] Error closing database:', err.message);
                 } else {
                     console.log('[Shutdown] Database connection closed.');
                 }
             });
        }
    } catch (err) { // Catch errors from getDbInstance itself
        console.error('[Shutdown] Error getting DB instance for closing:', err);
    }

    // 3. Destroy Discord Client
    console.log('[Shutdown] Destroying Discord client...');
    client.destroy();
    console.log('[Shutdown] Discord client destroyed.');

    // 4. Exit Process - Use setTimeout to allow async close operations (like db.close) to attempt completion
    console.log('[Shutdown] Exiting process shortly...');
    setTimeout(() => process.exit(0), 1500); // Allow 1.5 seconds for cleanup
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', error => {
    console.error('[FATAL] Unhandled Promise Rejection:', error);
    // Attempt shutdown but exit faster on unhandled errors
    shutdown('Unhandled Rejection').catch(() => {}).finally(() => setTimeout(() => process.exit(1), 500));
});
process.on('uncaughtException', error => {
    console.error('[FATAL] Uncaught Exception:', error);
    shutdown('Uncaught Exception').catch(() => {}).finally(() => setTimeout(() => process.exit(1), 500));
});
// --- End Graceful Shutdown ---