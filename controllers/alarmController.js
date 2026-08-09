const alarmService = require("../services/alarms");

exports.getAlarms = async (req, res) => {
    try {
        const { robotId } = req.params;
        const data = await alarmService.getAlarms(robotId);
        res.json(data);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};