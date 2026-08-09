const overviewService = require("../services/overview");

exports.getOverview = async (req, res) => {
    try {
        const { robotId } = req.params;
        const data = await overviewService.getOverview(robotId);
        res.json(data);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};