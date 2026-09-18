// services/logger.js

const fs = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const appLogFile = path.join(logsDir, "app.log");
const errorLogFile = path.join(logsDir, "error.log");

function formatMessage(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    let metaStr = "";
    if (meta) {
        try {
            metaStr = " " + JSON.stringify(meta);
        } catch {
            metaStr = " [Meta error]";
        }
    }
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
}

function appendLog(file, text) {
    try {
        fs.appendFileSync(file, text, "utf8");
    } catch (err) {
        console.error("Failed to write to log file:", err.message);
    }
}

function recordToDb(level, message, meta = null) {
    try {
        const database = require("./database");
        const timestamp = new Date().toISOString();
        const robotId = meta?.robotId || (meta && typeof meta === "string" ? meta : null);
        const module = meta?.module || "System";
        database.insertLog(timestamp, robotId, level, module, message);
    } catch {}
}

const logger = {
    info(message, meta = null) {
        const text = formatMessage("INFO", message, meta);
        console.log(`[INFO] ${message}`, meta || "");
        appendLog(appLogFile, text);
        recordToDb("INFO", message, meta);
    },

    warn(message, meta = null) {
        const text = formatMessage("WARN", message, meta);
        console.warn(`[WARN] ${message}`, meta || "");
        appendLog(appLogFile, text);
        recordToDb("WARN", message, meta);
    },

    error(message, meta = null) {
        const text = formatMessage("ERROR", message, meta);
        console.error(`[ERROR] ${message}`, meta || "");
        appendLog(appLogFile, text);
        appendLog(errorLogFile, text);
        recordToDb("ERROR", message, meta);
    },

    getRecentLogs(lines = 100) {
        try {
            if (!fs.existsSync(appLogFile)) return [];
            const data = fs.readFileSync(appLogFile, "utf8");
            return data.split("\n").filter(Boolean).slice(-lines);
        } catch (err) {
            console.error("Failed to read log file:", err.message);
            return [];
        }
    },

    logPaths: {
        appLog: appLogFile,
        errorLog: errorLogFile
    }
};

module.exports = logger;
