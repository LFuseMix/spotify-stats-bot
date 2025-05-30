const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show information about all commands and get support.'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('Hershey 🎷 Help')
            .setDescription('Here are the available commands:')
            .addFields(
                { name: '/connect', value: 'Connect your Spotify account to the bot.' },
                { name: '/upload', value: 'Upload your Spotify extended streaming history ZIP file.' },
                { name: '/top-songs', value: 'View your top songs for a selected period. Use `user:@someone` to view others!' },
                { name: '/top-artists', value: 'View your top artists for a selected period. Use `user:@someone` to view others!' },
                { name: '/top-genres', value: 'View your top genres for a selected period. Use `user:@someone` to view others!' },
                { name: '/profile', value: 'See a summary of your Spotify profile and stats.' },
                { name: '/compare', value: 'Compare your stats with another user.' },
                { name: '/privacy', value: 'Control who can view your stats (public/private).' },
                { name: '/config-color', value: 'Customize your embed color and see progress bar preview.' },
                { name: '/roast', value: 'Get a playful roast of your music taste.' },
                { name: '/help', value: 'Show this help message.' },
            )
            .addFields({ name: 'Need more help?', value: '[Join our support server!](https://discord.gg/GJKQJjcsGA)' })
            .setFooter({ text: 'Hershey 🎷 - Your Spotify Stats Bot', iconURL: 'https://developer.spotify.com/images/guidelines/design/icon4@2x.png' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
}; 