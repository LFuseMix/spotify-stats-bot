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
const cron = require('node-cron'); // Added for log rotation
const { cleanOldLogEntries } = require('./utils/logRotator'); // Added for log rotation
const { manageLogCleanupState, shouldRunCleanup } = require('./utils/logCleanupStateManager'); // Added for log rotation state
const Logger = require('./utils/logger'); // Add our new logger
const { displayShutdownSummary, trackCommandUsage } = require('./utils/shutdownStats'); // Add shutdown stats

// Store bot start time for uptime calculation
const BOT_START_TIME = Date.now();

dotenv.config();

// --- Environment Variable Checks ---
const requiredEnv = ['DISCORD_TOKEN', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'GEMINI_API_KEY', 'PORT'];
const missingEnv = requiredEnv.filter(envVar => !process.env[envVar]);
if (missingEnv.length > 0) {
    Logger.error('startup', 'Missing required environment variables', missingEnv.join(', '));
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

// Function to recursively find all .js files in a directory (same as in deploy-commands.js)
function findCommandFiles(directory) {
    let commandFiles = [];
    const files = fs.readdirSync(directory, { withFileTypes: true });

    for (const file of files) {
        const filePath = path.join(directory, file.name);
        if (file.isDirectory()) {
            commandFiles = commandFiles.concat(findCommandFiles(filePath));
        } else if (file.name.endsWith('.js')) {
            commandFiles.push(filePath);
        }
    }
    return commandFiles;
}

const commandFiles = findCommandFiles(commandsPath); // Use the recursive function

for (const filePath of commandFiles) { // Iterate over full file paths
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        Logger.info('commands', `Loaded command: ${command.data.name}`);
    } else {
        Logger.warn('commands', `Command missing required properties`, `File: ${filePath}`);
    }
}

// --- Variable for Tracking Interval ---
let recentTrackInterval = null; // Holds the interval ID for shutdown
let dailyLogCleanupTask = null; // Holds the cron task for log cleanup

// --- Event Handling ---
client.once('ready', async () => {
    Logger.system(`Hershey 🎷 logged in as ${client.user.tag}!`);
    client.user.setActivity('your Spotify stats 🎷', { type: ActivityType.Watching }); // Use ActivityType enum

    // Initialize Database
    try {
        initializeDatabase();
        Logger.success('database', 'Database initialized successfully');
    } catch (dbError) {
        Logger.error('database', 'Failed to initialize database', dbError.message);
        process.exit(1);
    }

    // Start Web Server & Ngrok
    try {
        const port = process.env.PORT || 8888;
        const ngrokUrl = await initializeNgrok(port);
        if (ngrokUrl) {
            Logger.network('ngrok', 'connect', `Tunnel running at: ${ngrokUrl}`);
            Logger.info('spotify', 'IMPORTANT: Update SPOTIFY_REDIRECT_URI in Spotify Developer Dashboard', `${ngrokUrl}/callback`);
            // Dynamic update happens inside initializeNgrok now via updateRedirectUri
            startWebServer(client, port);
            Logger.network('web server', 'start', `Listening on port ${port} for Spotify callback`);

            // --- Start Recent Track Polling AFTER everything is ready ---
            startRecentTrackPolling(); // Call the new function

            // --- Initialize and Schedule Log Cleanup ---
            if (await shouldRunCleanup()) {
                Logger.info('startup', 'Running initial log cleanup check...');
                await cleanOldLogEntries();
                await manageLogCleanupState.updateLastCleanupDate();
            }
            // Schedule daily cleanup at midnight
            // cron.schedule(expression, callback, options)
            // expression: second (0-59, optional) minute (0-59) hour (0-23) day_of_month (1-31) month (1-12) day_of_week (0-7, 0 or 7 is Sun)
            dailyLogCleanupTask = cron.schedule('0 0 * * *', async () => { // Every day at midnight
                Logger.info('cron', 'Running daily log cleanup...');
                await cleanOldLogEntries();
                await manageLogCleanupState.updateLastCleanupDate();
            }, {
                scheduled: true,
                timezone: "Etc/UTC" // Or your preferred timezone
            });
            Logger.success('cron', 'Log cleanup scheduled daily at midnight UTC');

        } else {
             Logger.error('ngrok', 'Failed to initialize Ngrok - Spotify authentication will not work');
             // process.exit(1); // Decide if critical
        }
    } catch (webError) {
        Logger.error('startup', 'Failed to start web server or Ngrok', webError.message);
        process.exit(1);
    }

    // Start the recent track polling
    startRecentTrackPolling();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
        Logger.error('interaction', `No command matching ${interaction.commandName} was found`);
        try { await interaction.reply({ content: 'Error: Command not found!', ephemeral: true }); }
        catch (replyError) { Logger.error('interaction', 'Failed to reply to unknown command', replyError.message); }
        return;
    }
    try {
        Logger.interaction(`${interaction.user.tag} (${interaction.user.id})`, interaction.commandName);
        
        // Track command usage for shutdown statistics
        trackCommandUsage(interaction.commandName);
        
        await command.execute(interaction);
    } catch (error) {
        Logger.error('interaction', `Error executing /${interaction.commandName}`, error.message);
        const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage).catch(followUpError => Logger.error('interaction', 'Failed to follow up after error', followUpError.message));
        } else {
            await interaction.reply(errorMessage).catch(replyError => Logger.error('interaction', 'Failed to reply with error', replyError.message));
        }
    }
});

