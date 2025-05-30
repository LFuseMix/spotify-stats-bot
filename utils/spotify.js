// utils/spotify.js
const SpotifyWebApi = require('spotify-web-api-node');
const dotenv = require('dotenv');
const ngrok = require('ngrok');
const { getUser, updateUserTokens } = require('./database'); // Import DB functions
const Logger = require('./logger'); // Add our new logger

dotenv.config();

let spotifyApi; // Singleton instance
let currentRedirectUri = process.env.SPOTIFY_REDIRECT_URI; // Initial value

function getSpotifyApi() {
    if (!spotifyApi) {
        spotifyApi = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            redirectUri: currentRedirectUri,
        });
    }
    return spotifyApi;
}

// Function to update redirect URI dynamically after ngrok starts
function updateRedirectUri(newUri) {
    // Ensure spotifyApi is initialized before trying to set redirect URI
    if (!spotifyApi) {
        getSpotifyApi(); // Initialize it if not already done
    }
    spotifyApi.setRedirectURI(newUri);
    Logger.network('spotify', 'config', `Redirect URI updated to: ${newUri}`);
}


async function initializeNgrok(port) {
    try {
        Logger.network('ngrok', 'connect', 'Attempting to connect...');
        
        // Create ngrok tunnel
        const url = await ngrok.connect({
            port: port,
            proto: 'http',
            bind_tls: true // Force HTTPS for security
        });

        // Update the Spotify API with the new ngrok URL
        updateRedirectUri(`${url}/callback`);
        
        return url;
        
    } catch (error) {
        Logger.error('ngrok', 'Failed to initialize ngrok', error.message);
        
        if (error.message.includes('authentication failed')) {
            Logger.error('ngrok', 'Authentication failed - Check your NGROK_AUTH_TOKEN in the .env file');
        } else if (error.message.includes('address already in use')) {
            Logger.error('ngrok', `Port ${port} might already be in use by another application or ngrok instance`);
        } else if (error.message.includes('tunnel session expired')) {
            Logger.error('ngrok', 'Tunnel session expired or invalid - Restarting the bot might help');
        }
        
        try {
            await ngrok.disconnect().catch(e => Logger.warn('ngrok', 'Ngrok disconnect failed', e.message));
        } catch (disconnectError) {
            // Ignore disconnect errors during cleanup
        }
        return null;
    }
}

// Function to get an authenticated Spotify API instance for a specific user
async function getUserSpotifyApi(discordId) {
    const user = getUser(discordId);
    if (!user || !user.spotify_refresh_token) {
        Logger.warn('spotify', `No user or refresh token found for ${discordId}`);
        return null;
    }

    const userApi = new SpotifyWebApi({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri: spotifyApi.getRedirectURI(),
        accessToken: user.spotify_access_token,
        refreshToken: user.spotify_refresh_token
    });

    // Check if token needs refresh (with 10-minute buffer for safety)
    const now = Math.floor(Date.now() / 1000);
    const tokenExpiresAt = user.token_expires_at || 0;
    
    if (now >= (tokenExpiresAt - 600)) { // 10 minutes before expiry (increased buffer)
        Logger.network('spotify', 'refresh', `Refreshing token for user ${discordId}`);
        try {
            const refreshData = await userApi.refreshAccessToken();
            const newAccessToken = refreshData.body.access_token;
            const expiresIn = refreshData.body.expires_in || 3600; // Default 1 hour
            
            // Update database - pass expiresIn (duration), not expiresAt (timestamp)
            updateUserTokens(discordId, newAccessToken, user.spotify_refresh_token, expiresIn);
            
            // Update the API object
            userApi.setAccessToken(newAccessToken);
            
            Logger.success('spotify', `Token refreshed successfully for user ${discordId}`);
        } catch (error) {
            Logger.error('spotify', `Error refreshing token for user ${discordId}`, error.body?.error_description || error.message);
            
            if (error.body?.error === 'invalid_grant') {
                // Mark user as needing to reconnect by clearing their tokens
                try {
                    updateUserTokens(discordId, null, null, 0);
                    Logger.error('spotify', `Invalid refresh token for ${discordId} - Tokens cleared, user needs to /connect again`);
                } catch (updateError) {
                    Logger.error('spotify', `Failed to clear invalid tokens for user ${discordId}`, updateError.message);
                }
            }
            return null;
        }
    }

    // Final validation: make sure the token works
    try {
        await userApi.getMe();
        return userApi;
    } catch (validationError) {
        if (validationError.statusCode === 401) {
            Logger.warn('spotify', `Token validation failed for user ${discordId}`, 'Token may be expired or invalid');
            // Try one more refresh if we haven't already
            if (now < (tokenExpiresAt - 600)) {
                Logger.network('spotify', 'refresh', `Force refreshing apparently invalid token for user ${discordId}`);
                try {
                    const refreshData = await userApi.refreshAccessToken();
                    const newAccessToken = refreshData.body.access_token;
                    const expiresIn = refreshData.body.expires_in || 3600;
                    
                    updateUserTokens(discordId, newAccessToken, user.spotify_refresh_token, expiresIn);
                    userApi.setAccessToken(newAccessToken);
                    
                    Logger.success('spotify', `Force refresh successful for user ${discordId}`);
                    return userApi;
                } catch (retryError) {
                    Logger.error('spotify', `Force refresh failed for user ${discordId}`, retryError.message);
                    return null;
                }
            }
        }
        Logger.error('spotify', `Token validation failed for user ${discordId}`, validationError.message);
        return null;
    }
}

// Helper function to split an array into chunks
function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}


module.exports = {
    getSpotifyApi, // For initial auth URL generation
    updateRedirectUri, // To update after ngrok starts
    initializeNgrok,
    getUserSpotifyApi, // For making API calls on behalf of a user
    chunkArray, // Export chunkArray
};