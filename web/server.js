// web/server.js
const express = require('express');
const { getSpotifyApi } = require('../utils/spotify'); // Only need the base api for auth code grant
const { linkSpotifyAccount, addUser } = require('../utils/database');
const querystring = require('node:querystring');

const stateStore = new Map(); // Simple in-memory store for state parameter (Discord ID)

function startWebServer(client, port) { // Pass discord client if needed later
    const app = express();

    // Endpoint to start the auth process (called by /connect command)
    // This isn't strictly needed as /connect generates the URL directly,
    // but can be useful for debugging or alternative flows.
    app.get('/login', (req, res) => {
         // In a real app, you'd likely get the discordId from a session or query param
         res.send('This endpoint is not directly used. Use the /connect command in Discord.');
    });


    // Spotify callback endpoint
    app.get('/callback', async (req, res) => {
        const code = req.query.code || null;
        const state = req.query.state || null;
        const error = req.query.error || null;

        console.log('[Callback] Received callback:', { code: !!code, state, error });

        if (error || !state || !stateStore.has(state)) {
            console.error('[Callback Error] State mismatch or error:', error || 'State mismatch/missing');
            return res.status(400).send(`
                <html><body>
                    <h2>Authentication Failed</h2>
                    <p>${error ? `Spotify Error: ${error}` : 'Invalid state parameter. Please try the /connect command again.'}</p>
                </body></html>
            `);
        }

        const discordId = stateStore.get(state);
        stateStore.delete(state); // Clean up state

        const spotifyApiInstance = getSpotifyApi(); // Use the singleton

        try {
            const data = await spotifyApiInstance.authorizationCodeGrant(code);
            const { access_token, refresh_token, expires_in } = data.body;

            console.log('[Callback] Tokens received for potential Discord ID:', discordId);

            // Use the access token to get the Spotify user ID
            spotifyApiInstance.setAccessToken(access_token);
            const me = await spotifyApiInstance.getMe();
            const spotifyId = me.body.id;
            const spotifyDisplayName = me.body.display_name || spotifyId;

            console.log(`[Callback] Linking Discord ID ${discordId} to Spotify ID ${spotifyId} (${spotifyDisplayName})`);

             // Ensure user exists in DB before linking
             addUser(discordId); // Add if not exists, ignore if exists

            // Store tokens and Spotify ID in the database
            linkSpotifyAccount(discordId, spotifyId, access_token, refresh_token, expires_in);

             // Inform the user via the web page (Discord interaction is handled separately)
             res.send(`
                 <html><body>
                     <h2>Authentication Successful!</h2>
                     <p>Successfully linked your Discord account (${discordId}) to Spotify account: <strong>${spotifyDisplayName}</strong>.</p>
                     <p>You can now close this window and use the bot commands in Discord.</p>
                 </body></html>
             `);

             // Optional: Send a DM to the user via the bot (requires fetching the user)
             try {
                  const discordUser = await client.users.fetch(discordId);
                  if(discordUser) {
                      await discordUser.send(`✅ Successfully connected your Spotify account (${spotifyDisplayName})! You can now use commands like \`/profile\` and \`/top-songs\`.`);
                  }
             } catch (dmError) {
                  console.warn(`[Callback] Could not send DM to user ${discordId}:`, dmError);
             }

        } catch (err) {
            console.error('[Callback Auth Grant Error] Could not exchange code for tokens or get user profile:', err.body || err.message);
             res.status(500).send(`
                 <html><body>
                     <h2>Authentication Failed</h2>
                     <p>An error occurred while communicating with Spotify. Please try again later.</p>
                     <pre>${err.message}</pre>
                 </body></html>
             `);
        }
    });

    app.listen(port, () => {
        // console.log(`[Web Server] Listening on http://localhost:${port}`); // Logging done in index.js
    });

    return app; // Return the app instance if needed elsewhere
}

// Function called by /connect command to store the state temporarily
function storeState(state, discordId) {
    stateStore.set(state, discordId);
    // Simple cleanup for old states (e.g., remove after 10 minutes)
    setTimeout(() => {
        if (stateStore.has(state)) {
            console.log(`[State Store] Cleaning up expired state: ${state}`);
            stateStore.delete(state);
        }
    }, 10 * 60 * 1000);
}

module.exports = { startWebServer, storeState };