// --- Recent Track Polling Functionality ---

const POLLING_INTERVAL_MS = 90 * 1000; // 1.5 minutes (was 1 minute) - more conservative to avoid rate limits
const DELAY_BETWEEN_USERS_MS = 1000; // 1 second delay between checking each user (was 0.5 seconds)

async function pollRecentTracks() {
    Logger.tracker('cycle_start', `🔄 Starting polling cycle - checking ${getAllConnectedUsers()?.length || 0} connected users`);
    
    const users = getAllConnectedUsers();
    if (!users || users.length === 0) {
        Logger.tracker('cycle_end', 'No connected users found to poll');
        return;
    }

    let totalFetched = 0;
    let totalAdded = 0;
    let totalSkipped = 0;
    let usersFailed = 0;

    for (const user of users) {
        try {
            const spotifyApi = await getUserSpotifyApi(user.discord_id); // Handles token refresh

            if (!spotifyApi) {
                Logger.warn('tracker', `Could not get valid Spotify API client for user ${user.discord_id}`, 'Skipping user');
                usersFailed++;
                continue;
            }

            // Fetch recently played tracks (max 50)
            const recentData = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 50 });

            if (recentData.body && recentData.body.items && recentData.body.items.length > 0) {
                totalFetched += recentData.body.items.length;
                const entriesToSave = [];

                for (const item of recentData.body.items) {
                    if (!item.track || !item.played_at || !item.track.name || !item.track.artists || item.track.artists.length === 0) {
                        continue;
                    }

                    // Convert played_at (ISO 8601 string) to Unix timestamp (seconds)
                    let timestampInSeconds;
                    try {
                        const playedAtDate = new Date(item.played_at);
                        if (isNaN(playedAtDate.getTime())) throw new Error('Invalid date parsed');
                        timestampInSeconds = Math.floor(playedAtDate.getTime() / 1000);
                    } catch (timeError) {
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
                    const result = addHistoryEntries(user.discord_id, entriesToSave, 'recent');
                    
                    // Log each individual new track that was added
                    if (result.addedTracks && result.addedTracks.length > 0) {
                        for (const track of result.addedTracks) {
                            Logger.tracker('new_track', `🎵 ${track.trackName} by ${track.artistName}`, `User: ${track.discordId}`);
                        }
                    }
                    
                    totalAdded += result.added;
                    totalSkipped += result.skipped;
                }
            }
        } catch (error) {
            usersFailed++;
            // Check for Spotify API errors by looking at error properties rather than using instanceof
            if (error.statusCode && error.body) {
                // This is likely a Spotify API error with status code and body
                const spotifyError = error.body?.error || {};
                const statusCode = error.statusCode;
                Logger.error('tracker', `Spotify API Error for user ${user.discord_id}`, `Status ${statusCode}: ${spotifyError.message || error.message}`);
                if (statusCode === 429) { 
                    Logger.warn('tracker', 'Rate limit hit', 'Consider increasing interval or delay'); 
                } else if (statusCode === 401 || statusCode === 403) { 
                    Logger.warn('tracker', `Auth error for user ${user.discord_id}`, 'User may need to /connect again'); 
                }
            } else {
                Logger.error('tracker', `Unexpected error processing user ${user.discord_id}`, error.message || error.toString());
            }
        }

        // Add a small delay before processing the next user to avoid hammering the API
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_USERS_MS));
    }

    if (totalAdded === 0 && totalSkipped === 0 && usersFailed === 0) {
        Logger.tracker('cycle_end', `✅ Polling complete - no new tracks found`);
    } else {
        Logger.tracker('cycle_end', `✅ Polling complete`, `New tracks: ${totalAdded}, Duplicates: ${totalSkipped}, Failed users: ${usersFailed}`);
    }
}

