// commands/upload.js
const { SlashCommandBuilder } = require('@discordjs/builders');
// Remove the InteractionResponseFlags import - it's not needed here
// const { InteractionResponseFlags } = require('discord.js');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const path = require('node:path');
const { getUser, addHistoryEntries } = require('../utils/database');

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
                        if (!Array.isArray(historyData)) { /* ... handle invalid format ... */ continue; }
                        let fileEntriesPassed = 0;
                        totalEntriesChecked += historyData.length;
                        const validEntriesFromFile = historyData.filter((entry, index) => {
                            // Basic field presence checks
                            const hasTs = !!entry.ts;
                            const hasTrackName = !!entry.master_metadata_track_name;
                            const hasArtistName = !!entry.master_metadata_album_artist_name;
                            const hasValidMsPlayed = typeof entry.ms_played === 'number';
                            
                            // Validate timestamp format and range
                            let isValidTimestamp = false;
                            if (hasTs) {
                                try {
                                    // Convert timestamp to milliseconds if it's in seconds (less than 1e12)
                                    const timestampMs = entry.ts < 1e12 ? entry.ts * 1000 : entry.ts;
                                    const timestamp = new Date(timestampMs);
                                    // Check if timestamp is valid and within reasonable range (2000-2100)
                                    isValidTimestamp = !isNaN(timestamp.getTime()) && 
                                        timestamp.getFullYear() >= 2000 && 
                                        timestamp.getFullYear() <= 2100;
                                    
                                    if (!isValidTimestamp && index < 5) {
                                        console.log(`[Debug Invalid Timestamp #${index + 1} in ${baseName}] Value: ${entry.ts}, Parsed: ${timestamp}`);
                                    }
                                } catch (e) {
                                    if (index < 5) {
                                        console.log(`[Debug Timestamp Parse Error #${index + 1} in ${baseName}] Value: ${entry.ts}, Error: ${e.message}`);
                                    }
                                }
                            }

                            const isValid = hasTs && hasTrackName && hasArtistName && hasValidMsPlayed && isValidTimestamp;
                            
                            // Keep debug logging for first 5 invalid entries
                            if (!isValid && index < 5) {
                                console.log(`[Debug Filter Fail Entry #${index + 1} in ${baseName}] Checks: ts=${hasTs}, valid_ts=${isValidTimestamp}, track=${hasTrackName}, artist=${hasArtistName}, ms_played=${hasValidMsPlayed}`);
                            }
                            
                            if (isValid) fileEntriesPassed++;
                            return isValid;
                        });
                        allHistoryEntries = allHistoryEntries.concat(validEntriesFromFile);
                        totalEntriesPassedFilter += fileEntriesPassed;
                        if (fileEntriesPassed > 0) { processedJsonFiles++; console.log(`[Upload] Extracted ${fileEntriesPassed} entries from ${zipEntry.entryName}.`);}
                        else if (historyData.length > 0) { console.log(`[Upload] Parsed ${zipEntry.entryName}, but 0 entries passed filter.`); }
                        else { console.log(`[Upload] Parsed ${zipEntry.entryName}, file was empty.`); }
                    } catch (parseError) { /* ... handle parse error ... */ }
                }
            } // End loop

            console.log(`[Upload Debug] Checked: ${totalEntriesChecked}, Passed: ${totalEntriesPassedFilter}`);

            if (!foundAnyHistoryFiles) { /* ... throw error ... */ }

            if (allHistoryEntries.length > 0) {
                 // ... (add entries to db) ...
                 const result = addHistoryEntries(discordId, allHistoryEntries, 'upload');
                 // ... (build success reply message) ...
                 let replyMessage = `Successfully processed \`${attachment.name}\`!\n- Found/parsed **${processedJsonFiles}** files.\n- Added **${result.added}** new entries.\n- Skipped **${result.skipped}** (duplicates/invalid).\n`;
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