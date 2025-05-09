// utils/database.js
const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

// Determine the database path (e.g., in the project root)
const dbPath = path.join(__dirname, '..', 'spotify_stats.db');
let db;

function initializeDatabase() {
    // Ensure verbose logging is off unless debugging
    db = new Database(dbPath, { /* verbose: console.log */ });
    console.log(`[Database] Connected to SQLite database at ${dbPath}`);

    // Enable WAL mode for better concurrency
    try {
        db.pragma('journal_mode = WAL');
        console.log('[Database] WAL mode set.');
    } catch (pragmaError) {
        console.error('[Database] Failed to set WAL mode:', pragmaError);
    }

    // --- Create Tables Transaction ---
    try {
        console.log('[Database] Starting TABLE creation transaction...');
        db.transaction(() => {
            db.prepare(`
                CREATE TABLE IF NOT EXISTS users (
                    discord_id TEXT PRIMARY KEY, spotify_id TEXT UNIQUE,
                    spotify_access_token TEXT, spotify_refresh_token TEXT,
                    token_expires_at INTEGER, embed_color TEXT DEFAULT '#1DB954'
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

            // Create a unique index that includes the track URI
            db.prepare(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_history_unique_play 
                ON history (discord_id, spotify_track_uri, ts)
            `).run();
        })();
        console.log('[Database] TABLE creation transaction committed successfully.');
    } catch (error) {
         console.error('[Database] TABLE creation transaction failed:', error);
         throw error;
    }

    // --- Create Indices (Outside initial transaction) ---
    try {
         db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_history_discord_ts ON history (discord_id, ts DESC)
         `).run();
         console.log('[Database] Indices ensured successfully.');
    } catch (error) {
         console.error('[Database] INDEX creation failed:', error);
         throw error;
    }

    console.log('[Database] Tables and Indices ensured (End of initializeDatabase).');
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
    stmt.run(discordId, spotifyId, accessToken, refreshToken, expiresAt);
}

function updateUserTokens(discordId, accessToken, refreshToken, expiresIn) {
    if (!db) throw new Error("Database not initialized yet.");
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    const stmt = db.prepare(`
        UPDATE users
        SET spotify_access_token = ?,
            ${refreshToken ? 'spotify_refresh_token = ?,' : ''}
            token_expires_at = ?
        WHERE discord_id = ?
    `);
    const params = [accessToken];
    if (refreshToken) {
        params.push(refreshToken);
    }
    params.push(expiresAt, discordId);
    stmt.run(...params);
}

function updateUserColor(discordId, color) {
    if (!db) throw new Error("Database not initialized yet.");
    const stmt = db.prepare('UPDATE users SET embed_color = ? WHERE discord_id = ?');
    const info = stmt.run(color, discordId);
    return info.changes > 0;
}

// --- History Functions ---

function addHistoryEntries(discordId, entries, source) {
    if (!db) throw new Error("Database not initialized yet.");
    addUser(discordId); // Ensure user exists

    let added = 0;
    let skipped = 0;
    let invalidEntries = 0;

    const insertMany = db.transaction((entries) => {
        for (const entry of entries) {
            const timestamp = entry.ts;
            const msPlayed = entry.ms_played;
            const trackName = entry.master_metadata_track_name || entry.track_name || 'Unknown Track';
            const artistName = entry.master_metadata_album_artist_name || entry.artist_name || 'Unknown Artist';
            const albumName = entry.master_metadata_album_name || entry.album_name || null;
            const trackUri = entry.spotify_track_uri;

            // Validate required fields
            if (!trackName || !artistName || !trackUri) {
                console.log(`[Database] Skipping entry for ${discordId}: Missing required fields (track: ${trackName}, artist: ${artistName}, uri: ${trackUri})`);
                invalidEntries++;
                continue;
            }

            // --- NEW LOGIC: For 'recent', always insert as new row ---
            if (source === 'recent') {
                try {
                    const date = new Date(timestamp);
                    if (isNaN(date.getTime())) {
                        console.log(`[Database] Invalid timestamp for ${discordId}: ${timestamp}`);
                        invalidEntries++;
                        continue;
                    }
                } catch (e) {
                    console.log(`[Database] Error processing timestamp for ${discordId}: ${timestamp}, Error: ${e.message}`);
                    invalidEntries++;
                    continue;
                }
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
                } catch (e) {
                    // If there's a unique constraint error, skip (shouldn't happen with unique ts)
                    skipped++;
                }
                continue;
            }
            // --- END NEW LOGIC ---

            // --- Existing deduplication logic for uploads ---
            // Check if this song was recently played (within its duration + 60 seconds buffer)
            const recentPlayCheck = db.prepare(`
                SELECT ts, ms_played 
                FROM history 
                WHERE discord_id = ? 
                AND spotify_track_uri = ? 
                AND ts > ? - (ms_played / 1000 + 60)  -- Check within song duration + 60 seconds
                ORDER BY ts DESC 
                LIMIT 1
            `).get(discordId, trackUri, timestamp);

            if (recentPlayCheck) {
                // If this is a recent play, update the existing entry instead of creating a new one
                const result = db.prepare(`
                    UPDATE history 
                    SET ms_played = ms_played + ?,
                        source = CASE 
                            WHEN source = 'upload' THEN 'upload'
                            ELSE ?
                        END
                    WHERE discord_id = ? 
                    AND spotify_track_uri = ? 
                    AND ts = ?
                `).run(
                    msPlayed,
                    source,
                    discordId,
                    trackUri,
                    recentPlayCheck.ts
                );

                if (result.changes > 0) {
                    console.log(`[Database] Updated recent play for ${discordId}: ${trackName} by ${artistName} (URI: ${trackUri})`);
                    skipped++;
                }
                continue;
            }

            // Validate timestamp before processing
            try {
                const date = new Date(timestamp);
                if (isNaN(date.getTime())) {
                    console.log(`[Database] Invalid timestamp for ${discordId}: ${timestamp}`);
                    invalidEntries++;
                    continue;
                }
            } catch (e) {
                console.log(`[Database] Error processing timestamp for ${discordId}: ${timestamp}, Error: ${e.message}`);
                invalidEntries++;
                continue;
            }

            const result = db.prepare(`
                INSERT INTO history (
                    discord_id, ts, ms_played, track_name, artist_name, album_name, spotify_track_uri, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(discord_id, spotify_track_uri, ts) DO UPDATE SET
                    ms_played = CASE 
                        WHEN excluded.source = 'recent' AND history.source = 'recent' THEN history.ms_played
                        WHEN excluded.source = 'recent' THEN history.ms_played
                        WHEN history.source = 'recent' THEN excluded.ms_played
                        ELSE history.ms_played + excluded.ms_played
                    END,
                    source = CASE 
                        WHEN excluded.source = 'upload' THEN 'upload'
                        ELSE history.source
                    END
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

            if (result.changes > 0) {
                added++;
            } else {
                // Handle both recent tracks and uploaded history data structures
                const trackName = entry.track_name || entry.master_metadata_track_name;
                const artistName = entry.artist_name || entry.master_metadata_album_artist_name;
                
                // Convert timestamp to milliseconds if it's in seconds (less than 1e12)
                const timestampMs = timestamp < 1e12 ? timestamp * 1000 : timestamp;
                try {
                    const dateStr = new Date(timestampMs).toISOString();
                    console.log(`[Database] Updated existing entry for ${discordId}: ${trackName || 'Unknown Track'} by ${artistName || 'Unknown Artist'} at ${dateStr} (URI: ${entry.spotify_track_uri || 'No URI'})`);
                } catch (e) {
                    console.log(`[Database] Updated existing entry for ${discordId}: ${trackName || 'Unknown Track'} by ${artistName || 'Unknown Artist'} (invalid timestamp: ${timestamp}, URI: ${entry.spotify_track_uri || 'No URI'})`);
                }
                skipped++;
            }
        }
    });

    try {
        insertMany(entries);
    } catch (error) {
        console.error(`[Database Error] Transaction failed during addHistoryEntries for ${discordId} (Source: ${source}):`, error);
        throw error;
    }

    if (added > 0 || skipped > 0 || invalidEntries > 0) {
        console.log(`[Database] User ${discordId}: Added ${added}, Skipped ${skipped}, Invalid ${invalidEntries} history entries. Source: ${source}.`);
    }
    return { added, skipped, invalidEntries };
}