function startRecentTrackPolling() {
    if (recentTrackInterval) {
        Logger.warn('tracker', 'Polling interval already started');
        return;
    }
    Logger.tracker('start', `Starting recent track polling every ${POLLING_INTERVAL_MS / 1000 / 60} minutes`);
    // Run once immediately, then set interval
    pollRecentTracks().catch(err => Logger.error('tracker', 'Initial poll failed', err.message)); // Run initial poll
    recentTrackInterval = setInterval(() => {
        pollRecentTracks().catch(err => Logger.error('tracker', 'Poll cycle failed', err.message)); // Catch errors in interval calls
    }, POLLING_INTERVAL_MS);
}

// --- Login ---
client.login(process.env.DISCORD_TOKEN);

// --- Graceful Shutdown ---
const ngrok = require('ngrok'); // Ensure ngrok is required here

async function shutdown(signal) {
    Logger.section('GRACEFUL SHUTDOWN INITIATED', 'red');

    // 0. Display beautiful shutdown summary
    try {
        displayShutdownSummary(signal, BOT_START_TIME);
    } catch (error) {
        Logger.error('shutdown', 'Error displaying shutdown summary', error.message);
    }

    // 1. Stop Polling Interval
    if (recentTrackInterval) {
        Logger.shutdown('1', 'Stopping track polling interval...');
        clearInterval(recentTrackInterval);
        recentTrackInterval = null; // Clear variable
        Logger.success('shutdown', 'Polling interval stopped');
    }

    // Stop cron job
    if (dailyLogCleanupTask) {
        Logger.shutdown('2', 'Stopping daily log cleanup task...');
        dailyLogCleanupTask.stop();
        Logger.success('shutdown', 'Log cleanup task stopped');
    }

    // 2. Disconnect Ngrok
    try {
        Logger.shutdown('3', 'Disconnecting Ngrok...');
        await ngrok.disconnect();
        Logger.success('shutdown', 'Ngrok disconnected');
    } catch (err) {
        Logger.error('shutdown', 'Error disconnecting Ngrok', err.message);
    }

    // 3. Close Database Connection
    try {
        const db = getDbInstance();
        if (db && db.open) {
             Logger.shutdown('4', 'Closing database connection...');
             db.close((err) => { // Use callback for close confirmation/error
                 if (err) {
                     Logger.error('shutdown', 'Error closing database', err.message);
                 } else {
                     Logger.success('shutdown', 'Database connection closed');
                 }
             });
        }
    } catch (err) { // Catch errors from getDbInstance itself
        Logger.error('shutdown', 'Error getting DB instance for closing', err.message);
    }

    // 4. Destroy Discord Client
    Logger.shutdown('5', 'Destroying Discord client...');
    client.destroy();
    Logger.success('shutdown', 'Discord client destroyed');

    // 5. Exit Process - Use setTimeout to allow async close operations (like db.close) to attempt completion
    Logger.shutdown('6', 'Exiting process shortly...');
    setTimeout(() => process.exit(0), 1500); // Allow 1.5 seconds for cleanup
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', error => {
    Logger.error('fatal', 'Unhandled Promise Rejection', error.message);
    // Attempt shutdown but exit faster on unhandled errors
    shutdown('Unhandled Rejection').catch(() => {}).finally(() => setTimeout(() => process.exit(1), 500));
});
process.on('uncaughtException', error => {
    Logger.error('fatal', 'Uncaught Exception', error.message);
    shutdown('Uncaught Exception').catch(() => {}).finally(() => setTimeout(() => process.exit(1), 500));
});
// --- End Graceful Shutdown ---