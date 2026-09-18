// services/alarms.js

const opcua = require("./opcua");
const database = require("./database");
const robotManager = require("./robotManager");
const logger = require("./logger");
const fs = require("fs");
const path = require("path");

let ALARM_NODE = "ns=2;s=Alarm";
try {
    const nodeConfig = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../config/nodes.json"), "utf8")
    );
    if (nodeConfig?.robot?.alarm) {
        ALARM_NODE = nodeConfig.robot.alarm;
    }
} catch (err) {
    logger.warn("Could not read alarm node from config/nodes.json, using default ns=2;s=Alarm");
}

/**
 * Parse an alarm string into structured { code, description, raw, status }.
 * Examples:
 *  - "SRVO-402 DCS Cart. pos. limit(No.1,G1,M0) 11" -> { code: "SRVO-402", description: "DCS Cart. pos. limit(No.1,G1,M0) 11" }
 *  - "[SYST-040] Operation mode AUTO Selected" -> { code: "SYST-040", description: "Operation mode AUTO Selected" }
 *  - "TRIAL Program Stopped" -> { code: "ALARM", description: "TRIAL Program Stopped" }
 */
function parseAlarmEntry(entry) {
    if (!entry) return null;
    let raw = String(entry).trim();
    // Strip raw array brackets or quote wrappers
    raw = raw.replace(/^\["|"\]$/g, '').replace(/^\[|\]$/g, '').replace(/^"|"$/g, '').trim();

    if (!raw || raw.toLowerCase() === "null" || raw.toLowerCase() === "undefined" || raw === "[]") {
        return null;
    }

    const match = raw.match(/^\[?([A-Za-z]{3,5}-\d{2,4})\]?\s*(.*)$/);
    if (match) {
        return {
            code: match[1].toUpperCase(),
            description: match[2].trim() || match[1],
            raw,
            status: "Active"
        };
    }

    return {
        code: "ALARM",
        description: raw,
        raw,
        status: "Active"
    };
}

/**
 * Clean and normalize raw OPC UA alarm variants into structured alarm objects.
 * Strictly ignores nulls, empty entries, and pseudo-null representations.
 */
function normalizeAlarms(value) {
    if (value === null || value === undefined) {
        return [];
    }

    const items = [];

    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        Array.from(value)
            .flat(Infinity)
            .forEach(item => {
                const parsed = parseAlarmEntry(item);
                if (parsed) items.push(parsed);
            });
    } else if (typeof value === "object") {
        if (value.text !== undefined) {
            const parsed = parseAlarmEntry(value.text);
            if (parsed) items.push(parsed);
        } else if (value.value !== undefined) {
            return normalizeAlarms(value.value);
        }
    } else {
        const parsed = parseAlarmEntry(value);
        if (parsed) items.push(parsed);
    }

    return items;
}

/**
 * Get Current Active Alarms and SQLite-Persisted Alarm History with State Transition Sync.
 */
async function getAlarms(robotId, options = {}) {
    const limit = typeof options === "number" ? options : (options.limit || 500);
    const search = options.search || "";
    const status = options.status || "";

    const robot = robotManager.getRobotInternal(robotId);
    const robotName = robot?.name || robotId || "FANUC Robot";
    const robotIp = robot?.ip || "";

    try {
        if (!opcua.isConnected(robotId)) {
            // When disconnected, sync with empty active list so any unresolved active alarms in DB remain until reconnected or marked
            const history = database.getAlarmHistory({ robotId, limit, search, status });
            return {
                success: false,
                connected: false,
                robotId,
                robotName,
                activeCount: 0,
                activeAlarms: [],
                current: null,
                history,
                message: "Robot not connected"
            };
        }

        const result = await opcua.readNode(robotId, ALARM_NODE);

        if (!result || !result.success) {
            const history = database.getAlarmHistory({ robotId, limit, search, status });
            return {
                success: false,
                connected: true,
                robotId,
                robotName,
                activeCount: 0,
                activeAlarms: [],
                current: null,
                history,
                error: result?.error || "Failed to read alarm node"
            };
        }

        const activeAlarms = normalizeAlarms(result.value);
        const alarmTimestamp = result.sourceTimestamp || result.serverTimestamp || new Date().toISOString();
        const tsString = typeof alarmTimestamp === "string" ? alarmTimestamp : alarmTimestamp.toISOString();

        // Sync active state transitions into SQLite:
        // - Inserts new alarms as 'Active'
        // - Updates 'last_seen' for ongoing alarms
        // - Marks removed alarms as 'Resolved' with 'resolved_at'
        database.syncAlarmState(robotId, robotName, robotIp, activeAlarms, tsString);

        const history = database.getAlarmHistory({ robotId, limit, search, status });

        return {
            success: true,
            connected: true,
            robotId,
            robotName,
            robotIp,
            activeCount: activeAlarms.length,
            activeAlarms,
            current: activeAlarms.length > 0 ? {
                code: activeAlarms[0].code,
                description: activeAlarms.map(a => a.description).join("\n"),
                timestamp: tsString,
                status: "Active"
            } : null,
            history
        };
    } catch (err) {
        logger.error(`Alarm service error: ${err.message}`, { robotId, module: "Alarms" });
        const history = database.getAlarmHistory({ robotId, limit, search, status });
        return {
            success: false,
            connected: true,
            robotId,
            robotName,
            activeCount: 0,
            activeAlarms: [],
            current: null,
            history,
            error: err.message
        };
    }
}

/**
 * Clear stored alarm history in SQLite.
 */
function clearHistory(robotId = "all") {
    return database.clearAlarmHistory(robotId);
}

module.exports = {
    getAlarms,
    normalizeAlarms,
    parseAlarmEntry,
    clearHistory,
    database
};