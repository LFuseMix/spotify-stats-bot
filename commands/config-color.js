// commands/config_color.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, updateUserColor } = require('../utils/database');
const { generateProgressBar } = require('../utils/progressBar');
const config = require('../config.json');

// Map color names to hex codes
const colorMap = {
    red: '#FF0000',
    purple: '#8A2BE2', // BlueViolet
    green: '#1DB954', // Spotify Green
    orange: '#FFA500',
    blue: '#007bff', // Standard Blue
    yellow: '#FFFF00',
    pink: '#FFC0CB',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config-color')
        .setDescription('Sets the embed color for your stats commands.')
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Choose your preferred embed color.')
                .setRequired(true)
                .addChoices(
                    { name: 'Spotify Green', value: 'green' },
                    { name: 'Blue', value: 'blue' },
                    { name: 'Purple', value: 'purple' },
                    { name: 'Red', value: 'red' },
                    { name: 'Orange', value: 'orange' },
                    { name: 'Yellow', value: 'yellow' },
                    { name: 'Pink', value: 'pink' }
                    // Add more choices if desired
                )),
    async execute(interaction) {
        const discordId = interaction.user.id;
        const chosenColorName = interaction.options.getString('color');
        const hexColor = colorMap[chosenColorName.toLowerCase()];

        if (!hexColor) {
            // Should not happen with choices, but good failsafe
            return interaction.reply({ content: 'Invalid color selected.', ephemeral: true });
        }

        const user = getUser(discordId);
        if (!user) {
            // Should ideally not happen if command is usable, but check anyway
             return interaction.reply({ content: 'Could not find your user data. Try `/connect` first?', ephemeral: true });
        }

        try {
            const updated = updateUserColor(discordId, hexColor);

            if (updated) {
                // Generate a sample progress bar with the new color
                const sampleProgressBar = generateProgressBar(75, 100, hexColor);
                
                 const embed = new EmbedBuilder()
                    .setColor(hexColor) // Use the new color for confirmation
                    .setTitle('🎨 Embed Color Updated!')
                    .setDescription(`Your embed color has been set to **${chosenColorName}** (${hexColor}).`)
                    .addFields({
                        name: '📊 Progress Bar Preview',
                        value: `Sample Song Name by Artist Name\n4:32 • 127 plays ${sampleProgressBar}`,
                        inline: false
                    })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                 // This might happen if the color was already set to the chosen value
                 await interaction.reply({ content: `Your embed color is already set to ${chosenColorName}. No changes made.`, ephemeral: true });
            }
        } catch (error) {
            console.error(`[Config Color Error] User ${discordId}:`, error);
            await interaction.reply({ content: 'An error occurred while updating your color preference.', ephemeral: true });
        }
    },
};