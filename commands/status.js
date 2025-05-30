const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../utils/database');
const { getUserSpotifyApi } = require('../utils/spotify');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check your Spotify connection status and account information.'),
    
    async execute(interaction) {
        const discordId = interaction.user.id;
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Check if user exists in database
            const user = getUser(discordId);
            if (!user || !user.spotify_id) {
                return interaction.editReply({
                    content: '❌ You haven\'t connected your Spotify account yet. Use `/connect` to get started!',
                });
            }
            
            // Check token status
            const now = Math.floor(Date.now() / 1000);
            const tokenExpiresAt = user.token_expires_at || 0;
            const timeUntilExpiry = tokenExpiresAt - now;
            
            let tokenStatus = '✅ Valid';
            let tokenDetails = `Expires in ${Math.round(timeUntilExpiry / 60)} minutes`;
            
            if (timeUntilExpiry <= 0) {
                tokenStatus = '⚠️ Expired';
                tokenDetails = 'Token has expired';
            } else if (timeUntilExpiry <= 600) { // 10 minutes
                tokenStatus = '⚠️ Expiring Soon';
                tokenDetails = `Expires in ${Math.round(timeUntilExpiry / 60)} minutes`;
            }
            
            // Try to get Spotify API instance (this will attempt refresh if needed)
            const spotifyApi = await getUserSpotifyApi(discordId);
            
            let connectionStatus = '❌ Failed';
            let spotifyProfile = null;
            
            if (spotifyApi) {
                try {
                    spotifyProfile = await spotifyApi.getMe();
                    connectionStatus = '✅ Connected';
                    tokenStatus = '✅ Valid'; // Update if we got here successfully
                    tokenDetails = 'Token working properly';
                } catch (apiError) {
                    connectionStatus = '❌ API Error';
                    tokenDetails = `Error: ${apiError.message}`;
                }
            }
            
            // Create status embed
            const embed = new EmbedBuilder()
                .setColor(user.embed_color || '#1DB954') // Spotify green
                .setTitle('🎵 Spotify Connection Status')
                .setThumbnail(spotifyProfile?.body?.images?.[0]?.url || null)
                .addFields([
                    {
                        name: '🔗 Connection Status',
                        value: connectionStatus,
                        inline: true
                    },
                    {
                        name: '🔑 Token Status',
                        value: `${tokenStatus}\n${tokenDetails}`,
                        inline: true
                    },
                    {
                        name: '👤 Spotify Profile',
                        value: spotifyProfile ? 
                            `**Display Name:** ${spotifyProfile.body.display_name || 'Not set'}\n**ID:** ${spotifyProfile.body.id}\n**Product:** ${spotifyProfile.body.product || 'Free'}` :
                            'Profile not accessible',
                        inline: false
                    }
                ])
                .setTimestamp();
            
            // Add footer with helpful information
            if (connectionStatus === '❌ Failed' || connectionStatus === '❌ API Error') {
                embed.addFields([{
                    name: '🔧 Need Help?',
                    value: 'Try using `/connect` to reconnect your Spotify account. If problems persist, your Spotify app authorization may have been revoked.',
                    inline: false
                }]);
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error(`[Status Command Error] User ${discordId}:`, error);
            await interaction.editReply({
                content: '❌ An error occurred while checking your Spotify status. Please try again.',
            });
        }
    }
}; 