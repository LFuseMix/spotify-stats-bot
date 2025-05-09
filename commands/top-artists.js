// commands/top_artists.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
// *** Ensure getDbInstance is imported ***
const { getUser, getTopArtists, getDbInstance } = require('../utils/database');
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

            // Log the time range for debugging
             console.log(`[Debug ${interaction.commandName}] Period: ${periodName}, Start Time: ${startTime} (${new Date(startTime * 1000).toISOString()}), End Time: ${endTime} (${new Date(endTime * 1000).toISOString()})`);

            const topArtistsData = getTopArtists(discordId, limit, startTime, endTime);

            if (!topArtistsData || topArtistsData.length === 0) {
                 // Provide specific feedback based on whether ANY data exists for the user
                 // *** Ensure db instance is retrieved ***
                 const db = getDbInstance();
                 const hasAnyData = db.prepare('SELECT 1 FROM history WHERE discord_id = ? LIMIT 1').get(discordId);
                 if(hasAnyData) {
                     // Explain *why* no data might be found (ms_played filter)
                     return interaction.editReply(`Couldn't find any artists matching your criteria in the ${periodName} period (note: requires plays > 3 seconds). Try 'All Time' or check your upload.`);
                 } else {
                     return interaction.editReply(`I don't have any listening history stored for you yet. Use the \`/upload\` command first.`);
                 }
            }

            // --- Embed Building ---
            const embed = new EmbedBuilder()
                .setColor(user.embed_color || config.defaultEmbedColor)
                .setTitle(`🧑‍🎤 ${interaction.user.username}'s Top ${topArtistsData.length} Artists (${periodName})`);

            let description = '';
            const maxMsPlayed = topArtistsData[0]?.total_ms_played || 1;

            topArtistsData.forEach((artist, index) => {
                const progressBar = generateProgressBar(artist.total_ms_played, maxMsPlayed);
                description += `**${index + 1}. ${artist.artist_name}**\n`;
                description += `   ${formatDuration(artist.total_ms_played)} (${artist.total_plays} plays across ${artist.unique_tracks} tracks)\n`;
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
            await interaction.editReply('An error occurred while fetching your top artists.'); // Keep generic user message
        }
    },
};