// controllers/logController.js

const database = require("../services/database");
const logger = require("../services/logger");

exports.getLogs = (req, res) => {
    try {
        const { robotId, level, module, search, limit } = req.query;
        const logs = database.getLogs({
            robotId,
            level,
            module,
            search,
            limit: limit || 500
        });

        res.json({
            success: true,
            count: logs.length,
            logs
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.clearLogs = (req, res) => {
    try {
        const result = database.clearLogs();
        res.json({
            success: result,
            message: result ? "Application logs cleared successfully." : "Failed to clear logs."
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
