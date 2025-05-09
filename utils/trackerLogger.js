const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../tracker.log');

function writeLog(level, ...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
    const logLine = `[${timestamp}] [${level}] ${message}\n`;
    fs.appendFileSync(logFilePath, logLine, { encoding: 'utf8' });
}

module.exports = {
    log: (...args) => writeLog('INFO', ...args),
    warn: (...args) => writeLog('WARN', ...args),
    error: (...args) => writeLog('ERROR', ...args),
}; 