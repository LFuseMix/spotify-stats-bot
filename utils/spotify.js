// utils/spotify.js
const SpotifyWebApi = require('spotify-web-api-node');
const dotenv = require('dotenv');
const ngrok = require('ngrok');
const { getUser, updateUserTokens } = require('./database'); // Import DB functions

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
    currentRedirectUri = newUri;
    if (spotifyApi) {
        spotifyApi.setRedirectUri(newUri);
    }
    console.log(`[Spotify Util] Redirect URI updated to: ${newUri}`);
}


async function initializeNgrok(port) {
    try {
        console.log('[Ngrok] Attempting to connect...');
        const url = await ngrok.connect({
            proto: 'http',
            addr: port,
            authtoken: process.env.NGROK_AUTH_TOKEN, // Use token if provided
            region: 'us' // Optional: Specify region (e.g., 'eu', 'ap', 'au', 'sa', 'jp', 'in')
        });
         // Update the redirect URI used by the API client instance
         updateRedirectUri(`${url}/callback`);
         // Also update the environment variable IF NEEDED elsewhere, though dynamic update is better
         // process.env.SPOTIFY_REDIRECT_URI = `${url}/callback`;
        return url;
    } catch (error) {
        console.error('[Ngrok Error] Failed to initialize ngrok:', error);
        // Provide specific advice based on common errors
         if (error.message.includes('authentication failed')) {
            console.error('[Ngrok Error] Authentication failed. Check your NGROK_AUTH_TOKEN in the .env file.');
         } else if (error.message.includes('bind: address already in use')) {
             console.error(`[Ngrok Error] Port ${port} might already be in use by another application or ngrok instance.`);
         } else if (error.message.includes('tunnel session not found')) {
             console.error('[Ngrok Error] Tunnel session expired or invalid. Restarting the bot might help.');
         }
         // Optionally try to disconnect if partially connected
         await ngrok.disconnect().catch(e => console.warn('Ngrok disconnect failed:', e));
        return null; // Indicate failure
    }
}

// Function to get an authenticated Spotify API instance for a specific user
async function getUserSpotifyApi(discordId) {
    const user = getUser(discordId);
    if (!user || !user.spotify_access_token || !user.spotify_refresh_token) {
        return null; // User not found or not linked
    }

    const userSpotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri: currentRedirectUri, // Use the current dynamic URI
        accessToken: user.spotify_access_token,
        refreshToken: user.spotify_refresh_token,
    });

    // Check if the token is expired (or close to expiring)
    const now = Math.floor(Date.now() / 1000);
    // Refresh if within 5 minutes of expiry
    if (user.token_expires_at && user.token_expires_at < now + 300) {
        console.log(`[Spotify Auth] Refreshing token for user ${discordId}`);
        try {
            const data = await userSpotifyApi.refreshAccessToken();
            const newAccessToken = data.body['access_token'];
            const newExpiresIn = data.body['expires_in'];
            // Note: Spotify might not return a new refresh token every time
            const newRefreshToken = data.body['refresh_token'] || user.spotify_refresh_token;

            userSpotifyApi.setAccessToken(newAccessToken);
            if (data.body['refresh_token']) {
                 userSpotifyApi.setRefreshToken(newRefreshToken);
            }

            // Update the database
            updateUserTokens(discordId, newAccessToken, newRefreshToken, newExpiresIn);
            console.log(`[Spotify Auth] Token refreshed successfully for user ${discordId}`);
        } catch (error) {
            console.error(`[Spotify Auth] Error refreshing token for user ${discordId}:`, error.body || error.message);
            // Handle specific errors, e.g., invalid refresh token might require re-authentication
             if (error.statusCode === 400 && error.body?.error === 'invalid_grant') {
                 console.error(`[Spotify Auth] Invalid refresh token for ${discordId}. User needs to /connect again.`);
                 // Potentially clear the invalid tokens from DB? Or mark user as needing re-auth.
                 // Example: clearUserTokens(discordId);
             }
            return null; // Indicate failure to refresh
        }
    }

    return userSpotifyApi;
}


module.exports = {
    getSpotifyApi, // For initial auth URL generation
    updateRedirectUri, // To update after ngrok starts
    initializeNgrok,
    getUserSpotifyApi, // For making API calls on behalf of a user
};