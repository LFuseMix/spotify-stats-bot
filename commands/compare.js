// commands/compare.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, getAllUserDataForPeriod } = require('../utils/database');
const { generateComparison } = require('../utils/aiHelper');
const { getTimestampsForPeriod } = require('../utils/dateUtils');
const config = require('../config.json');

// Spotify attribution constants
const SPOTIFY_LOGO_URL = 'https://developer.spotify.com/images/guidelines/design/icon4@2x.png'; // Official Spotify Icon

module.exports = {
    data: new SlashCommandBuilder()
        .setName('compare')
        .setDescription('👀 Have Hershey compare your music taste with another user.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to compare your taste with.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('period')
                .setDescription('The time period for the comparison.')
                .setRequired(true)
                .addChoices(
                    { name: 'Last 7 Days', value: '7d' }, { name: 'Last Month', value: '1m' },
                    { name: 'Last 3 Months', value: '3m' }, { name: 'Last 6 Months', value: '6m' },
                    { name: 'Last Year', value: '1y' }, { name: 'All Time', value: 'all' }
                )),
    async execute(interaction) {
        const user1DiscordId = interaction.user.id;
        const user2 = interaction.options.getUser('user');
        const user2DiscordId = user2.id;
        const period = interaction.options.getString('period');

        if (user1DiscordId === user2DiscordId) {
             return interaction.reply({ content: "Hershey thinks comparing yourself to yourself is... narcissistic.", ephemeral: true });
        }
        if (user2.bot) {
             return interaction.reply({ content: "Hershey doesn't compare tastes with robots.", ephemeral: true });
        }

        const user1DataCheck = getUser(user1DiscordId);
        const user2DataCheck = getUser(user2DiscordId);

        if (!user1DataCheck?.spotify_id) { return interaction.reply({ content: 'You need to connect your Spotify account first!', ephemeral: true }); }
        if (!user2DataCheck?.spotify_id) { return interaction.reply({ content: `${user2.username} hasn't connected their Spotify account yet.`, ephemeral: true }); }

        await interaction.deferReply();

        try {
            const { startTime, endTime, periodName } = getTimestampsForPeriod(period);
            const user1Stats = getAllUserDataForPeriod(user1DiscordId, startTime, endTime);
            const user2Stats = getAllUserDataForPeriod(user2DiscordId, startTime, endTime);

            if (!user1Stats || user1Stats.totalMsListened <= 0) { return interaction.editReply(`You haven't listened to anything in the ${periodName} period.`); }
            if (!user2Stats || user2Stats.totalMsListened <= 0) { return interaction.editReply(`${user2.username} hasn't listened to anything in the ${periodName} period.`); }
            if (!process.env.GEMINI_API_KEY) { console.error("[Compare Command] Missing GEMINI_API_KEY."); return interaction.editReply("AI features aren't configured correctly."); }

            const user1Name = interaction.user.username;
            const user2Name = user2.username;
            const comparisonMessage = await generateComparison(user1Stats, user2Stats, user1Name, user2Name, periodName);

            const embed = new EmbedBuilder()
                .setColor(user1DataCheck.embed_color || config.defaultEmbedColor)
                .setTitle(`⚖️ ${user1Name} vs ${user2Name} (${periodName})`)
                 .setAuthor({ name: 'Hershey judges...', iconURL: 'https://i.imgur.com/saLzGb8.png' }) // Optional icon
                .setDescription(comparisonMessage || "...")
                .setTimestamp()
                // *** MODIFIED: Add footer attribution ***
                .setFooter({ text: `Taste Battle! Data provided by Spotify`, iconURL: SPOTIFY_LOGO_URL });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`[Compare Command Error] Users ${user1DiscordId} vs ${user2DiscordId}, Period ${period}:`, error);
            await interaction.editReply('Woof! The comparison machine jammed. Try again later.');
        }
    },
};