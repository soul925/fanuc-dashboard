// services/registers.js

const opcua = require("./opcua");

/**
 * Get Modbus Registers (IR & DR)
 */
async function getRegisters(robotId) {
    if (!opcua.isConnected(robotId)) {
        return {
            success: false,
            connected: false,
            inputRegisters: [],
            holdingRegisters: []
        };
    }

    try {
        const modbusData = await opcua.readModbus(robotId);
        return {
            success: true,
            connected: true,
            inputRegisters: modbusData.inputRegisters || [],
            holdingRegisters: modbusData.holdingRegisters || []
        };
    } catch (err) {
        return {
            success: false,
            connected: true,
            error: err.message,
            inputRegisters: [],
            holdingRegisters: []
        };
    }
}

/**
 * Write FANUC Data Register (node ns=1;i=304).
 * FANUC numbering starts at 1 (DR[1]).
 */
async function writeDataRegister(robotId, index, value) {
    if (!opcua.isConnected(robotId)) {
        return {
            success: false,
            connected: false,
            message: "Robot not connected"
        };
    }

    const regIndex = parseInt(index, 10);
    if (isNaN(regIndex) || regIndex < 1) {
        return {
            success: false,
            connected: true,
            message: "Data Register numbering must start from 1 (e.g. DR[1])"
        };
    }

    try {
        const result = await opcua.writeDataRegister(robotId, regIndex, value);
        return {
            success: result.success,
            connected: true,
            index: regIndex,
            value: Number(value),
            verifiedValue: result.verifiedValue,
            message: result.message || `Data Register DR[${regIndex}] updated to ${value}`
        };
    } catch (err) {
        return {
            success: false,
            connected: true,
            error: err.message,
            message: `Failed to write Data Register DR[${regIndex}]: ${err.message}`
        };
    }
}

module.exports = {
    getRegisters,
    writeDataRegister
};
