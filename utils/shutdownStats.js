const { getDbInstance } = require('./database');
const Logger = require('./logger');
const fs = require('fs');
const path = require('path');

// Command usage counter (will be incremented during bot runtime)
let commandUsageCount = 0;
let commandUsageByType = {};

/**
 * Increments command usage statistics
 * @param {string} commandName - Name of the command used
 */
function trackCommandUsage(commandName) {
    commandUsageCount++;
    commandUsageByType[commandName] = (commandUsageByType[commandName] || 0) + 1;
}

/**
 * Gets the most used commands from the current session
 * @returns {Array} Array of {command, count} objects sorted by usage
 */
function getTopCommands() {
    return Object.entries(commandUsageByType)
        .map(([command, count]) => ({ command, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Top 5 commands
}

/**
 * Gathers comprehensive bot statistics for shutdown display
 * @returns {Object} Statistics object with various metrics
 */
function gatherBotStatistics() {
    try {
        const db = getDbInstance();
        if (!db || !db.open) {
            return null;
        }

        // Total tracks recorded
        const totalTracksStmt = db.prepare('SELECT COUNT(*) as count FROM history');
        const totalTracks = totalTracksStmt.get()?.count || 0;

        // Total unique users with data
        const totalUsersStmt = db.prepare('SELECT COUNT(DISTINCT discord_id) as count FROM history');
        const totalUsers = totalUsersStmt.get()?.count || 0;

        // Connected users (have Spotify linked)
        const connectedUsersStmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE spotify_id IS NOT NULL');
        const connectedUsers = connectedUsersStmt.get()?.count || 0;

        // Public profiles
        const publicProfilesStmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE profile_public = 1');
        const publicProfiles = publicProfilesStmt.get()?.count || 0;

        // Total listening time (in hours)
        const totalTimeStmt = db.prepare('SELECT SUM(ms_played) as total_ms FROM history WHERE ms_played > 3000');
        const totalMs = totalTimeStmt.get()?.total_ms || 0;
        const totalHours = Math.round(totalMs / (1000 * 60 * 60));

        // Recent activity (last 24 hours)
        const yesterday = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
        const recentTracksStmt = db.prepare('SELECT COUNT(*) as count FROM history WHERE ts >= ?');
        const recentTracks = recentTracksStmt.get(yesterday)?.count || 0;

        // Top artist by total playtime
        const topArtistStmt = db.prepare(`
            SELECT artist_name, SUM(ms_played) as total_ms 
            FROM history 
            WHERE ms_played > 3000 AND artist_name IS NOT NULL 
            GROUP BY artist_name 
            ORDER BY total_ms DESC 
            LIMIT 1
        `);
        const topArtist = topArtistStmt.get();

        // Upload vs Recent tracking sources
        const uploadCountStmt = db.prepare('SELECT COUNT(*) as count FROM history WHERE source = "upload"');
        const recentCountStmt = db.prepare('SELECT COUNT(*) as count FROM history WHERE source = "recent"');
        const uploadTracks = uploadCountStmt.get()?.count || 0;
        const recentTracking = recentCountStmt.get()?.count || 0;

        return {
            totalTracks,
            totalUsers,
            connectedUsers,
            publicProfiles,
            totalHours,
            recentTracks,
            topArtist,
            uploadTracks,
            recentTracking
        };
    } catch (error) {
        Logger.error('shutdown', 'Error gathering statistics', error.message);
        return null;
    }
}

/**
 * Displays a beautiful shutdown summary with ASCII art and statistics
 * @param {string} signal - The shutdown signal received
 * @param {Object} startTime - Bot start time for uptime calculation
 */
function displayShutdownSummary(signal, startTime) {
    const stats = gatherBotStatistics();
    const topCommands = getTopCommands();
    
    // Calculate uptime
    const uptime = startTime ? Date.now() - startTime : 0;
    const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                        🎷 HERSHEY 🎷                          ║');
    console.log('║                      SHUTDOWN SUMMARY                         ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    
    // Shutdown info
    console.log(`🔸 Shutdown Signal: ${signal}`);
    console.log(`🔸 Bot Uptime: ${uptimeHours}h ${uptimeMinutes}m`);
    console.log(`🔸 Shutdown Time: ${new Date().toLocaleString()}`);
    console.log('');

    // Command usage stats for this session
    if (commandUsageCount > 0) {
        console.log('┌─────────────────────────────────────────────────────────────┐');
        console.log('│                    🚀 SESSION ACTIVITY                      │');
        console.log('├─────────────────────────────────────────────────────────────┤');
        console.log(`│ 💻 Commands Executed          │ ${commandUsageCount.toLocaleString().padStart(21)} │`);
        console.log('└─────────────────────────────────────────────────────────────┘');
        
        if (topCommands.length > 0) {
            console.log('┌─────────────────────────────────────────────────────────────┐');
            console.log('│                   📊 TOP COMMANDS USED                     │');
            console.log('├─────────────────────────────────────────────────────────────┤');
            topCommands.forEach((cmd, index) => {
                const emoji = ['🥇', '🥈', '🥉', '🏅', '🏅'][index] || '▫️';
                console.log(`│ ${emoji} /${cmd.command.padEnd(25)} │ ${cmd.count.toString().padStart(16)} uses │`);
            });
            console.log('└─────────────────────────────────────────────────────────────┘');
        }
        console.log('');
    }

    if (stats) {
        console.log('┌─────────────────────────────────────────────────────────────┐');
        console.log('│                    📊 DATABASE STATISTICS                   │');
        console.log('├─────────────────────────────────────────────────────────────┤');
        console.log(`│ 🎶 Total Tracks Recorded     │ ${stats.totalTracks.toLocaleString().padStart(21)} │`);
        console.log(`│ 👥 Users with Data            │ ${stats.totalUsers.toLocaleString().padStart(21)} │`);
        console.log(`│ 🔗 Connected Spotify Accounts │ ${stats.connectedUsers.toLocaleString().padStart(21)} │`);
        console.log(`│ 🌐 Public Profiles            │ ${stats.publicProfiles.toLocaleString().padStart(21)} │`);
        console.log(`│ ⏱️  Total Listening Hours      │ ${stats.totalHours.toLocaleString().padStart(21)} │`);
        console.log(`│ 🆕 Recent Tracks (24h)        │ ${stats.recentTracks.toLocaleString().padStart(21)} │`);
        console.log('└─────────────────────────────────────────────────────────────┘');
        console.log('');

        console.log('┌─────────────────────────────────────────────────────────────┐');
        console.log('│                     📈 DATA BREAKDOWN                       │');
        console.log('├─────────────────────────────────────────────────────────────┤');
        console.log(`│ 📤 Uploaded History Tracks    │ ${stats.uploadTracks.toLocaleString().padStart(21)} │`);
        console.log(`│ 🔄 Recent Tracking Plays      │ ${stats.recentTracking.toLocaleString().padStart(21)} │`);
        console.log('└─────────────────────────────────────────────────────────────┘');
        console.log('');

        if (stats.topArtist) {
            const artistHours = Math.round(stats.topArtist.total_ms / (1000 * 60 * 60));
            const artistName = stats.topArtist.artist_name.length > 30 
                ? stats.topArtist.artist_name.substring(0, 27) + '...' 
                : stats.topArtist.artist_name;
            console.log('┌─────────────────────────────────────────────────────────────┐');
            console.log('│                     🎤 TOP ARTIST                           │');
            console.log('├─────────────────────────────────────────────────────────────┤');
            console.log(`│ 👑 ${artistName.padEnd(30)} │ ${artistHours}h total │`);
            console.log('└─────────────────────────────────────────────────────────────┘');
            console.log('');
        }
    } else {
        console.log('┌─────────────────────────────────────────────────────────────┐');
        console.log('│                  ⚠️  DATABASE UNAVAILABLE                   │');
        console.log('│              Unable to gather statistics                    │');
        console.log('└─────────────────────────────────────────────────────────────┘');
        console.log('');
    }

    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                     👋 GOODBYE & THANK YOU!                   ║');
    console.log('║              Thanks for using Hershey 🎷! 🎵                  ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
}

module.exports = {
    gatherBotStatistics,
    displayShutdownSummary,
    trackCommandUsage,
    getTopCommands
}; 