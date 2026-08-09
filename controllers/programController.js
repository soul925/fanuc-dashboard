const programService = require("../services/programs");

exports.getProgram = async (req, res) => {
    try {
        const { robotId } = req.params;
        const data = await programService.getProgram(robotId);
        res.json(data);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};