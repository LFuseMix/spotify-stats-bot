const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
};

const separators = {
    heavy: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    light: '─────────────────────────────────────────────────────────────────────────────',
    dotted: '·········································································',
    wavy: '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    mixed: '│─┤ ├─│ ├─┤ ├─│ ├─┤ ├─│ ├─┤ ├─│ ├─┤ ├─│ ├─┤ ├─│ ├─┤ ├─│ ├─┤ ├─│ ├─┤ ├─│',
    stars: '★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★',
};

class Logger {
    static getTimestamp() {
        return new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2');
    }

    static formatTag(tag, color = 'white') {
        return `${colors[color]}[${tag}]${colors.reset}`;
    }

    // System/Bot lifecycle events
    static system(message, details = null) {
        console.log(separators.heavy);
        console.log(`${colors.cyan}${colors.bright}🚀 SYSTEM ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
        console.log(`${colors.cyan}├─ ${message}${colors.reset}`);
        if (details) {
            console.log(`${colors.gray}└─ ${details}${colors.reset}`);
        }
        console.log(separators.heavy);
    }

    // Database operations
    static database(action, message, details = null) {
        console.log(`${colors.blue}┌─ DATABASE ${action.toUpperCase()} ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
        console.log(`${colors.blue}├─ ${message}${colors.reset}`);
        if (details) {
            console.log(`${colors.gray}└─ ${details}${colors.reset}`);
        }
        console.log(`${colors.blue}${separators.dotted}${colors.reset}`);
    }

    // Network/API operations
    static network(service, action, message, details = null) {
        console.log(`${colors.magenta}┌─ ${service.toUpperCase()} ${action.toUpperCase()} ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
        console.log(`${colors.magenta}├─ ${message}${colors.reset}`);
        if (details) {
            console.log(`${colors.gray}└─ ${details}${colors.reset}`);
        }
        console.log(`${colors.magenta}${separators.light}${colors.reset}`);
    }

    // User interactions
    static interaction(user, command, details = null) {
        console.log(`${colors.green}┌─ USER INTERACTION ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
        console.log(`${colors.green}├─ ${user} used /${command}${colors.reset}`);
        if (details) {
            console.log(`${colors.gray}└─ ${details}${colors.reset}`);
        }
        console.log(`${colors.green}${separators.wavy}${colors.reset}`);
    }

    // Data processing operations
    static processing(operation, message, stats = null) {
        console.log(`${colors.yellow}┌─ PROCESSING ${operation.toUpperCase()} ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
        console.log(`${colors.yellow}├─ ${message}${colors.reset}`);
        if (stats) {
            console.log(`${colors.gray}└─ ${stats}${colors.reset}`);
        }
        console.log(`${colors.yellow}${separators.mixed}${colors.reset}`);
    }

    // Error handling
    static error(category, message, details = null) {
        console.log(`${colors.red}${separators.heavy}${colors.reset}`);
        console.log(`${colors.red}${colors.bright}❌ ERROR - ${category.toUpperCase()} ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
        console.log(`${colors.red}├─ ${message}${colors.reset}`);
        if (details) {
            console.log(`${colors.red}└─ ${details}${colors.reset}`);
        }
        console.log(`${colors.red}${separators.heavy}${colors.reset}`);
    }

    // Warning messages
    static warn(category, message, details = null) {
        console.log(`${colors.yellow}┌─ ⚠️  WARNING - ${category.toUpperCase()} ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
        console.log(`${colors.yellow}├─ ${message}${colors.reset}`);
        if (details) {
            console.log(`${colors.gray}└─ ${details}${colors.reset}`);
        }
        console.log(`${colors.yellow}${separators.dotted}${colors.reset}`);
    }

    // Success messages
    static success(category, message, details = null) {
        console.log(`${colors.green}┌─ ✅ SUCCESS - ${category.toUpperCase()} ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
        console.log(`${colors.green}├─ ${message}${colors.reset}`);
        if (details) {
            console.log(`${colors.gray}└─ ${details}${colors.reset}`);
        }
        console.log(`${colors.green}${separators.light}${colors.reset}`);
    }

    // Info messages
    static info(category, message, details = null) {
        console.log(`${colors.cyan}┌─ ℹ️  ${category.toUpperCase()} ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
        console.log(`${colors.cyan}├─ ${message}${colors.reset}`);
        if (details) {
            console.log(`${colors.gray}└─ ${details}${colors.reset}`);
        }
        console.log(`${colors.cyan}${separators.dotted}${colors.reset}`);
    }

    // Tracker operations with condensed duplicate handling
    static tracker(action, message, stats = null) {
        if (action === 'new_track') {
            console.log(`${colors.magenta}┌─ 🔄 TRACKER NEW_TRACK ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
            console.log(`${colors.magenta}├─ ${message}${colors.reset}`);
            if (stats) {
                console.log(`${colors.gray}└─ ${stats}${colors.reset}`);
            }
            console.log(`${colors.magenta}${separators.wavy}${colors.reset}`);
        } else if (action === 'duplicate_summary') {
            console.log(`${colors.gray}┌─ 🔄 TRACKER SUMMARY ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
            console.log(`${colors.gray}├─ ${message}${colors.reset}`);
            if (stats) {
                console.log(`${colors.gray}└─ ${stats}${colors.reset}`);
            }
            console.log(`${colors.gray}${separators.dotted}${colors.reset}`);
        } else if (action === 'cycle_start') {
            console.log(`${colors.cyan}┌─ 🔄 TRACKER CYCLE ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
            console.log(`${colors.cyan}├─ ${message}${colors.reset}`);
            if (stats) {
                console.log(`${colors.gray}└─ ${stats}${colors.reset}`);
            }
            console.log(`${colors.cyan}${separators.light}${colors.reset}`);
        } else if (action === 'cycle_end') {
            console.log(`${colors.green}┌─ 🔄 TRACKER CYCLE ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
            console.log(`${colors.green}├─ ${message}${colors.reset}`);
            if (stats) {
                console.log(`${colors.gray}└─ ${stats}${colors.reset}`);
            }
            console.log(`${colors.green}${separators.light}${colors.reset}`);
        } else {
            console.log(`${colors.magenta}┌─ 🔄 TRACKER ${action.toUpperCase()} ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
            console.log(`${colors.magenta}├─ ${message}${colors.reset}`);
            if (stats) {
                console.log(`${colors.gray}└─ ${stats}${colors.reset}`);
            }
            console.log(`${colors.magenta}${separators.wavy}${colors.reset}`);
        }
    }

    // Startup sequence
    static startup(step, message, details = null) {
        console.log(`${colors.green}${colors.bright}🚀 STARTUP STEP ${step} ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
        console.log(`${colors.green}├─ ${message}${colors.reset}`);
        if (details) {
            console.log(`${colors.gray}└─ ${details}${colors.reset}`);
        }
        console.log(`${colors.green}${separators.stars}${colors.reset}`);
    }

    // Shutdown sequence
    static shutdown(step, message, details = null) {
        console.log(`${colors.red}${colors.bright}🔴 SHUTDOWN STEP ${step} ${colors.reset}${colors.gray}│ ${this.getTimestamp()}${colors.reset}`);
        console.log(`${colors.red}├─ ${message}${colors.reset}`);
        if (details) {
            console.log(`${colors.gray}└─ ${details}${colors.reset}`);
        }
        console.log(`${colors.red}${separators.light}${colors.reset}`);
    }

    // Section headers for major operations
    static section(title, color = 'blue') {
        console.log('');
        console.log(`${colors[color]}${separators.heavy}${colors.reset}`);
        console.log(`${colors[color]}${colors.bright}  ${title.toUpperCase()}  ${colors.reset}`);
        console.log(`${colors[color]}${separators.heavy}${colors.reset}`);
        console.log('');
    }
}

module.exports = Logger; 