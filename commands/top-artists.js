// commands/top_artists.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
// *** Ensure getDbInstance is imported ***
const { getUser, getTopArtists, getDbInstance, getTotalStatsForPeriod, isUserProfilePublic, getUserByDiscordId } = require('../utils/database');
const { getTimestampsForPeriod, formatDuration } = require('../utils/dateUtils');
const { generateProgressBar } = require('../utils/progressBar');
const config = require('../config.json');

// Spotify attribution constants
const SPOTIFY_LOGO_URL = 'https://developer.spotify.com/images/guidelines/design/icon4@2x.png'; // Official Spotify Icon

module.exports = {
    data: new SlashCommandBuilder()
        .setName('top-artists')
        .setDescription('Shows your top artists for a given period.')
        .addIntegerOption(option =>
            option.setName('top')
                .setDescription('Number of artists to show (5, 10, or 15).')
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
                .setDescription('View another user\'s top artists (they must have public profile).')
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

            // Log the time range for debugging
             console.log(`[Debug ${interaction.commandName}] Period: ${periodName}, Start Time: ${startTime} (${new Date(startTime * 1000).toISOString()}), End Time: ${endTime} (${new Date(endTime * 1000).toISOString()})`);

            const topArtistsData = getTopArtists(targetUserId, limit, startTime, endTime);
            
            // Get total stats for the period
            const totalStats = getTotalStatsForPeriod(targetUserId, startTime, endTime);

            if (!topArtistsData || topArtistsData.length === 0) {
                 // Provide specific feedback based on whether ANY data exists for the user
                 // *** Ensure db instance is retrieved ***
                 const db = getDbInstance();
                 const hasAnyData = db.prepare('SELECT 1 FROM history WHERE discord_id = ? LIMIT 1').get(targetUserId);
                 if(hasAnyData) {
                     // Explain *why* no data might be found (ms_played filter)
                     const userName = isViewingOtherUser ? targetUser.username : 'you';
                     return interaction.editReply(`Couldn't find any artists matching the criteria for ${userName} in the ${periodName} period (note: requires plays > 3 seconds). Try 'All Time' or check the upload.`);
                 } else {
                     const userName = isViewingOtherUser ? targetUser.username : 'you';
                     return interaction.editReply(`I don't have any listening history stored for ${userName} yet. ${isViewingOtherUser ? 'They need' : 'You need'} to use the \`/upload\` command first.`);
                 }
            }

            // --- Embed Building ---
            const displayName = isViewingOtherUser ? targetUser.username : interaction.user.username;
            const embed = new EmbedBuilder()
                .setColor(user.embed_color || config.defaultEmbedColor)
                .setTitle(`🧑‍🎤 ${displayName}'s Top ${topArtistsData.length} Artists (${periodName})`)
                .addFields({
                    name: '📊 Total Period Activity',
                    value: `**Total Listening Time:** ${formatDuration(totalStats.totalMsPlayed)}\n**All Songs Played:** ${totalStats.totalPlayCount.toLocaleString()} plays`,
                    inline: false
                });

            let description = '';
            const maxMsPlayed = topArtistsData[0]?.total_ms_played || 1;

            topArtistsData.forEach((artist, index) => {
                const progressBar = generateProgressBar(artist.total_ms_played, maxMsPlayed, user.embed_color);
                description += `**${index + 1}. ${artist.artist_name}**\n`;
                description += `${formatDuration(artist.total_ms_played)} • ${artist.total_plays} plays across ${artist.unique_tracks} tracks\n`;
                if(progressBar) description += `${progressBar}\n\n`; else description += `\n`;
            });

            embed.setDescription(description.trim());
            
            // Add appropriate footer based on viewing mode
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

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            // Log the error including which command failed
            console.error(`[${interaction.commandName} Error] User ${targetUserId}, Period ${period}:`, error);
            await interaction.editReply('An error occurred while fetching the top artists.'); // Keep generic user message
        }
    },
};