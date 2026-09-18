// services/database.js

const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "../data");
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Unified SQLite database location on disk
const dbPath = path.join(dataDir, "robot_manager.db");
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high concurrency and immediate process visibility
db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`);

// Initialize schemas
db.exec(`
    CREATE TABLE IF NOT EXISTS alarm_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        robot_id TEXT NOT NULL,
        robot_name TEXT,
        robot_ip TEXT,
        alarm_code TEXT,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_alarm_robot ON alarm_history(robot_id);
    CREATE INDEX IF NOT EXISTS idx_alarm_status ON alarm_history(status);

    CREATE TABLE IF NOT EXISTS backup_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        robot_id TEXT NOT NULL,
        robot_name TEXT,
        robot_ip TEXT,
        backup_type TEXT NOT NULL DEFAULT 'Application Backup (FTP MDB:)',
        file_count INTEGER NOT NULL DEFAULT 0,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        size_mb TEXT NOT NULL DEFAULT '0.00',
        status TEXT NOT NULL DEFAULT 'SUCCESS',
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        error_message TEXT,
        timestamp TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_backup_robot ON backup_history(robot_id);

    CREATE TABLE IF NOT EXISTS app_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        robot_id TEXT,
        level TEXT NOT NULL DEFAULT 'INFO',
        module TEXT NOT NULL DEFAULT 'System',
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_logs_robot ON app_logs(robot_id);
    CREATE INDEX IF NOT EXISTS idx_logs_level ON app_logs(level);
