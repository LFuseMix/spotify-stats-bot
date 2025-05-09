// commands/top_genres.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, getTopArtists } = require('../utils/database'); // Get top artists to know who to query genres for
const { getUserSpotifyApi } = require('../utils/spotify'); // To get user's API client
const { getTimestampsForPeriod, formatDuration } = require('../utils/dateUtils');
const { generateProgressBar } = require('../utils/progressBar');
const config = require('../config.json');

// Spotify attribution constants
const SPOTIFY_LOGO_URL = 'https://developer.spotify.com/images/guidelines/design/icon4@2x.png'; // Official Spotify Icon

// Helper function to chunk arrays (Spotify API limits array sizes)
function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('top-genres')
        .setDescription('Shows your top genres for a given period (requires Spotify connection).')
        .addIntegerOption(option =>
            option.setName('top')
                .setDescription('Number of genres to show (5, 10, or 15).')
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
            return interaction.reply({ content: 'You need to connect your Spotify account first using `/connect` for genre information.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const { startTime, endTime, periodName } = getTimestampsForPeriod(period);

            // 1. Get Top Artists from DB
            const topArtistsData = getTopArtists(discordId, 50, startTime, endTime);
            if (!topArtistsData || topArtistsData.length === 0) {
                return interaction.editReply(`Couldn't find any listening history for you in the ${periodName} period to determine genres.`);
            }

            // 2. Get Authenticated Spotify API Client
            const spotifyApi = await getUserSpotifyApi(discordId);
            if (!spotifyApi) {
                 return interaction.editReply({ content: 'Could not refresh your Spotify connection. Please try `/connect` again.', ephemeral: true });
            }

            // 3. Search for Artist IDs
            const artistIds = [];
            const artistIdToNameMap = new Map();
            const searchPromises = topArtistsData.map(artist =>
                spotifyApi.searchArtists(artist.artist_name, { limit: 1 })
                    .then(searchResult => {
                        if (searchResult.body.artists?.items.length > 0) {
                            const foundArtist = searchResult.body.artists.items[0];
                            artistIds.push(foundArtist.id);
                            artistIdToNameMap.set(foundArtist.id, artist.artist_name);
                        }
                    }).catch(err => { /* console.error(...) */ }) // Ignore search errors for individual artists
            );
            await Promise.all(searchPromises);
            if (artistIds.length === 0) {
                 return interaction.editReply(`Found artists in your history, but couldn't match them to Spotify artists to get genres.`);
            }

            // 4. Fetch Artist Details (including Genres)
            const uniqueArtistIds = [...new Set(artistIds)];
            const artistChunks = chunkArray(uniqueArtistIds, 50);
            const artistDetailsMap = new Map();
            const fetchPromises = artistChunks.map(chunk =>
                spotifyApi.getArtists(chunk)
                    .then(artistsResult => {
                        artistsResult.body.artists.forEach(artist => {
                            if (artist) artistDetailsMap.set(artist.id, { name: artist.name, genres: artist.genres });
                        });
                    }).catch(err => { /* console.error(...) */ }) // Ignore fetch errors for chunks
            );
            await Promise.all(fetchPromises);

            // 5. Aggregate Genre Playtime
            const genrePlaytime = {};
            topArtistsData.forEach(dbArtist => {
                let foundId = null;
                for (const [id, name] of artistIdToNameMap.entries()) {
                    if (name.toLowerCase() === dbArtist.artist_name.toLowerCase()) { foundId = id; break; }
                }
                const spotifyArtist = foundId ? artistDetailsMap.get(foundId) : null;
                if (spotifyArtist?.genres?.length > 0) {
                    spotifyArtist.genres.forEach(genre => {
                        genrePlaytime[genre] = (genrePlaytime[genre] || 0) + dbArtist.total_ms_played;
                    });
                } else if (spotifyArtist) {
                     genrePlaytime['unknown/other'] = (genrePlaytime['unknown/other'] || 0) + dbArtist.total_ms_played;
                }
            });
            if (Object.keys(genrePlaytime).length === 0) {
                 return interaction.editReply(`Found artists, but couldn't retrieve or assign any genres from Spotify.`);
            }

            // 6. Sort Genres and Prepare Embed
            const sortedGenres = Object.entries(genrePlaytime)
                .sort(([, timeA], [, timeB]) => timeB - timeA)
                .slice(0, limit);

            const embed = new EmbedBuilder()
                .setColor(user.embed_color || config.defaultEmbedColor)
                .setTitle(`🎶 ${interaction.user.username}'s Top ${sortedGenres.length} Genres (${periodName})`);

            let description = '';
            const maxMsPlayed = sortedGenres[0]?.[1] || 1;

            sortedGenres.forEach(([genre, totalMsPlayed], index) => {
                const progressBar = generateProgressBar(totalMsPlayed, maxMsPlayed);
                 const displayGenre = genre.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                // No linking needed for genres
                description += `**${index + 1}. ${displayGenre}**\n`;
                description += `   ${formatDuration(totalMsPlayed)}\n`;
                if(progressBar) description += `   \`${progressBar}\`\n\n`; else description += `\n`;
            });

             if(sortedGenres.length < limit && Object.keys(genrePlaytime).length > sortedGenres.length) {
                 description += `\n*...and ${Object.keys(genrePlaytime).length - sortedGenres.length} more genres found.*`;
             }

            embed.setDescription(description.trim());

            // *** MODIFIED: Add footer attribution ***
            // Note: Keep original footer text about source if desired, or replace/combine
            embed.setFooter({
                 text: 'Genre data based on artist plays. Data provided by Spotify.', // Combine texts
                 iconURL: SPOTIFY_LOGO_URL
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`[Top Genres Error] User ${discordId}, Period ${period}:`, error);
             let errorMsg = 'An error occurred while fetching your top genres.';
             if (error?.body?.error?.message) { errorMsg += `\n*Spotify API Error: ${error.body.error.message}*`; }
             else if (error?.message?.includes('refresh token')) { errorMsg = 'Could not refresh your Spotify connection. Please try `/connect` again.'; }
            await interaction.editReply(errorMsg);
        }
    },
};