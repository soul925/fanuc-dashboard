// services/io.js

const opcua = require("./opcua");

/**
 * Get Digital I/O states (DI & DO).
 */
async function getIO(robotId) {
    if (!opcua.isConnected(robotId)) {
        return {
            success: false,
            connected: false,
            digitalInputs: [],
            digitalOutputs: []
        };
    }

    try {
        const modbusData = await opcua.readModbus(robotId);
        return {
            success: true,
            connected: true,
            digitalInputs: modbusData.digitalInputs || [],
            digitalOutputs: modbusData.digitalOutputs || []
        };
    } catch (err) {
        return {
            success: false,
            connected: true,
            error: err.message,
            digitalInputs: [],
            digitalOutputs: []
        };
    }
}

/**
 * Write Digital Output (node ns=1;i=302).
 * FANUC numbering starts at 1 (DO[1]).
 */
async function writeDigitalOutput(robotId, index, value) {
    if (!opcua.isConnected(robotId)) {
        return {
            success: false,
            connected: false,
            message: "Robot not connected"
        };
    }

    const doIndex = parseInt(index, 10);
    if (isNaN(doIndex) || doIndex < 1) {
        return {
            success: false,
            connected: true,
            message: "Digital Output numbering must start from 1 (e.g. DO[1])"
        };
    }

    try {
        const result = await opcua.writeDigitalOutput(robotId, doIndex, Boolean(value));
        return {
            success: result.success,
            connected: true,
            index: doIndex,
            value: Boolean(value),
            message: result.success ? `Digital Output DO[${doIndex}] set to ${Boolean(value) ? 'ON' : 'OFF'}` : (result.error || "Write failed")
        };
    } catch (err) {
        return {
            success: false,
            connected: true,
            error: err.message,
            message: `Failed to write Digital Output DO[${doIndex}]: ${err.message}`
        };
    }
}

module.exports = {
    getIO,
    writeDigitalOutput
};