`);

// Graceful column migrations for extended backup diagnostic fields
try { db.exec(`ALTER TABLE backup_history ADD COLUMN files_found INTEGER DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE backup_history ADD COLUMN files_downloaded INTEGER DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE backup_history ADD COLUMN files_failed INTEGER DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE backup_history ADD COLUMN verified_entries INTEGER DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE backup_history ADD COLUMN details_json TEXT;`); } catch {}

/**
 * Sync active alarms with persistent SQLite database using state transition logic:
 * 1. New alarm -> INSERT record (Active, first_seen, last_seen)
 * 2. Ongoing alarm -> UPDATE last_seen
 * 3. Cleared alarm -> UPDATE status = 'Resolved', resolved_at
 */
function syncAlarmState(robotId, robotName, robotIp, activeAlarmsList = [], currentTimestamp = null) {
    const rId = (robotId || "default").trim();
    const rName = (robotName || rId).trim();
    const rIp = (robotIp || "").trim();
    const ts = currentTimestamp || new Date().toISOString();

    try {
        // 1. Get all currently Active records in database for this robot
        const activeRowsStmt = db.prepare(`
            SELECT id, alarm_code, description 
            FROM alarm_history 
            WHERE robot_id = ? AND status = 'Active'
        `);
        const dbActiveRows = activeRowsStmt.all(rId) || [];

        const matchedDbIds = new Set();

        // 2. Process each currently observed active alarm
        activeAlarmsList.forEach(alarm => {
            const code = (alarm.code || "ALARM").trim().toUpperCase();
            const desc = (alarm.description || "").trim();
            if (!desc || desc.toLowerCase() === "null" || desc.toLowerCase() === "undefined" || desc === "[]") {
                return;
            }

            // Find matching active record in DB
            const existing = dbActiveRows.find(row => 
                row.alarm_code === code && row.description === desc && !matchedDbIds.has(row.id)
            );

            if (existing) {
                // Ongoing alarm: update last_seen only (do not duplicate records)
                matchedDbIds.add(existing.id);
                const updateStmt = db.prepare(`
                    UPDATE alarm_history 
                    SET last_seen = ?, robot_name = ?, robot_ip = ? 
                    WHERE id = ?
                `);
                updateStmt.run(ts, rName, rIp, existing.id);
            } else {
                // New alarm event: insert new record
                const insertStmt = db.prepare(`
                    INSERT INTO alarm_history (robot_id, robot_name, robot_ip, alarm_code, description, status, first_seen, last_seen)
                    VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)
                `);
                insertStmt.run(rId, rName, rIp, code, desc, ts, ts);
            }
        });

        // 3. Mark any DB active alarms that are no longer active as 'Resolved'
        dbActiveRows.forEach(row => {
            if (!matchedDbIds.has(row.id)) {
                const resolveStmt = db.prepare(`
                    UPDATE alarm_history 
                    SET status = 'Resolved', resolved_at = ? 
                    WHERE id = ? AND status = 'Active'
                `);
                resolveStmt.run(ts, row.id);
            }
        });

        return true;
    } catch (err) {
        console.error(`[Database Error] syncAlarmState for ${rId}:`, err.message);
        return false;
    }
}

/**
 * Fetch persistent alarm history with search, robot filter, status filter, and pagination.
 */
function getAlarmHistory(options = {}) {
    try {
        const robotId = typeof options === "string" ? options : options.robotId;
        const search = options.search ? options.search.trim().toLowerCase() : "";
        const status = options.status ? options.status.trim() : "";
        
        let limit = 500;
        if (options.limit === "all" || options.limit === 0 || options.limit === "0") {
            limit = 50000;
        } else if (options.limit) {
            limit = Math.max(1, Math.min(parseInt(options.limit, 10) || 500, 50000));
        }

        let query = `
            SELECT id, robot_id, robot_name, robot_ip, alarm_code, description, status, first_seen, last_seen, created_at, resolved_at 
            FROM alarm_history 
            WHERE description IS NOT NULL AND description != '' AND description != 'null'
        `;
        const params = [];

        if (robotId && robotId !== "all") {
            query += ` AND robot_id = ?`;
            params.push(robotId);
        }

        if (status && status !== "all") {
            query += ` AND status = ?`;
            params.push(status);
        }

        if (search) {
            query += ` AND (LOWER(description) LIKE ? OR LOWER(alarm_code) LIKE ? OR LOWER(robot_id) LIKE ? OR LOWER(robot_name) LIKE ?)`;
            const sParam = `%${search}%`;
            params.push(sParam, sParam, sParam, sParam);
        }

        query += ` ORDER BY id DESC LIMIT ?`;
        params.push(limit);

        const stmt = db.prepare(query);
        return stmt.all(...params) || [];
    } catch (err) {
        console.error(`[Database Error] getAlarmHistory:`, err.message);
        return [];
    }
}

/**
 * Clear stored alarm history records for a specific robot or all robots.
 */
function clearAlarmHistory(robotId = "all") {
    try {
        if (robotId && robotId !== "all") {
            const stmt = db.prepare(`DELETE FROM alarm_history WHERE robot_id = ?`);
            stmt.run(robotId);
        } else {
            db.exec(`DELETE FROM alarm_history`);
        }
        return true;
    } catch (err) {
        console.error(`[Database Error] clearAlarmHistory:`, err.message);
        return false;
    }
}

/**
 * Record completed backup archive in SQLite with full verification metrics.
 */
function saveBackupRecord(record) {
    try {
        const stmt = db.prepare(`
            INSERT INTO backup_history (
                robot_id, robot_name, robot_ip, backup_type, 
                file_count, size_bytes, size_mb, status, 
                filename, file_path, error_message, timestamp,
                files_found, files_downloaded, files_failed, verified_entries, details_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            record.robotId || "default",
            record.robotName || record.robotId || "FANUC Robot",
            record.robotIp || "",
            record.backupType || "Application Backup (FTP MDB:)",
            parseInt(record.filesDownloaded || record.fileCount, 10) || 0,
            parseInt(record.sizeBytes, 10) || 0,
            String(record.sizeMB || "0.00"),
            record.status || "SUCCESS",
            record.filename || "",
            record.filePath || "",
            record.errorMessage || null,
            record.timestamp || new Date().toISOString(),
            parseInt(record.filesFound, 10) || 0,
            parseInt(record.filesDownloaded || record.fileCount, 10) || 0,
            parseInt(record.filesFailed, 10) || 0,
            parseInt(record.verifiedEntries, 10) || 0,
            typeof record.detailsJson === "object" ? JSON.stringify(record.detailsJson) : (record.detailsJson || null)
        );
        return true;
    } catch (err) {
        console.error(`[Database Error] saveBackupRecord:`, err.message);
        return false;
    }
}

