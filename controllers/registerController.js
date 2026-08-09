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