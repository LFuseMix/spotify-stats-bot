// web/server.js
const express = require('express');
const { getSpotifyApi } = require('../utils/spotify'); // Only need the base api for auth code grant
const { linkSpotifyAccount, addUser } = require('../utils/database');
const querystring = require('node:querystring');
const SpotifyWebApi = require('spotify-web-api-node');
const Logger = require('../utils/logger'); // Add our new logger

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
        const { code, state, error } = req.query;
        Logger.network('callback', 'received', 'Received callback', `Code: ${!!code}, State: ${state}, Error: ${error || 'none'}`);

        if (error || !state || !code) {
            Logger.error('callback', 'State mismatch or error', error || 'State mismatch/missing');
            return res.status(400).send('Authorization failed or invalid request.');
        }

        const storedState = stateStore.get(state);
        if (!storedState) {
            return res.status(400).send('Invalid or expired state parameter.');
        }

        stateStore.delete(state); // Clean up used state
        const discordId = storedState.discordId;

        try {
            // Use the main SpotifyApi instance that has the correct redirect URI
            const spotifyApi = getSpotifyApi();

            const data = await spotifyApi.authorizationCodeGrant(code);
            Logger.success('callback', 'Tokens received for potential Discord ID', discordId);

            const accessToken = data.body['access_token'];
            const refreshToken = data.body['refresh_token'];
            const expiresIn = data.body['expires_in'];

            spotifyApi.setAccessToken(accessToken);
            const me = await spotifyApi.getMe();
            const spotifyId = me.body.id;
            const spotifyDisplayName = me.body.display_name || spotifyId;

            Logger.success('callback', `Linking Discord ID ${discordId} to Spotify ID ${spotifyId}`, `Display Name: ${spotifyDisplayName}`);

            // Save to database
            const result = linkSpotifyAccount(discordId, spotifyId, accessToken, refreshToken, expiresIn);
            
            if (result.success) {
                res.send(`
                    <html>
                        <head><title>Spotify Connected</title></head>
                        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                            <h1 style="color: #1DB954;">✅ Success!</h1>
                            <p>Your Spotify account has been successfully linked!</p>
                            <p><strong>Spotify Account:</strong> ${spotifyDisplayName}</p>
                            <p>You can now close this window and return to Discord.</p>
                        </body>
                    </html>
                `);

                // Try to DM the user
                try {
                    const user = await client.users.fetch(discordId);
                    await user.send('🎵 Your Spotify account has been successfully connected! You can now use music commands.');
                } catch (dmError) {
                    Logger.warn('callback', `Could not send DM to user ${discordId}`, dmError.message);
                }
            } else {
                res.status(500).send('Database error occurred while linking your account.');
            }

        } catch (err) {
            Logger.error('callback', 'Could not exchange code for tokens or get user profile', err.body?.error_description || err.message);
            res.status(500).send('Failed to authenticate with Spotify.');
        }
    });

    app.listen(port, () => {
        // console.log(`[Web Server] Listening on http://localhost:${port}`); // Logging done in index.js
    });

    return app; // Return the app instance if needed elsewhere
}

// Function called by /connect command to store the state temporarily
function storeState(state, discordId) {
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes from now
    stateStore.set(state, { discordId, expiresAt });
    
    // Simple cleanup for old states (e.g., remove after 10 minutes)
    setTimeout(() => {
        if (stateStore.has(state)) {
            Logger.info('state cleanup', `Cleaning up expired state: ${state}`);
            stateStore.delete(state);
        }
    }, 10 * 60 * 1000);
}

// Cleanup expired states every hour
setInterval(() => {
    const now = Date.now();
    for (const [state, data] of stateStore.entries()) {
        if (now > data.expiresAt) {
            Logger.info('state cleanup', `Cleaning up expired state: ${state}`);
            stateStore.delete(state);
        }
    }
}, 60 * 60 * 1000); // 1 hour

module.exports = { startWebServer, storeState };