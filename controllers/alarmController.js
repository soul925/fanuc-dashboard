// controllers/alarmController.js

const alarmService = require("../services/alarms");
const database = require("../services/database");

exports.getAlarms = async (req, res) => {
    try {
        const { robotId } = req.params;
        const limit = req.query.limit || 500;
        const search = req.query.search || "";
        const status = req.query.status || "";

        if (robotId === "all") {
            const history = database.getAlarmHistory({ robotId: "all", limit, search, status });
            return res.json({
                success: true,
                robotId: "all",
                robotName: "All Robots",
                activeCount: 0,
                activeAlarms: [],
                current: null,
                history
            });
        }

        const data = await alarmService.getAlarms(robotId, { limit, search, status });
        res.json(data);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.clearAlarms = async (req, res) => {
    try {
        const robotId = req.body?.robotId || req.query?.robotId || "all";
        const cleared = alarmService.clearHistory(robotId);
        res.json({
            success: cleared,
            message: cleared ? `Alarm history for "${robotId}" cleared successfully.` : "Failed to clear alarm history."
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};