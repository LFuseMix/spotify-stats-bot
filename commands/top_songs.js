// commands/top_songs.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
// *** Ensure getDbInstance is imported ***
const { getUser, getTopSongs, getDbInstance, getTotalStatsForPeriod, isUserProfilePublic, getUserByDiscordId } = require('../utils/database'); // Make sure getDbInstance is here
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
                ))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View another user\'s top songs (they must have public profile).')
                .setRequired(false)
        ),
    async execute(interaction) {
        const requestingUserId = interaction.user.id;
        const targetUser = interaction.options.getUser('user');
        const targetUserId = targetUser ? targetUser.id : requestingUserId;
        const limit = interaction.options.getInteger('top');
        const period = interaction.options.getString('period');

        // Check if viewing another user's stats
        const isViewingOtherUser = targetUserId !== requestingUserId;

        // Get requesting user info (for embed color, etc.)
        const requestingUser = getUser(requestingUserId);
        if (!requestingUser || !requestingUser.spotify_id) {
            return interaction.reply({ content: 'You need to connect your Spotify account first using `/connect`.', ephemeral: true });
        }

        // Get target user info
        const user = getUserByDiscordId(targetUserId);
        if (!user || !user.spotify_id) {
            if (isViewingOtherUser) {
                return interaction.reply({ content: `${targetUser.username} hasn't connected their Spotify account yet.`, ephemeral: true });
            } else {
                return interaction.reply({ content: 'You need to connect your Spotify account first using `/connect`.', ephemeral: true });
            }
        }

        // Privacy check for viewing other users
        if (isViewingOtherUser) {
            const isPublic = isUserProfilePublic(targetUserId);
            if (!isPublic) {
                return interaction.reply({ 
                    content: `${targetUser.username}'s profile is private. They need to use \`/privacy setting:public\` to allow others to view their stats.`, 
                    ephemeral: true 
                });
            }
        }

        await interaction.deferReply();

        try {
            const { startTime, endTime, periodName } = getTimestampsForPeriod(period);

            // Enhanced debug logging
            console.log(`[Debug ${interaction.commandName}] Period: ${periodName}`);
            console.log(`[Debug ${interaction.commandName}] Start Time: ${startTime} (${new Date(startTime * 1000).toISOString()})`);
            console.log(`[Debug ${interaction.commandName}] End Time: ${endTime} (${new Date(endTime * 1000).toISOString()})`);
            console.log(`[Debug ${interaction.commandName}] Current Time: ${Math.floor(Date.now() / 1000)} (${new Date().toISOString()})`);

            const topSongsData = getTopSongs(targetUserId, limit, startTime, endTime); // This now includes spotify_track_uri
            
            // Get total stats for the period
            const totalStats = getTotalStatsForPeriod(targetUserId, startTime, endTime);

            // Log the raw data received from getTopSongs
            console.log(`[Debug ${interaction.commandName}] Raw topSongsData from DB:`, JSON.stringify(topSongsData, null, 2));

            // Check if the main query returned results
            if (!topSongsData || topSongsData.length === 0) {
                // If no results for the period, check if *any* data exists at all for the user
                // *** THIS IS THE BLOCK WHERE THE FIX IS NEEDED ***

                // --- START OF FIX ---
                // Get the database instance *before* trying to use it
                const db = getDbInstance();
                // Now use the db instance to prepare and run the check query
                const hasAnyData = db.prepare('SELECT 1 FROM history WHERE discord_id = ? LIMIT 1').get(targetUserId);
                // --- END OF FIX ---

                 if(hasAnyData) {
                    // Explain *why* no data might be found (ms_played filter for stats, or just no plays in window)
                    const userName = isViewingOtherUser ? targetUser.username : 'you';
                    return interaction.editReply(`Couldn't find any songs matching the criteria for ${userName} in the ${periodName} period (note: requires plays > 3 seconds for stats). Try 'All Time' or check the upload.`);
                 } else {
                     const userName = isViewingOtherUser ? targetUser.username : 'you';
                     return interaction.editReply(`I don't have any listening history stored for ${userName} yet. ${isViewingOtherUser ? 'They need' : 'You need'} to use the \`/upload\` command first.`);
                 }
            }

            // --- Embed Building (Only runs if topSongsData has items) ---
            const displayName = isViewingOtherUser ? targetUser.username : interaction.user.username;
            const embed = new EmbedBuilder()
                .setColor(user.embed_color || config.defaultEmbedColor)
                .setTitle(`🏆 ${displayName}'s Top ${topSongsData.length} Songs (${periodName})`)
                .addFields({
                    name: '📊 Total Period Activity',
                    value: `**Total Listening Time:** ${formatDuration(totalStats.totalMsPlayed)}\n**All Songs Played:** ${totalStats.totalPlayCount.toLocaleString()} plays`,
                    inline: false
                });

            // Add privacy indicator if viewing someone else's profile
            if (isViewingOtherUser) {
                embed.setFooter({
                    text: `${targetUser.username} has a public profile • Data provided by Spotify`,
                    iconURL: SPOTIFY_LOGO_URL
                });
            } else {
                embed.setFooter({
                    text: 'Data provided by Spotify',
                    iconURL: SPOTIFY_LOGO_URL
                });
            }

            let description = '';
            const maxMsPlayed = topSongsData[0]?.total_ms_played || 1; // Use top song's time for scaling, avoid 0

            topSongsData.forEach((song, index) => {
                const progressBar = generateProgressBar(song.total_ms_played, maxMsPlayed, user.embed_color);
                const trackUrl = getSpotifyUrlFromUri(song.spotify_track_uri);
                const trackNameDisplay = trackUrl
                    ? `[${song.track_name}](${trackUrl})` // Markdown link
                    : song.track_name; // Plain text

                description += `**${index + 1}. ${trackNameDisplay}** by ${song.artist_name}\n`; // Use the display name (link or text)
                description += `${formatDuration(song.total_ms_played)} • ${song.play_count} plays\n`;
                if(progressBar) description += `${progressBar}\n\n`; else description += `\n`;
            });

            embed.setDescription(description.trim());

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            // Log the error including which command failed
            console.error(`[${interaction.commandName} Error] User ${targetUserId}, Period ${period}:`, error);
            await interaction.editReply('An error occurred while fetching the top songs.'); // Keep generic user message
        }
    },
};