/**
 * Get backup history records from SQLite.
 */
function getBackupHistory(robotId = null, limit = 100) {
    try {
        const numLimit = Math.max(1, Math.min(parseInt(limit, 10) || 100, 1000));
        if (robotId && robotId !== "all") {
            const stmt = db.prepare(`
                SELECT * FROM backup_history 
                WHERE robot_id = ? 
                ORDER BY id DESC 
                LIMIT ?
            `);
            return stmt.all(robotId, numLimit) || [];
        } else {
            const stmt = db.prepare(`
                SELECT * FROM backup_history 
                ORDER BY id DESC 
                LIMIT ?
            `);
            return stmt.all(numLimit) || [];
        }
    } catch (err) {
        console.error(`[Database Error] getBackupHistory:`, err.message);
        return [];
    }
}

/**
 * Delete backup record from SQLite.
 */
function deleteBackupRecord(filename) {
    try {
        const stmt = db.prepare(`DELETE FROM backup_history WHERE filename = ?`);
        stmt.run(filename);
        return true;
    } catch (err) {
        console.error(`[Database Error] deleteBackupRecord:`, err.message);
        return false;
    }
}

/**
 * Record application log event in SQLite.
 */
function insertLog(timestamp, robotId, level, module, message) {
    try {
        const stmt = db.prepare(`
            INSERT INTO app_logs (timestamp, robot_id, level, module, message)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(
            timestamp || new Date().toISOString(),
            robotId || null,
            (level || "INFO").toUpperCase(),
            module || "System",
            message || ""
        );
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Fetch application logs from SQLite with filtering.
 */
function getLogs(options = {}) {
    try {
        const robotId = options.robotId;
        const level = options.level;
        const module = options.module;
        const search = options.search ? options.search.trim().toLowerCase() : "";
        const limit = Math.max(1, Math.min(parseInt(options.limit || 500, 10), 5000));

        let query = `SELECT id, timestamp, robot_id, level, module, message, created_at FROM app_logs WHERE 1=1`;
        const params = [];

        if (robotId && robotId !== "all") {
            query += ` AND robot_id = ?`;
            params.push(robotId);
        }

        if (level && level !== "all") {
            query += ` AND level = ?`;
            params.push(level.toUpperCase());
        }

        if (module && module !== "all") {
            query += ` AND LOWER(module) = ?`;
            params.push(module.toLowerCase());
        }

        if (search) {
            query += ` AND (LOWER(message) LIKE ? OR LOWER(module) LIKE ? OR LOWER(robot_id) LIKE ?)`;
            const s = `%${search}%`;
            params.push(s, s, s);
        }

        query += ` ORDER BY id DESC LIMIT ?`;
        params.push(limit);

        const stmt = db.prepare(query);
        return stmt.all(...params) || [];
    } catch (err) {
        console.error(`[Database Error] getLogs:`, err.message);
        return [];
    }
}

/**
 * Clear application logs.
 */
function clearLogs() {
    try {
        db.exec(`DELETE FROM app_logs`);
        return true;
    } catch (err) {
        return false;
    }
}

module.exports = {
    syncAlarmState,
    getAlarmHistory,
    clearAlarmHistory,
    saveBackupRecord,
    getBackupHistory,
    deleteBackupRecord,
    insertLog,
    getLogs,
    clearLogs,
    dbFilePath: dbPath,
    db
};
