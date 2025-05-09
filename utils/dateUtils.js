// utils/dateUtils.js

/**
 * Gets the start and end Unix timestamps (seconds) for a given period string.
 * @param {string} period - '7d', '1m', '3m', '6m', '1y', 'all'
 * @returns {{startTime: number, endTime: number, periodName: string}}
 */
function getTimestampsForPeriod(period) {
    const now = new Date();
    const endTs = Math.floor(now.getTime() / 1000); // End is always now (in seconds)
    let startTs = 0; // Default for 'all time'
    let periodName = "All Time";

    const periods = {
         '7d': { value: 7, unit: 'day', name: 'Last 7 Days' },
         '1m': { value: 1, unit: 'month', name: 'Last Month' },
         '3m': { value: 3, unit: 'month', name: 'Last 3 Months' },
         '6m': { value: 6, unit: 'month', name: 'Last 6 Months' },
         '1y': { value: 1, unit: 'year', name: 'Last Year' }
    };

    const selectedPeriod = periods[period.toLowerCase()];

    if (selectedPeriod) {
        periodName = selectedPeriod.name;
        const startDate = new Date(now); // Copy current date

        switch (selectedPeriod.unit) {
            case 'day':
                startDate.setDate(startDate.getDate() - selectedPeriod.value);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - selectedPeriod.value);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - selectedPeriod.value);
                break;
        }
         // Adjust start date to the beginning of that day (00:00:00) for consistency
         // startDate.setHours(0, 0, 0, 0); // Optional: Align start strictly to midnight? Decide on desired behavior.

        startTs = Math.floor(startDate.getTime() / 1000);
    } else if (period.toLowerCase() !== 'all') {
         // Handle invalid period string if needed, maybe default to 'all' or throw error
         console.warn(`[Date Utils] Invalid period string: ${period}. Defaulting to 'All Time'.`);
    }


    return { startTime: startTs, endTime: endTs, periodName };
}

/**
 * Formats milliseconds into a human-readable string (e.g., 1d 2h 3m 4s).
 * @param {number} ms - Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
function formatDuration(ms) {
    if (ms <= 0) return '0s';

    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    let days = Math.floor(hours / 24);

    seconds %= 60;
    minutes %= 60;
    hours %= 24;

    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0) result += `${minutes}m `;
    if (seconds > 0 || result === '') result += `${seconds}s`; // Show seconds if needed or if total time is < 1m

    return result.trim();
}


module.exports = { getTimestampsForPeriod, formatDuration };