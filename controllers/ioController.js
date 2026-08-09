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