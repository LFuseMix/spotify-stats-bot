const fs = require('node:fs').promises;
const path = require('node:path');

const STATE_FILE_NAME = 'log_cleanup_state.json';
const STATE_FILE_PATH = path.join(__dirname, '..', STATE_FILE_NAME); // Assumes state file in project root

/**
 * Gets the current date as a string in YYYY-MM-DD format (UTC).
 * @returns {string}
 */
function getCurrentDateUTCString() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Manages the state for log cleanup, specifically the last cleanup date.
 */
const manageLogCleanupState = {
    /**
     * Reads the last cleanup date from the state file.
     * @returns {Promise<string|null>} The last cleanup date string (YYYY-MM-DD) or null if not found/error.
     */
    async getLastCleanupDate() {
        try {
            const data = await fs.readFile(STATE_FILE_PATH, 'utf-8');
            const state = JSON.parse(data);
            return state.lastCleanupDateUTC || null;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // console.log('[LogStateManager] State file not found. Assuming no previous cleanup.');
            } else {
                console.error('[LogStateManager] Error reading state file:', error);
            }
            return null;
        }
    },

    /**
     * Writes the current date as the last cleanup date to the state file.
     * @returns {Promise<boolean>} True if successful, false otherwise.
     */
    async updateLastCleanupDate() {
        const currentDateString = getCurrentDateUTCString();
        try {
            const state = { lastCleanupDateUTC: currentDateString };
            await fs.writeFile(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
            console.log(`[LogStateManager] Updated last cleanup date to: ${currentDateString}`);
            return true;
        } catch (error) {
            console.error('[LogStateManager] Error writing state file:', error);
            return false;
        }
    }
};

/**
 * Determines if the log cleanup should run.
 * It should run if no previous cleanup date is recorded, or if the last cleanup was on a previous day.
 * @returns {Promise<boolean>}
 */
async function shouldRunCleanup() {
    const lastCleanupDate = await manageLogCleanupState.getLastCleanupDate();
    if (!lastCleanupDate) {
        console.log('[LogStateManager] No last cleanup date found, cleanup should run.');
        return true; // No record, so run cleanup
    }
    const currentDateString = getCurrentDateUTCString();
    if (lastCleanupDate < currentDateString) {
        console.log(`[LogStateManager] Last cleanup (${lastCleanupDate}) was before current date (${currentDateString}), cleanup should run.`);
        return true; // Last cleanup was on a previous day
    }
    console.log(`[LogStateManager] Log cleanup already ran today (${lastCleanupDate}). No need to run again now.`);
    return false;
}

module.exports = {
    manageLogCleanupState,
    shouldRunCleanup,
    STATE_FILE_PATH
}; 