// utils/database.js
const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');
const Logger = require('./logger'); // Add our new logger

// Determine the database path (e.g., in the project root)
const dbPath = path.join(__dirname, '..', 'spotify_stats.db');
let db;

function initializeDatabase() {
    // Ensure verbose logging is off unless debugging
    db = new Database(dbPath, { /* verbose: console.log */ });
    Logger.database('connect', `Connected to SQLite database`, `Path: ${dbPath}`);

    // Enable WAL mode for better concurrency
    try {
        db.pragma('journal_mode = WAL');
        Logger.database('config', 'WAL mode set successfully');
    } catch (pragmaError) {
        Logger.error('database', 'Failed to set WAL mode', pragmaError.message);
    }

    // --- Create Tables Transaction ---
    try {
        Logger.database('init', 'Starting TABLE creation transaction...');
        db.transaction(() => {
            db.prepare(`
                CREATE TABLE IF NOT EXISTS users (
                    discord_id TEXT PRIMARY KEY, spotify_id TEXT UNIQUE,
                    spotify_access_token TEXT, spotify_refresh_token TEXT,
                    token_expires_at INTEGER, embed_color TEXT DEFAULT '#1DB954',
                    is_admin INTEGER DEFAULT 0, -- Added is_admin column
                    profile_public INTEGER DEFAULT 0 -- Added privacy setting (0 = private, 1 = public)
                )
            `).run();

            db.prepare(`
                CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT NOT NULL,
                    ts INTEGER NOT NULL, -- Unix timestamp in seconds (UTC)
                    ms_played INTEGER NOT NULL, -- Will be 0 for 'recent' source
                    track_name TEXT NOT NULL,
                    artist_name TEXT NOT NULL,
                    album_name TEXT,
                    spotify_track_uri TEXT, -- Store the track URI
                    source TEXT, -- 'upload', 'recent'
                    FOREIGN KEY (discord_id) REFERENCES users (discord_id) ON DELETE CASCADE
                )
            `).run();

            // Drop existing index if it exists
            db.prepare(`
                DROP INDEX IF EXISTS idx_history_unique_play
            `).run();

            // The unique index on (discord_id, spotify_track_uri, ts) has been removed
            // to allow multiple history entries for the same track at the exact same timestamp,
            // particularly for uploaded histories where granular plays might share a timestamp.
        })();
        Logger.success('database', 'TABLE creation transaction committed successfully');
    } catch (error) {
         Logger.error('database', 'TABLE creation transaction failed', error.message);
         throw error;
    }

    // --- Create Indices (Outside initial transaction) ---
    try {
         db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_history_discord_ts ON history (discord_id, ts DESC)
         `).run();
         Logger.database('index', 'Indices ensured successfully');
    } catch (error) {
         Logger.error('database', 'INDEX creation failed', error.message);
         throw error;
    }

    Logger.success('database', 'Tables and Indices ensured (End of initializeDatabase).');
} // End of initializeDatabase function

// --- User Functions ---

function getUser(discordId) {
    if (!db) throw new Error("Database not initialized yet.");
    const stmt = db.prepare('SELECT * FROM users WHERE discord_id = ?');
    return stmt.get(discordId);
}

function getAllConnectedUsers() {
    if (!db) throw new Error("Database not initialized yet.");
    const stmt = db.prepare('SELECT discord_id, spotify_id FROM users WHERE spotify_id IS NOT NULL AND spotify_access_token IS NOT NULL AND spotify_refresh_token IS NOT NULL');
    return stmt.all();
}

function addUser(discordId) {
    if (!db) throw new Error("Database not initialized yet.");
    const stmt = db.prepare('INSERT OR IGNORE INTO users (discord_id) VALUES (?)');
    const info = stmt.run(discordId);
    return info.changes > 0;
}

function linkSpotifyAccount(discordId, spotifyId, accessToken, refreshToken, expiresIn) {
    if (!db) throw new Error("Database not initialized yet.");
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    const stmt = db.prepare(`
        INSERT INTO users (discord_id, spotify_id, spotify_access_token, spotify_refresh_token, token_expires_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(discord_id) DO UPDATE SET
            spotify_id = excluded.spotify_id,
            spotify_access_token = excluded.spotify_access_token,
            spotify_refresh_token = COALESCE(excluded.spotify_refresh_token, spotify_refresh_token),
            token_expires_at = excluded.token_expires_at
    `);
    
    try {
        stmt.run(discordId, spotifyId, accessToken, refreshToken, expiresAt);
        return { success: true, message: 'Successfully linked Spotify account' };
    } catch (error) {
        Logger.error('database', 'Failed to link Spotify account', error.message);
        return { success: false, message: 'Database error while linking account' };
    }
}

function updateUserTokens(discordId, accessToken, refreshToken, expiresIn) {
    if (!db) throw new Error("Database not initialized yet.");
    
    // If clearing tokens (null values), set expiration to 0
    const expiresAt = (accessToken === null) ? 0 : Math.floor(Date.now() / 1000) + expiresIn;
    
    const stmt = db.prepare(`
        UPDATE users
        SET spotify_access_token = ?,
            ${refreshToken !== undefined ? 'spotify_refresh_token = ?,' : ''}
            token_expires_at = ?
        WHERE discord_id = ?
    `);
    
    const params = [accessToken];
    if (refreshToken !== undefined) {
        params.push(refreshToken);
    }
    params.push(expiresAt, discordId);
    
    try {
        const result = stmt.run(...params);
        if (result.changes === 0) {
            Logger.warn('database', `No user found to update tokens for discord_id: ${discordId}`);
        } else {
            Logger.database('tokens', `Updated tokens for user ${discordId}`, accessToken ? 'Valid tokens' : 'Cleared tokens');
        }
    } catch (error) {
        Logger.error('database', `Failed to update user tokens for ${discordId}`, error.message);
        throw error;
    }
}

function updateUserColor(discordId, color) {
    if (!db) throw new Error("Database not initialized yet.");
    const stmt = db.prepare('UPDATE users SET embed_color = ? WHERE discord_id = ?');
    const info = stmt.run(color, discordId);
    return info.changes > 0;
}

// --- Privacy Functions ---
function updateUserPrivacy(discordId, isPublic) {
    if (!db) throw new Error("Database not initialized yet.");
    const stmt = db.prepare('UPDATE users SET profile_public = ? WHERE discord_id = ?');
    const info = stmt.run(isPublic ? 1 : 0, discordId);
    return info.changes > 0;
}

function isUserProfilePublic(discordId) {
    if (!db) throw new Error("Database not initialized yet.");
    const stmt = db.prepare('SELECT profile_public FROM users WHERE discord_id = ?');
    const user = stmt.get(discordId);
    return user ? user.profile_public === 1 : false;
}

function getUserByDiscordId(discordId) {
    if (!db) throw new Error("Database not initialized yet.");
    const stmt = db.prepare('SELECT * FROM users WHERE discord_id = ?');
    return stmt.get(discordId);
}

// --- Admin Check Function ---
function isAdmin(discordId) {
    if (!db) throw new Error("Database not initialized yet.");

    // Load config to check superAdminId
    const configPath = path.join(__dirname, '..', 'config.json');
    let config = {};
    try {
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } else {
            Logger.error('isAdmin', 'config.json not found!');
            // Depending on how critical this is, you might want to throw an error
            // or return false, assuming no super admin if config is missing.
            return false; 
        }
    } catch (error) {
        Logger.error('isAdmin', 'Error reading or parsing config.json', error.message);
        return false; // Safer to deny admin rights on config error
    }

    if (config.superAdminId && discordId === config.superAdminId) {
        return true; // User is the super admin
    }

    const stmt = db.prepare('SELECT is_admin FROM users WHERE discord_id = ?');
    const user = stmt.get(discordId);
    return user ? user.is_admin === 1 : false;
}

// --- History Functions ---

function addHistoryEntries(discordId, entries, source) {
    if (!db) throw new Error("Database not initialized yet.");
    addUser(discordId); // Ensure user exists

    let added = 0;
    let skipped = 0;
    let invalidEntries = 0;
    let loggedSkipCount = 0;
    const MAX_SKIP_LOGS = 5; // Only log first 5 duplicates
    const addedTracks = []; // Track which tracks were actually added

    const insertMany = db.transaction((entries) => {
        for (const entry of entries) {
            const timestamp = entry.ts; // This is now a Unix timestamp in seconds
            const msPlayed = entry.ms_played;
            const trackName = entry.master_metadata_track_name || entry.track_name || 'Unknown Track';
            const artistName = entry.master_metadata_album_artist_name || entry.artist_name || 'Unknown Artist';
            const albumName = entry.master_metadata_album_name || entry.album_name || null;
            const trackUri = entry.spotify_track_uri;

            if (!trackName || !artistName || !trackUri || typeof timestamp !== 'number' || isNaN(timestamp)) {
                Logger.warn('database', `Skipping entry due to missing/invalid fields`, `User: ${discordId}, Track: '${trackName}', Artist: '${artistName}', URI: '${trackUri}', TS: ${timestamp}`);
                invalidEntries++;
                continue;
            }

            if (source === 'recent') {
                // For 'recent' source, check if this exact play (user, track, timestamp) already exists
                const existingPlay = db.prepare(
                    'SELECT id FROM history WHERE discord_id = ? AND spotify_track_uri = ? AND ts = ?'
                ).get(discordId, trackUri, timestamp);

                if (existingPlay) {
                    // Only log the first few duplicate entries, then show a summary
                    if (loggedSkipCount < MAX_SKIP_LOGS) {
                        // We'll track this for summary instead of individual logging
                        loggedSkipCount++;
                    }
                    skipped++;
                    continue;
                }
            }

            // For 'upload' source OR if it's a 'recent' play not found above, insert as a new row.
            try {
                db.prepare(`
                    INSERT INTO history (
                        discord_id, ts, ms_played, track_name, artist_name, album_name, spotify_track_uri, source
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    discordId,
                    timestamp,
                    msPlayed,
                    trackName,
                    artistName,
                    albumName,
                    trackUri,
                    source
                );
                added++;
                
                // Store details of the added track
                addedTracks.push({
                    trackName,
                    artistName,
                    timestamp,
                    discordId
                });
            } catch (e) {
                Logger.error('database', `Error inserting entry`, `User: ${discordId}, Track: ${trackName}, URI: ${trackUri}, TS: ${timestamp}, Error: ${e.message}`);
                invalidEntries++;
            }
        }
    });

    try {
        insertMany(entries);
    } catch (error) {
        Logger.error('database', `Transaction failed during addHistoryEntries`, `User: ${discordId}, Source: ${source}, Error: ${error.message}`);
        throw error;
    }

    // Show summary with indication if there were more skipped entries beyond what we logged
    if (added > 0 || skipped > 0 || invalidEntries > 0) {
        let stats = `Added: ${added}, Skipped: ${skipped}, Invalid: ${invalidEntries}`;
        if (source === 'recent' && skipped > 0) {
            // Use a more condensed tracker summary for recent duplicates
            Logger.tracker('duplicate_summary', `User ${discordId} recent tracks processed`, stats);
        } else {
            Logger.database('processed', `User ${discordId} entries processed from ${source}`, stats);
        }
    }
    return { added, skipped, invalidEntries, addedTracks };
}

