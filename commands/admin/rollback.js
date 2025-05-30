const { SlashCommandBuilder } = require('discord.js');
const { rollbackUser } = require('../../utils/database'); // Assuming you have a rollbackUser function
const config = require('../../config.json');
const moderators = require('../../moderators.json');
const { getTimestampsForPeriod } = require('../../utils/dateUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rollback')
        .setDescription('[MOD ONLY] Rolls back a user\'s data for a specified period.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose data will be rolled back.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('period')
                .setDescription('The period to roll back data for.')
                .setRequired(true)
                .addChoices(
                    { name: 'Last 7 Days', value: '7d' }, { name: 'Last Month', value: '1m' },
                    { name: 'Last 3 Months', value: '3m' }, { name: 'Last 6 Months', value: '6m' },
                    { name: 'Last Year', value: '1y' }
                )),
    async execute(interaction) {
        // Check if the command is used in the support server
        if (interaction.guildId !== config.supportServerId) {
            return interaction.reply({ content: 'This command can only be used in the support server.', ephemeral: true });
        }

        // Check if the user is a moderator
        if (!moderators.moderatorIds.includes(interaction.user.id)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const userToRollback = interaction.options.getUser('user');
        const period = interaction.options.getString('period');
        const discordId = userToRollback.id;

        try {
            await interaction.deferReply({ ephemeral: true });

            const { startTime, endTime, periodName } = getTimestampsForPeriod(period);

            // Assuming rollbackUser function returns a success boolean or throws an error
            const success = rollbackUser(discordId, startTime, endTime); // You'll need to implement this DB function

            if (success) {
                await interaction.editReply({ content: `Successfully rolled back data for user ${userToRollback.tag} (${discordId}) for the ${periodName}.` });
                console.log(`[Admin] Moderator ${interaction.user.tag} rolled back data for ${userToRollback.tag} (${discordId}) for period ${periodName}.`);
            } else {
                await interaction.editReply({ content: `Failed to roll back data for user ${userToRollback.tag} for the ${periodName}. Check logs.` });
            }
        } catch (error) {
            console.error(`[Rollback Command Error] Moderator ${interaction.user.tag}, Target User ${discordId}, Period ${period}:`, error);
            await interaction.editReply('An error occurred while trying to roll back user data. Please check the logs.');
        }
    },
}; 