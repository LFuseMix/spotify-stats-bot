const { SlashCommandBuilder } = require('discord.js');
const { clearUserData } = require('../../utils/database'); // Changed from deleteUser to clearUserData
const config = require('../../config.json');
const moderators = require('../../moderators.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deleteuserhistory')
        .setDescription('[MOD ONLY] Deletes all data for a specified user.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose data will be deleted.')
                .setRequired(true)),
    async execute(interaction) {
        // Check if the command is used in the support server
        if (interaction.guildId !== config.supportServerId) {
            return interaction.reply({ content: 'This command can only be used in the support server.', ephemeral: true });
        }

        // Check if the user is a moderator
        if (!moderators.moderatorIds.includes(interaction.user.id)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const userToDelete = interaction.options.getUser('user');
        const discordId = userToDelete.id;

        try {
            await interaction.deferReply({ ephemeral: true });
            // Assuming clearUserData function returns an object with a success boolean or throws an error
            const result = clearUserData(discordId); // Changed from deleteUser to clearUserData

            if (result.success) {
                await interaction.editReply({ content: `Successfully deleted all data for user ${userToDelete.tag} (${discordId}).` });
                console.log(`[Admin] Moderator ${interaction.user.tag} deleted data for ${userToDelete.tag} (${discordId}).`);
            } else {
                await interaction.editReply({ content: `Failed to delete data for user ${userToDelete.tag}. Check logs.` });
            }
        } catch (error) {
            console.error(`[DeleteUserHistory Command Error] Moderator ${interaction.user.tag}, Target User ${discordId}:`, error);
            await interaction.editReply('An error occurred while trying to delete user data. Please check the logs.');
        }
    },
}; 