// utils/progressBar.js
const config = require('../config.json');

function generateProgressBar(currentValue, maxValue) {
    if (maxValue <= 0 || currentValue <= 0) return ''; // Avoid division by zero or empty bar

    const percentage = Math.min(currentValue / maxValue, 1); // Ensure percentage doesn't exceed 100%
    const filledLength = Math.round(config.progressBarLength * percentage);
    const emptyLength = config.progressBarLength - filledLength;

    const filledBar = config.progressBarFilledChar.repeat(filledLength);
    const emptyBar = config.progressBarEmptyChar.repeat(emptyLength);

    return `${filledBar}${emptyBar}`;
}

module.exports = { generateProgressBar };