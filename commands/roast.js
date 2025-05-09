// commands/roast.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, getAllUserDataForPeriod } = require('../utils/database');
const { generateRoast } = require('../utils/aiHelper');
const { getTimestampsForPeriod } = require('../utils/dateUtils');
const config = require('../config.json');

// Spotify attribution constants
const SPOTIFY_LOGO_URL = 'https://developer.spotify.com/images/guidelines/design/icon4@2x.png'; // Official Spotify Icon

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roast')
        .setDescription('🔥 Get a sarcastic roast of your music taste from Hershey the dog.')
        .addStringOption(option =>
            option.setName('period')
                .setDescription('The time period Hershey should judge you on.')
                .setRequired(true)
                .addChoices(
                     { name: 'Last 7 Days', value: '7d' }, { name: 'Last Month', value: '1m' },
                    { name: 'Last 3 Months', value: '3m' }, { name: 'Last 6 Months', value: '6m' },
                    { name: 'Last Year', value: '1y' }, { name: 'All Time', value: 'all' }
                )),
    async execute(interaction) {
        const discordId = interaction.user.id;
        const period = interaction.options.getString('period');

        const user = getUser(discordId);
        if (!user?.spotify_id) { return interaction.reply({ content: 'Hershey can\'t roast you without a Spotify connection! Use `/connect`.', ephemeral: true }); }

        await interaction.deferReply();

        try {
            const { startTime, endTime, periodName } = getTimestampsForPeriod(period);
            const userData = getAllUserDataForPeriod(discordId, startTime, endTime);

            if (!userData || userData.totalMsListened <= 0) { return interaction.editReply(`Hershey sniffed around but found no listening data for you in the ${periodName}. Nothing to roast... yet. 😒`); }
            if (!process.env.GEMINI_API_KEY) { console.error("[Roast Command] Missing GEMINI_API_KEY."); return interaction.editReply("AI features aren't configured correctly."); }

            const roastMessage = await generateRoast(userData, periodName);

            const embed = new EmbedBuilder()
                .setColor(user.embed_color || config.defaultEmbedColor)
                .setTitle(`🦴 Hershey's Roast (${periodName})`)
                .setAuthor({ name: 'Hershey says...', iconURL: 'https://i.imgur.com/saLzGb8.png' }) // Optional icon
                .setDescription(roastMessage || "...")
                .setTimestamp()
                 // *** MODIFIED: Add footer attribution ***
                .setFooter({ text: `Roasting ${interaction.user.username}. Data provided by Spotify`, iconURL: SPOTIFY_LOGO_URL });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`[Roast Command Error] User ${discordId}, Period ${period}:`, error);
            await interaction.editReply('Ruh-roh! Hershey got distracted by a squirrel and couldn\'t finish the roast.');
        }
    },
};