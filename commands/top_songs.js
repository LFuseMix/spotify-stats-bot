// commands/top_songs.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
// *** Ensure getDbInstance is imported ***
const { getUser, getTopSongs, getDbInstance } = require('../utils/database'); // Make sure getDbInstance is here
const { getTimestampsForPeriod, formatDuration } = require('../utils/dateUtils');
const { generateProgressBar } = require('../utils/progressBar');
const config = require('../config.json');

// Spotify attribution constants
const SPOTIFY_LOGO_URL = 'https://developer.spotify.com/images/guidelines/design/icon4@2x.png'; // Official Spotify Icon

// Function to create Spotify track URL from URI
function getSpotifyUrlFromUri(uri) {
    if (!uri || !uri.startsWith('spotify:track:')) {
        return null;
    }
    const trackId = uri.split(':')[2];
    return `https://open.spotify.com/track/${trackId}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('top-songs')
        .setDescription('Shows your top songs for a given period.')
        .addIntegerOption(option =>
            option.setName('top')
                .setDescription('Number of songs to show (5, 10, or 15).')
                .setRequired(true)
                .addChoices(
                    { name: 'Top 5', value: 5 },
                    { name: 'Top 10', value: 10 },
                    { name: 'Top 15', value: 15 }
                ))
        .addStringOption(option =>
            option.setName('period')
                .setDescription('The time period for the stats.')
                .setRequired(true)
                .addChoices(
                    { name: 'Last 7 Days', value: '7d' },
                    { name: 'Last Month', value: '1m' },
                    { name: 'Last 3 Months', value: '3m' },
                    { name: 'Last 6 Months', value: '6m' },
                    { name: 'Last Year', value: '1y' },
                    { name: 'All Time', value: 'all' }
                )),
    async execute(interaction) {
        const discordId = interaction.user.id;
        const limit = interaction.options.getInteger('top');
        const period = interaction.options.getString('period');

        const user = getUser(discordId);
        if (!user || !user.spotify_id) {
            return interaction.reply({ content: 'You need to connect your Spotify account first using `/connect`.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const { startTime, endTime, periodName } = getTimestampsForPeriod(period);

            // Enhanced debug logging
            console.log(`[Debug ${interaction.commandName}] Period: ${periodName}`);
            console.log(`[Debug ${interaction.commandName}] Start Time: ${startTime} (${new Date(startTime * 1000).toISOString()})`);
            console.log(`[Debug ${interaction.commandName}] End Time: ${endTime} (${new Date(endTime * 1000).toISOString()})`);
            console.log(`[Debug ${interaction.commandName}] Current Time: ${Math.floor(Date.now() / 1000)} (${new Date().toISOString()})`);

            const topSongsData = getTopSongs(discordId, limit, startTime, endTime); // This now includes spotify_track_uri

            // Check if the main query returned results
            if (!topSongsData || topSongsData.length === 0) {
                // If no results for the period, check if *any* data exists at all for the user
                // *** THIS IS THE BLOCK WHERE THE FIX IS NEEDED ***

                // --- START OF FIX ---
                // Get the database instance *before* trying to use it
                const db = getDbInstance();
                // Now use the db instance to prepare and run the check query
                const hasAnyData = db.prepare('SELECT 1 FROM history WHERE discord_id = ? LIMIT 1').get(discordId);
                // --- END OF FIX ---

                 if(hasAnyData) {
                    // Explain *why* no data might be found (ms_played filter for stats, or just no plays in window)
                    return interaction.editReply(`Couldn't find any songs matching your criteria in the ${periodName} period (note: requires plays > 3 seconds for stats). Try 'All Time' or check your upload.`);
                 } else {
                     return interaction.editReply(`I don't have any listening history stored for you yet. Use the \`/upload\` command first.`);
                 }
            }

            // --- Embed Building (Only runs if topSongsData has items) ---
            const embed = new EmbedBuilder()
                .setColor(user.embed_color || config.defaultEmbedColor)
                .setTitle(`🏆 ${interaction.user.username}'s Top ${topSongsData.length} Songs (${periodName})`);

            let description = '';
            const maxMsPlayed = topSongsData[0]?.total_ms_played || 1; // Use top song's time for scaling, avoid 0

            topSongsData.forEach((song, index) => {
                const progressBar = generateProgressBar(song.total_ms_played, maxMsPlayed);
                const trackUrl = getSpotifyUrlFromUri(song.spotify_track_uri);
                const trackNameDisplay = trackUrl
                    ? `[${song.track_name}](${trackUrl})` // Markdown link
                    : song.track_name; // Plain text

                description += `**${index + 1}. ${trackNameDisplay}**\n`; // Use the display name (link or text)
                description += `- ${song.artist_name}\n`;
                description += `   ${formatDuration(song.total_ms_played)} (${song.play_count} plays)\n`;
                if(progressBar) description += `   \`${progressBar}\`\n\n`; else description += `\n`;
            });

            embed.setDescription(description.trim());
            embed.setFooter({
                text: 'Data provided by Spotify',
                iconURL: SPOTIFY_LOGO_URL
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            // Log the error including which command failed
            console.error(`[${interaction.commandName} Error] User ${discordId}, Period ${period}:`, error);
            await interaction.editReply('An error occurred while fetching your top songs.'); // Keep generic user message
        }
    },
};