// --- Stats Query Functions ---

function getTopSongs(discordId, limit, startTime, endTime) {
    if (!db) throw new Error("Database not initialized yet.");
    const stmt = db.prepare(`
        SELECT
            track_name,
            artist_name,
            spotify_track_uri,
            SUM(CASE 
                WHEN source = 'recent' THEN 180000 -- Assume 3 minutes for recent plays
                ELSE ms_played 
            END) as total_ms_played,
            COUNT(*) as play_count
        FROM history
        WHERE discord_id = ? AND ts >= ? AND ts < ? 
        AND (ms_played > 3000 OR source = 'recent')
        GROUP BY track_name, artist_name, spotify_track_uri
        ORDER BY total_ms_played DESC
        LIMIT ?
    `);
    return stmt.all(discordId, startTime, endTime, limit);
}

function getTopArtists(discordId, limit, startTime, endTime) {
    if (!db) throw new Error("Database not initialized yet.");
    const stmt = db.prepare(`
        SELECT
            artist_name,
            SUM(CASE 
                WHEN source = 'recent' THEN 180000 -- Assume 3 minutes for recent plays
                ELSE ms_played 
            END) as total_ms_played,
            COUNT(DISTINCT track_name) as unique_tracks,
            COUNT(*) as total_plays
        FROM history
        WHERE discord_id = ? AND ts >= ? AND ts < ? 
        AND (ms_played > 3000 OR source = 'recent')
        AND artist_name IS NOT NULL AND artist_name != ''
        GROUP BY artist_name
        ORDER BY total_ms_played DESC
        LIMIT ?
    `);
    return stmt.all(discordId, startTime, endTime, limit);
}