// --- Stats Query Functions ---

function getTopSongs(discordId, limit, startTime, endTime) {
    if (!db) throw new Error("Database not initialized yet.");

    Logger.database('debug', `[Debug DB getTopSongs] Params: discordId=${discordId}, limit=${limit}, startTime=${startTime}, endTime=${endTime}`);

    // Modified SQL: Removed ORDER BY and LIMIT
    const stmt = db.prepare(`
        SELECT
            track_name,
            artist_name,
            spotify_track_uri,
            SUM(ms_played) as total_ms_played,
            COUNT(*) as play_count
        FROM history
        WHERE discord_id = ? AND ts >= ? AND ts < ? 
        AND ms_played > 3000
        GROUP BY track_name, artist_name, spotify_track_uri
    `);
    
    // Fetch all grouped results
    let allGroupedSongs = stmt.all(discordId, startTime, endTime);
    
    Logger.database('debug', `[Debug DB getTopSongs] Raw result from stmt.all() before JS sort (count: ${allGroupedSongs.length}):`, JSON.stringify(allGroupedSongs.slice(0, 20), null, 2)); // Log first 20 for brevity

    // Sort in JavaScript
    allGroupedSongs.sort((a, b) => b.total_ms_played - a.total_ms_played);

    // Slice to the limit
    const result = allGroupedSongs.slice(0, limit);
    
    Logger.database('debug', `[Debug DB getTopSongs] Result after JS sort and slice (count: ${result.length}):`, JSON.stringify(result, null, 2));

    return result;
}

