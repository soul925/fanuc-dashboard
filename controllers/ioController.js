const ioService = require("../services/io");

exports.getIO = async (req, res) => {
    try {
        const { robotId } = req.params;
        const data = await ioService.getIO(robotId);
        res.json(data);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.writeIO = async (req, res) => {
    try {
        const { robotId, index, value } = req.body;
        if (!robotId || index === undefined || value === undefined) {
            return res.status(400).json({
                success: false,
                message: "robotId, index, and value are required"
            });
        }
        const data = await ioService.writeDigitalOutput(robotId, index, value);
        res.json(data);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};