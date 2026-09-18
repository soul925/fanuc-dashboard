const opcua = require("./opcua");
const robotManager = require("./robotManager");

/**
 * Get robot overview information
 */
async function getOverview(robotId) {
    const isConnected = opcua.isConnected(robotId);
    const robotProfile = robotManager.getRobot(robotId) || {};

    if (!isConnected) {
        return {
            success: true,
            connected: false,
            robotId,
            name: robotProfile.name || robotId,
            manufacturer: robotProfile.manufacturer || "FANUC",
            model: robotProfile.model || "--",
            ip: robotProfile.ip || "--",
            endpoint: robotProfile.endpoint || "--",
            status: "Disconnected"
        };
    }

    try {
        const status = await opcua.readStatus(robotId);

        return {
            success: true,
            connected: true,
            robotId,
            name: robotProfile.name || robotId,
            manufacturer: robotProfile.manufacturer || "FANUC",
            model: status.model || robotProfile.model || "--",
            speed: status.speed || "--",
            mode: status.mode || "--",
            estop: status.estop || "--",
            pstop: status.pstop || "--",
            program: status.program || "--",
            ip: robotProfile.ip || "--",
            endpoint: robotProfile.endpoint || "--",
            status: "Connected"
        };
    } catch (err) {
        return {
            success: false,
            connected: true,
            robotId,
            error: err.message
        };
    }
}

module.exports = {
    getOverview
};
