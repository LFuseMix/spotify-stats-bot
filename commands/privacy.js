const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, updateUserPrivacy, isUserProfilePublic } = require('../utils/database');
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('privacy')
        .setDescription('Control who can view your Spotify stats.')
        .addStringOption(option =>
            option.setName('setting')
                .setDescription('Choose your privacy setting.')
                .setRequired(true)
                .addChoices(
                    { name: 'Show Profile - Others can view my stats', value: 'public' },
                    { name: 'Hide Profile - Keep my stats private', value: 'private' }
                )),
    async execute(interaction) {
        const discordId = interaction.user.id;
        const setting = interaction.options.getString('setting');

        const user = getUser(discordId);
        if (!user || !user.spotify_id) {
            return interaction.reply({ 
                content: 'You need to connect your Spotify account first using `/connect` before setting privacy preferences.', 
                ephemeral: true 
            });
        }

        try {
            const isPublic = setting === 'public';
            const updated = updateUserPrivacy(discordId, isPublic);

            if (updated) {
                const embed = new EmbedBuilder()
                    .setColor(user.embed_color || config.defaultEmbedColor)
                    .setTitle('🔒 Privacy Settings Updated')
                    .setDescription(
                        isPublic 
                            ? '**Profile is now PUBLIC** 📊\nOther users can view your top songs, artists, and genres using commands like `/top-songs user:@yourusername`.'
                            : '**Profile is now PRIVATE** 🔐\nYour stats are hidden from other users. Only you can view your Spotify statistics.'
                    )
                    .addFields({
                        name: '💡 How it works',
                        value: isPublic 
                            ? 'Users can now include your username in stat commands to see your music taste!'
                            : 'Your listening data remains completely private and secure.',
                        inline: false
                    })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                await interaction.reply({ 
                    content: `Your profile is already set to ${setting}. No changes made.`, 
                    ephemeral: true 
                });
            }
        } catch (error) {
            console.error(`[Privacy Error] User ${discordId}:`, error);
            await interaction.reply({ 
                content: 'An error occurred while updating your privacy settings.', 
                ephemeral: true 
            });
        }
    },
}; 