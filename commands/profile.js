// commands/profile.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
// Ensure getAllUserDataForPeriod is imported
const { getUser, getAllUserDataForPeriod, getDbInstance } = require('../utils/database');
const { getUserSpotifyApi } = require('../utils/spotify');
const { getTimestampsForPeriod, formatDuration } = require('../utils/dateUtils');
const config = require('../config.json');

// Spotify attribution constants
const SPOTIFY_LOGO_URL = 'https://developer.spotify.com/images/guidelines/design/icon4@2x.png';

// --- Helper Functions (Keep as they are) ---
function chunkArray(array, size) { /* ... */ }
function getSpotifyTrackUrlFromUri(uri) { /* ... */ }
function getSpotifyUserUrl(profileData) { /* ... */ }
async function getTopGenreAllTime(discordId, spotifyApi) { /* ... */ }
// --- End Helper Functions ---


module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Displays your Spotify profile summary based on stored data.'),
    async execute(interaction) {
        const discordId = interaction.user.id;
        const db = getDbInstance(); // Get db instance early for checks

        const user = getUser(discordId); // Fetch user data (for color, checking connection)
        if (!user || !user.spotify_id) {
            return interaction.reply({ content: 'You need to connect your Spotify account first using `/connect`.', ephemeral: true });
        }

        // Check if user has *any* history data at all
        const hasAnyHistory = db.prepare('SELECT 1 FROM history WHERE discord_id = ? LIMIT 1').get(discordId);
        if (!hasAnyHistory) {
             return interaction.reply({ content: 'I don\'t have any listening history stored for you yet. Use the `/upload` command first to see profile stats.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const spotifyApi = await getUserSpotifyApi(discordId);
            if (!spotifyApi) {
                 return interaction.editReply({ content: 'Could not refresh your Spotify connection. Please try `/connect` again.', ephemeral: true });
            }

            // --- Fetch Data ---
            // Spotify Profile
            const meResponse = await spotifyApi.getMe();
            const me = meResponse.body;
            const spotifyDisplayName = me.display_name || me.id;
            const profileImageUrl = me.images?.[0]?.url;
            const profileUrl = getSpotifyUserUrl(me);

            // Database Stats (All Time)
            const { startTime, endTime } = getTimestampsForPeriod('all');
            const allTimeStats = getAllUserDataForPeriod(discordId, startTime, endTime);
            const totalMsListened = allTimeStats.totalMsListened;
            // Slice the results from getAllUserDataForPeriod if needed
            const topSongsData = allTimeStats.topSongs.slice(0, 3); // Ensure only top 3
            const topArtistsData = allTimeStats.topArtists.slice(0, 1); // Ensure only top 1

            // Top Genre (requires separate calculation)
            const topGenre = await getTopGenreAllTime(discordId, spotifyApi);

            // --- Build Embed ---
            const embed = new EmbedBuilder()
                .setColor(user.embed_color || config.defaultEmbedColor)
                .setTitle(`${spotifyDisplayName}'s Spotify Profile`)
                .setTimestamp();

            if (profileUrl) {
                embed.setURL(profileUrl);
            }
            if (profileImageUrl) {
                embed.setThumbnail(profileImageUrl);
            }

            // --- Fields ---

            // Field 1: Stats Summary
            embed.addFields({
                 name: '📊 Lifetime Stats',
                 value: `**Total Time Listened:** ${formatDuration(totalMsListened)}\n**Top Genre:** ${topGenre || 'N/A'}`,
                 inline: false // Use full width for this summary
            });

            // Field 2: Top Artist
            let artistFieldVal = 'No artist data found.';
            if (topArtistsData?.length > 0) {
                const artist = topArtistsData[0];
                // Consider adding link if we fetch artist URL, but keep simple for now
                artistFieldVal = `**${artist.artist_name}**\n(${formatDuration(artist.total_ms_played)} listened)`;
            }
            embed.addFields({ name: '🥇 Top Artist (All Time)', value: artistFieldVal, inline: false });


            // Field 3: Top Songs
            let songsFieldVal = 'No song data found.';
            if (topSongsData?.length > 0) {
                songsFieldVal = topSongsData.map((song, index) => {
                    const trackUrl = getSpotifyTrackUrlFromUri(song.spotify_track_uri);
                    const trackNameDisplay = trackUrl ? `[${song.track_name}](${trackUrl})` : song.track_name;
                    // Indent lines slightly for readability
                    return `**${index + 1}.** ${trackNameDisplay}\n   *${song.artist_name}* (${formatDuration(song.total_ms_played)})`;
                }).join('\n'); // Use single newline between songs in the list
            }
             // Adjust title based on how many songs were found
             const topSongsTitle = `🏆 Top ${topSongsData.length === 0 ? '' : topSongsData.length + ' '}Songs (All Time)`;
             embed.addFields({ name: topSongsTitle, value: songsFieldVal, inline: false });


            // Footer Attribution
            embed.setFooter({
                 text: 'Data provided by Spotify',
                 iconURL: SPOTIFY_LOGO_URL
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`[Profile Command Error] User ${discordId}:`, error);
            let errorMsg = 'An error occurred while fetching your profile.';
            if (error?.body?.error?.message) { errorMsg += `\n*Spotify API Error: ${error.body.error.message}*`; }
            else if (error?.message?.includes('refresh token')) { errorMsg = 'Could not refresh your Spotify connection. Please try `/connect` again.'; }
            // Avoid trying to edit reply if interaction failed early
            if (!interaction.replied && !interaction.deferred) {
                 await interaction.reply({ content: errorMsg, ephemeral: true }).catch(e => console.error("Failed fallback reply:", e));
            } else {
                 await interaction.editReply(errorMsg).catch(e => console.error("Failed editReply:", e));
            }
        }
    },
};