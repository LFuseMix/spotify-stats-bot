// utils/progressBar.js
const config = require('../config.json');

function generateProgressBar(currentValue, maxValue, userColor = null) {
    if (maxValue <= 0 || currentValue <= 0) return ''; // Avoid division by zero or empty bar

    const percentage = Math.min(currentValue / maxValue, 1); // Ensure percentage doesn't exceed 100%
    const filledLength = Math.round(config.progressBarLength * percentage);
    const emptyLength = config.progressBarLength - filledLength;

    // Determine which color to use for the progress bar
    let colorChar = config.progressBarFilledChar; // Default fallback
    
    if (userColor && config.progressBarColors) {
        // Convert hex color to color name
        const colorMap = {
            '#FF0000': 'red',
            '#8A2BE2': 'purple',
            '#1DB954': 'green',
            '#FFA500': 'orange',
            '#007bff': 'blue',
            '#FFFF00': 'yellow',
            '#FFC0CB': 'pink'
        };
        
        const colorName = colorMap[userColor];
        if (colorName && config.progressBarColors[colorName]) {
            colorChar = config.progressBarColors[colorName];
        }
    }

    const filledBar = colorChar.repeat(filledLength);
    const emptyBar = config.progressBarEmptyChar.repeat(emptyLength);

    return `${filledBar}${emptyBar}`;
}

module.exports = { generateProgressBar };