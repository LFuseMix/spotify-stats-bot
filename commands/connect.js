// commands/connect.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { getSpotifyApi } = require('../utils/spotify');
const { storeState } = require('../web/server'); // Import state storing function
const crypto = require('node:crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('connect')
        .setDescription('Connect your Spotify account to the bot.'),
    async execute(interaction) {
        const discordId = interaction.user.id;

        // 1. Generate a random 'state' string to prevent CSRF attacks
        const state = crypto.randomBytes(16).toString('hex');
        storeState(state, discordId); // Store the state -> discordId mapping

        // 2. Define Spotify scopes
        const scopes = [
            'user-read-private',       // Read user profile
            'user-read-email',         // Read user email (optional, but good practice)
            // Add scopes needed for stats, even if using history files primarily
            'user-top-read',           // Read top artists/tracks
            'user-read-recently-played', // Read recently played (for potential future features)
            // 'playlist-read-private', // Add if you want playlist features
            // 'playlist-read-collaborative',
        ];

        // 3. Create the authorization URL
        const spotifyApiInstance = getSpotifyApi(); // Use the singleton
        const authorizeURL = spotifyApiInstance.createAuthorizeURL(scopes, state);

        console.log(`[Connect] Generated auth URL for ${interaction.user.tag}: ${authorizeURL.substring(0, 80)}...`); // Don't log full URL with state usually

        // 4. Send the URL to the user ephemerally
        await interaction.reply({
            content: `Please connect your Spotify account by visiting this link:\n\n${authorizeURL}\n\n**Important:** Make sure the website you land on is \`accounts.spotify.com\`! The link will expire in 10 minutes.`,
            ephemeral: true,
        });
    },
};