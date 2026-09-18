const registerService = require("../services/registers");

exports.getRegisters = async (req, res) => {
    try {
        const { robotId } = req.params;
        const data = await registerService.getRegisters(robotId);
        res.json(data);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.writeRegister = async (req, res) => {
    try {
        const { robotId, index, value } = req.body;
        if (!robotId || index === undefined || value === undefined) {
            return res.status(400).json({
                success: false,
                message: "robotId, index, and value are required"
            });
        }
        const data = await registerService.writeDataRegister(robotId, index, value);
        res.json(data);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};