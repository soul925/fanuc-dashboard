const opcua = require("./opcua");

exports.getProgram = async (robotId) => {
    if (!opcua.isConnected(robotId)) {
        return {
            success: false,
            connected: false,
            currentProgram: "--",
            speed: "--",
            mode: "--",
            programStatus: "Disconnected",
            message: "Robot not connected"
        };
    }

    try {
        const status = await opcua.readStatus(robotId);
        return {
            success: true,
            connected: true,
            currentProgram: status.program || "--",
            speed: status.speed !== undefined && status.speed !== null ? status.speed : "--",
            mode: status.mode || "--",
            programStatus: status.program && status.program !== "--" ? "Loaded" : "No program loaded"
        };
    } catch (err) {
        return {
            success: false,
            connected: true,
            currentProgram: "--",
            speed: "--",
            mode: "--",
            programStatus: "Error",
            error: err.message
        };
    }
};