function getTopGenresPlaceholder(discordId, limit, startTime, endTime) {
     if (!db) throw new Error("Database not initialized yet.");
    console.warn("[DB Get Top Genres Placeholder] Genre data is not directly available in history. This function provides a basic artist aggregation as a placeholder.");
    const stmt = db.prepare(`
        SELECT
            artist_name as genre_placeholder,
            SUM(ms_played) as total_ms_played
        FROM history
        WHERE discord_id = ? AND ts >= ? AND ts < ? AND ms_played > 3000 AND artist_name IS NOT NULL AND artist_name != ''
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
    
    // Modified total time calculation to include recent plays
    const totalTimeStmt = db.prepare(`
        SELECT SUM(CASE 
            WHEN source = 'recent' THEN 180000 -- Assume 3 minutes for recent plays
            ELSE ms_played 
        END) as total_ms 
        FROM history 
        WHERE discord_id = ? AND ts >= ? AND ts < ? 
        AND (ms_played > 3000 OR source = 'recent')
    `);
    const totalTimeResult = totalTimeStmt.get(discordId, startTime, endTime);

    return {
        topSongs,
        topArtists,
        totalMsListened: totalTimeResult?.total_ms || 0,
    };
}

module.exports = {
    initializeDatabase,
    getUser,
    getAllConnectedUsers,
    addUser,
    linkSpotifyAccount,
    updateUserTokens,
    updateUserColor,
    addHistoryEntries,
    getTopSongs,
    getTopArtists,
    getTopGenresPlaceholder,
    getAllUserDataForPeriod,
    getDbInstance: () => db
};