function getTopArtists(discordId, limit, startTime, endTime) {
    if (!db) throw new Error("Database not initialized yet.");
    const stmt = db.prepare(`
        SELECT
            artist_name,
            SUM(ms_played) as total_ms_played,
            COUNT(DISTINCT track_name) as unique_tracks,
            COUNT(*) as total_plays
        FROM history
        WHERE discord_id = ? AND ts >= ? AND ts < ? 
        AND ms_played > 3000
        AND artist_name IS NOT NULL AND artist_name != ''
        GROUP BY artist_name
        ORDER BY total_ms_played DESC
        LIMIT ?
    `);
    return stmt.all(discordId, startTime, endTime, limit);
}

function getTopGenres(discordId, limit, startTime, endTime) {
     if (!db) throw new Error("Database not initialized yet.");
    Logger.warn('database', "[DB Get Top Genres] Genre data is fetched live by the /top-genres command by querying artists. This DB function is a placeholder for artist aggregation if direct genre data were stored.");
    const stmt = db.prepare(`
        SELECT
            artist_name as genre_placeholder,
            SUM(ms_played) as total_ms_played
        FROM history
        WHERE discord_id = ? AND ts >= ? AND ts < ? 
        AND ms_played > 3000
        AND artist_name IS NOT NULL AND artist_name != ''
        GROUP BY artist_name
        ORDER BY total_ms_played DESC
        LIMIT ?
    `);
     return stmt.all(discordId, startTime, endTime, limit);
}

