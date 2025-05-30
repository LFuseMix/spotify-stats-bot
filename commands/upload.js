// commands/upload.js
const { SlashCommandBuilder } = require('@discordjs/builders');
// Remove the InteractionResponseFlags import - it's not needed here
// const { InteractionResponseFlags } = require('discord.js');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const path = require('node:path');
const { getUser, addHistoryEntries } = require('../utils/database');
const { getUserSpotifyApi, chunkArray } = require('../utils/spotify'); // Import spotify utils

module.exports = {
    data: new SlashCommandBuilder()
        .setName('upload')
        .setDescription('Upload your Spotify extended streaming history ZIP file.')
        .addAttachmentOption(option =>
            option.setName('historyzip')
                .setDescription('The .zip file from Spotify containing Streaming_History_*.json files.')
                .setRequired(true)),

    async execute(interaction) {
        const discordId = interaction.user.id;
        const user = getUser(discordId);

        // --- Use ephemeral: true directly for initial replies ---
        if (!user || !user.spotify_id) {
            return interaction.reply({
                content: 'You need to connect your Spotify account first using `/connect`.',
                ephemeral: true // Use direct ephemeral option
            });
        }

        const attachment = interaction.options.getAttachment('historyzip');

        if (!attachment || (!attachment.name?.toLowerCase().endsWith('.zip') && attachment.contentType !== 'application/zip')) {
            return interaction.reply({
                content: 'Please attach a valid `.zip` file provided by Spotify.',
                ephemeral: true // Use direct ephemeral option
            });
        }
        if (attachment.size > 100 * 1024 * 1024) {
             return interaction.reply({
                content: 'File is too large (max 100MB).',
                ephemeral: true // Use direct ephemeral option
             });
        }

        // --- Defer ephemerally using the direct option ---
        try {
            // Revert back to using ephemeral: true
            await interaction.deferReply({ ephemeral: true });
        } catch (deferError) {
             // Keep the robust error handling from before
             console.error(`[Upload Cmd ${interaction.id}] Ephemeral deferral failed:`, deferError);
             // Optionally try a public error message if ephemeral defer fails?
             try {
                 await interaction.reply({ content: "Sorry, there was an issue initiating the upload process." });
             } catch (fallbackError) {
                 console.error(`[Upload Cmd ${interaction.id}] Failed to send fallback reply after defer failure:`, fallbackError);
             }
             return; // Stop execution if defer fails
        }
        // --- End Deferral Change ---


        try {
            // ... (rest of the zip processing logic remains exactly the same as the working version) ...
            const response = await fetch(attachment.url);
            if (!response.ok) throw new Error(`Failed to download attachment: ${response.statusText}`);
            const zipBuffer = await response.buffer();
            const zip = new AdmZip(zipBuffer);
            const zipEntries = zip.getEntries();
            let allHistoryEntries = [];
            let processedJsonFiles = 0;
            let failedJsonFiles = [];
            let foundAnyHistoryFiles = false;
            let totalEntriesChecked = 0;
            let totalEntriesPassedFilter = 0;

            console.log(`[Upload] Processing zip file ${attachment.name} for user ${discordId}. Found ${zipEntries.length} entries.`);

            for (const zipEntry of zipEntries) {
                const baseName = path.basename(zipEntry.entryName);
                if (!zipEntry.isDirectory && baseName.startsWith('Streaming_History_') && baseName.toLowerCase().endsWith('.json')) {
                    foundAnyHistoryFiles = true;
                    console.log(`[Upload] Found potential history file: ${zipEntry.entryName}`);
                    try {
                        const jsonString = zip.readAsText(zipEntry);
                        const historyData = JSON.parse(jsonString);
                        if (!Array.isArray(historyData)) { /* ... handle invalid format ... */ console.warn(`[Upload] Invalid format in ${zipEntry.entryName}: expected array.`); failedJsonFiles.push(zipEntry.entryName); continue; }
                        let fileEntriesPassed = 0;
                        totalEntriesChecked += historyData.length;

                        // Process and filter entries before adding to allHistoryEntries
                        const processedEntriesFromFile = historyData.map(originalEntry => {
                            // Basic field presence checks for filtering
                            const hasOriginalTs = !!originalEntry.ts;
                            const hasTrackName = !!originalEntry.master_metadata_track_name;
                            const hasArtistName = !!originalEntry.master_metadata_album_artist_name;
                            const hasValidMsPlayed = typeof originalEntry.ms_played === 'number';
                            
                            let parsedUnixTimestampSeconds = null;
                            let isValidTimestamp = false;
                            if (hasOriginalTs) {
                                try {
                                    const parsedDate = new Date(originalEntry.ts); // Parse ISO string
                                    if (!isNaN(parsedDate.getTime())) {
                                        parsedUnixTimestampSeconds = Math.floor(parsedDate.getTime() / 1000);
                                        isValidTimestamp = parsedUnixTimestampSeconds >= 946684800 && parsedUnixTimestampSeconds <= 4102444799; // Approx 2000-01-01 to 2100-01-01
                                    }
                                } catch (e) { /* Invalidate timestamp on error */ }
                            }

                            const isValid = hasOriginalTs && isValidTimestamp && hasTrackName && hasArtistName && hasValidMsPlayed;
                            
                            if (!isValid) {
                                // console.log(`[Debug Filter Fail Entry in ${baseName}] Original ts: ${originalEntry.ts}, Parsed ts: ${parsedUnixTimestampSeconds}, Valid ts: ${isValidTimestamp}, Track: ${hasTrackName}, Artist: ${hasArtistName}, ms_played: ${hasValidMsPlayed}`);
                                return null; // Mark as invalid to be filtered out
                            }
                            
                            fileEntriesPassed++;
                            // Return a new object with the processed timestamp for addHistoryEntries
                            return {
                                ts: parsedUnixTimestampSeconds, // Unix timestamp in seconds
                                ms_played: originalEntry.ms_played,
                                master_metadata_track_name: originalEntry.master_metadata_track_name,
                                master_metadata_album_artist_name: originalEntry.master_metadata_album_artist_name,
                                master_metadata_album_name: originalEntry.master_metadata_album_album_name,
                                spotify_track_uri: originalEntry.spotify_track_uri
                                // other fields like conn_country, ip_addr, platform, etc., are not used by addHistoryEntries
                            };
                        }).filter(entry => entry !== null); // Remove nulls (invalid entries)

                        allHistoryEntries = allHistoryEntries.concat(processedEntriesFromFile);
                        totalEntriesPassedFilter += fileEntriesPassed; // This count is based on successful mapping now

                        if (fileEntriesPassed > 0) { processedJsonFiles++; console.log(`[Upload] Extracted and validated ${fileEntriesPassed} entries from ${zipEntry.entryName}.`);}
                        else if (historyData.length > 0) { console.log(`[Upload] Parsed ${zipEntry.entryName}, but 0 entries passed validation.`); }
                        else { console.log(`[Upload] Parsed ${zipEntry.entryName}, file was empty.`); }
                    } catch (parseError) { /* ... handle parse error ... */ console.error(`[Upload] Error parsing ${zipEntry.entryName}:`, parseError); failedJsonFiles.push(zipEntry.entryName); }
                }
            } // End loop

            console.log(`[Upload Debug] Checked: ${totalEntriesChecked}, Passed: ${totalEntriesPassedFilter}`);

            if (!foundAnyHistoryFiles) {
                // Throw an error or handle as appropriate for your application
                await interaction.editReply("No 'Streaming_History_*.json' files found in the zip.");
                return;
            }

            if (allHistoryEntries.length > 0) {
                // --- New: Fetch track durations from Spotify API ---
                let entriesWithFetchedDurations = 0;
                let entriesFailedDurationFetch = 0;
                try {
                    const spotifyApi = await getUserSpotifyApi(discordId);
                    if (spotifyApi) {
                        const trackUris = [...new Set(allHistoryEntries.map(entry => entry.spotify_track_uri).filter(uri => uri))]
                            .map(uri => uri.startsWith('spotify:track:') ? uri.split(':')[2] : null) // Ensure correct URI format and extract ID
                            .filter(id => id); 

                        if (trackUris.length > 0) {
                            await interaction.editReply({ content: `Processing ${allHistoryEntries.length} entries... Fetching track durations from Spotify for ${trackUris.length} unique tracks. This might take a moment...` });
                            
                            const trackChunks = chunkArray(trackUris, 50); // Spotify API limit is 50 tracks per request
                            const trackDurationMap = new Map();

                            for (const chunk of trackChunks) {
                                try {
                                    const tracksData = await spotifyApi.getTracks(chunk);
                                    if (tracksData.body && tracksData.body.tracks) {
                                        tracksData.body.tracks.forEach(track => {
                                            if (track && track.id && typeof track.duration_ms === 'number') {
                                                trackDurationMap.set(`spotify:track:${track.id}`, track.duration_ms);
                                            }
                                        });
                                    }
                                } catch (apiError) {
                                    console.warn(`[Upload] Spotify API error fetching track chunk: ${apiError.message}. Some durations might use original values.`);
                                }
                            }

                            allHistoryEntries = allHistoryEntries.map(entry => {
                                if (entry.spotify_track_uri && trackDurationMap.has(entry.spotify_track_uri)) {
                                    entry.ms_played = trackDurationMap.get(entry.spotify_track_uri);
                                    entriesWithFetchedDurations++;
                                } else if (entry.spotify_track_uri) {
                                    // Keep original ms_played if URI was valid but track not found or no duration
                                    // Or if it's not a Spotify URI
                                    entriesFailedDurationFetch++;
                                }
                                return entry;
                            });
                            console.log(`[Upload] Fetched durations for ${entriesWithFetchedDurations} entries. Failed/Kept original for ${entriesFailedDurationFetch} entries.`);
                        }
                    } else {
                        console.warn(`[Upload] Could not get Spotify API for user ${discordId}. Using original ms_played values.`);
                        await interaction.editReply({ content: `Processing ${allHistoryEntries.length} entries... Could not connect to Spotify to fetch exact durations. Using durations from your file.`});
                    }
                } catch (e) {
                    console.error(`[Upload] Error during Spotify duration fetch for ${discordId}:`, e);
                    // Notify user but proceed with original ms_played
                     await interaction.editReply({ content: `Processing ${allHistoryEntries.length} entries... Error fetching exact durations from Spotify. Using durations from your file.`});
                }
                // --- End New ---


                 const result = addHistoryEntries(discordId, allHistoryEntries, 'upload');
                 // ... (build success reply message) ...
                 let replyMessage = `Successfully processed \`${attachment.name}\`!\n- Found/parsed **${processedJsonFiles}** files.\n- Added **${result.added}** new entries.\n- Skipped **${result.skipped}** (duplicates/invalid).\n`;
                 if (entriesWithFetchedDurations > 0) {
                     replyMessage += `- Updated **${entriesWithFetchedDurations}** entries with official Spotify durations.\n`;
                 }
                 if (entriesFailedDurationFetch > 0) {
                     replyMessage += `- Used original duration for **${entriesFailedDurationFetch}** entries (not found on Spotify or already accurate).\n`;
                 }
                 if (result.invalidEntries > 0) {
                     replyMessage += `- ⚠️ Found **${result.invalidEntries}** invalid entries (skipped).\n`;
                 }
                 if (failedJsonFiles.length > 0) { replyMessage += `\n⚠️ Failed to parse:\n - ${failedJsonFiles.join('\n - ')}`; }
                 await interaction.editReply(replyMessage);
            } else {
                 // ... (build "no valid entries found" reply message) ...
                  let replyMessage = `Processed \`${attachment.name}\`. Found files matching pattern, but couldn't extract valid entries (Checked ${totalEntriesChecked} entries).\n`;
                  if (failedJsonFiles.length > 0) { replyMessage += `\n⚠️ Parsing failed for:\n - ${failedJsonFiles.join('\n - ')}`; }
                  else { replyMessage += `Ensure JSONs contain 'ts', 'master_metadata_track_name', 'master_metadata_album_artist_name', 'ms_played'.`; }
                 await interaction.editReply(replyMessage);
            }

        } catch (error) {
            // ... (error handling and editReply for errors) ...
            console.error(`[Upload] Error processing zip file for ${discordId} (${attachment.name}):`, error);
            let errorMessage = `An error occurred while processing the zip file. Ensure it's valid.`;
            if (error instanceof fetch.FetchError) { errorMessage = `Error downloading attachment.`;}
            else if (error.message.includes("No files matching")) { errorMessage = error.message; }
            else { errorMessage = `Error: ${error.message}.`; }
            try { await interaction.editReply(errorMessage); } catch (editError) { console.error(`[Upload Cmd ${interaction.id}] Failed to edit ephemeral reply with error:`, editError); }
        }
    },
};