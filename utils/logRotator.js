const fs = require('node:fs').promises;
const path = require('node:path');

const LOG_FILE_NAME = 'tracker.log';
const LOG_FILE_PATH = path.join(__dirname, '..', LOG_FILE_NAME); // Assumes tracker.log is in the project root
const RETENTION_DAYS = 14;

/**
 * Parses a timestamp from a log line.
 * Expects lines starting with [ISO_TIMESTAMP]
 * Example: [2025-05-23T23:50:03.751Z]
 * @param {string} line - The log line.
 * @returns {Date|null} - The parsed Date object or null if parsing fails.
 */
function parseTimestampFromLogLine(line) {
    const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/);
    if (match && match[1]) {
        try {
            const date = new Date(match[1]);
            if (!isNaN(date.getTime())) {
                return date;
            }
        } catch (e) {
            // console.warn(`[LogRotator] Could not parse timestamp from: ${match[1]}`, e);
        }
    }
    return null;
}

/**
 * Reads the log file, removes entries older than RETENTION_DAYS,
 * and writes the filtered content back to the log file.
 */
async function cleanOldLogEntries() {
    console.log('[LogRotator] Starting log cleanup process...');
    try {
        let fileContent;
        try {
            fileContent = await fs.readFile(LOG_FILE_PATH, 'utf-8');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('[LogRotator] Log file not found. Nothing to clean.');
                return { success: true, message: 'Log file not found.' };
            }
            console.error('[LogRotator] Error reading log file:', error);
            throw error; // Re-throw other read errors
        }

        const lines = fileContent.split('\n');
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - RETENTION_DAYS);
        // For accurate comparison, set time to the beginning of the day, 14 days ago
        twoWeeksAgo.setHours(0, 0, 0, 0);


        let oldLinesRemoved = 0;
        let linesKeptCount = 0;

        const linesToKeep = lines.filter(line => {
            // Preserve empty lines if they are not just artifacts of splitting
            if (line.trim() === '') {
                // Decide whether to keep blank lines. Often logs don't intentionally have them.
                // If the last line of the file was a newline, split can result in an empty string at the end.
                return false; // For now, remove empty lines.
            }

            const timestamp = parseTimestampFromLogLine(line);
            if (timestamp) {
                if (timestamp < twoWeeksAgo) {
                    oldLinesRemoved++;
                    return false; // Remove old line
                }
            }
            // Keep lines if they are recent, or if they don't have a parseable timestamp (to be safe)
            linesKeptCount++;
            return true;
        });

        if (oldLinesRemoved > 0) {
            // Ensure the file ends with a newline if there's content
            const newContent = linesToKeep.join('\n') + (linesToKeep.length > 0 && linesToKeep[linesToKeep.length-1].trim() !== '' ? '\n' : '');
            await fs.writeFile(LOG_FILE_PATH, newContent, 'utf-8');
            console.log(`[LogRotator] Cleanup complete. Removed ${oldLinesRemoved} old log entries. Kept ${linesKeptCount} lines.`);
            return { success: true, removed: oldLinesRemoved, kept: linesKeptCount };
        } else {
            console.log('[LogRotator] No old log entries to remove.');
            return { success: true, removed: 0, kept: linesKeptCount };
        }

    } catch (error) {
        console.error('[LogRotator] Error during log cleanup:', error);
        return { success: false, error: error.message };
    }
}

module.exports = { cleanOldLogEntries, LOG_FILE_PATH, RETENTION_DAYS }; 