function getAllUserDataForPeriod(discordId, startTime, endTime) {
    if (!db) throw new Error("Database not initialized yet.");
    const topSongs = getTopSongs(discordId, 20, startTime, endTime);
    const topArtists = getTopArtists(discordId, 10, startTime, endTime);
    
    // Modified total time calculation to include recent plays and all uploaded history
    const totalTimeStmt = db.prepare(`
        SELECT SUM(ms_played) as total_ms 
        FROM history 
        WHERE discord_id = ? AND ts >= ? AND ts < ? 
        AND ms_played > 3000
    `);
    const totalTimeResult = totalTimeStmt.get(discordId, startTime, endTime);

    return {
        topSongs,
        topArtists,
        totalMsListened: totalTimeResult?.total_ms || 0,
    };
}

// Function to get total stats for a period
function getTotalStatsForPeriod(discordId, startTime, endTime) {
    if (!db) throw new Error("Database not initialized yet.");
    
    const stmt = db.prepare(`
        SELECT 
            SUM(ms_played) as total_ms_played,
            COUNT(*) as total_play_count
        FROM history 
        WHERE discord_id = ? AND ts >= ? AND ts < ? 
        AND ms_played > 3000
    `);
    
    const result = stmt.get(discordId, startTime, endTime);
    return {
        totalMsPlayed: result?.total_ms_played || 0,
        totalPlayCount: result?.total_play_count || 0
    };
}

// --- Data Clearing Function ---
function clearUserData(targetDiscordId) {
    if (!db) throw new Error("Database not initialized yet.");

    try {
        // Using a transaction to ensure atomicity
        db.transaction(() => {
            // Delete from history table
            const historyDeleteStmt = db.prepare('DELETE FROM history WHERE discord_id = ?');
            const historyResult = historyDeleteStmt.run(targetDiscordId);
            Logger.database('delete', `Deleted ${historyResult.changes} entries from history`, `User: ${targetDiscordId}`);

            // Delete from users table
            const userDeleteStmt = db.prepare('DELETE FROM users WHERE discord_id = ?');
            const userResult = userDeleteStmt.run(targetDiscordId);
            Logger.database('delete', `Deleted ${userResult.changes} entry from users`, `User: ${targetDiscordId}`);
        })();
        return { success: true, message: `Successfully cleared data for user ${targetDiscordId}.` };
    } catch (error) {
        Logger.error('database', `Error clearing data for user ${targetDiscordId}`, error.message);
        return { success: false, message: `Failed to clear data for user ${targetDiscordId}. Check logs.` };
    }
}

// Function to get the database instance (used by commands)
function getDbInstance() {
    return db;
}

module.exports = {
    initializeDatabase,
    getUser,
    getAllConnectedUsers,
    addUser,
    linkSpotifyAccount,
    updateUserTokens,
    updateUserColor,
    updateUserPrivacy,
    isUserProfilePublic,
    getUserByDiscordId,
    isAdmin,
    addHistoryEntries,
    getTopSongs,
    getTopArtists,
    getTopGenres,
    getAllUserDataForPeriod,
    getTotalStatsForPeriod,
    clearUserData,
    getDbInstance,
    getDbInstance: () => db
};