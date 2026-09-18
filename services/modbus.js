// services/modbus.js

const reader = require("./reader");
const writer = require("./writer");
const { DataType } = require("node-opcua");
const fs = require("fs");
const path = require("path");

const NODE_CONFIG = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "../config/nodes.json"),
        "utf8"
    )
);

/**
 * Slice array of raw data without creating nested objects.
 */
function formatArray(data, start = 0, count = 128) {
    if (!data || (!Array.isArray(data) && !ArrayBuffer.isView(data))) {
        return [];
    }

    const arr = Array.from(data);
    const end = Math.min(start + count, arr.length);
    return arr.slice(start, end);
}

/**
 * Read Modbus I/O and Registers (DI, DO, IR, DR).
 */
async function readModbus(session, options = {}) {
    const {
        diStart = 0,
        diCount = 1000,
        doStart = 0,
        doCount = 1000,
        irStart = 0,
        irCount = 1000,
        hrStart = 0,
        hrCount = 1000
    } = options;

    const result = await reader.readMultiple(session, [
        NODE_CONFIG.modbus.di,
        NODE_CONFIG.modbus.do,
        NODE_CONFIG.modbus.ir,
        NODE_CONFIG.modbus.hr
    ]);

    return {
        connected: true,
        digitalInputs: formatArray(result[0]?.value, diStart, diCount),
        digitalOutputs: formatArray(result[1]?.value, doStart, doCount),
        inputRegisters: formatArray(result[2]?.value, irStart, irCount),
        holdingRegisters: formatArray(result[3]?.value, hrStart, hrCount)
    };
}

/**
 * Write Digital Output (DO) with 1-based FANUC index mapping.
 * DO[1] maps to array index 0.
 */
async function writeDigitalOutput(session, index, value) {
    const rawNum = parseInt(index, 10);
    if (isNaN(rawNum) || rawNum < 1) {
        throw new Error("Digital Output numbering must start from 1 (e.g. DO[1])");
    }

    // 1-based to 0-based index
    const targetIndex = rawNum - 1;

    const result = await reader.readMultiple(session, [
        NODE_CONFIG.modbus.do
    ]);

    if (!result[0] || !result[0].success || result[0].value === null || result[0].value === undefined) {
        throw new Error(result[0]?.error || "Failed to read Digital Outputs array from OPC UA server");
    }

    const outputs = Array.from(result[0].value);
    if (targetIndex >= outputs.length) {
        outputs.length = targetIndex + 1;
    }
    outputs[targetIndex] = Boolean(value);

    const writeResult = await writer.writeNode(
        session,
        NODE_CONFIG.modbus.do,
        outputs,
        DataType.Boolean
    );

    return {
        success: writeResult.success,
        index: rawNum,
        value: Boolean(value),
        statusCode: writeResult.statusCode
    };
}

/**
 * Write FANUC Data Register (DR - Holding Registers node ns=1;i=304).
 * DR[1] maps to array index 0.
 * Includes read-back verification.
 */
async function writeDataRegister(session, index, value) {
    const rawNum = parseInt(index, 10);
    if (isNaN(rawNum) || rawNum < 1) {
        throw new Error("Data Register numbering must start from 1 (e.g. DR[1])");
    }

    const numVal = Number(value);
    if (isNaN(numVal)) {
        throw new Error("Invalid numeric value for Data Register");
    }

    // 1-based to 0-based index
    const targetIndex = rawNum - 1;

    // 1. Read existing array to preserve all other registers
    const readResult = await reader.readMultiple(session, [
        NODE_CONFIG.modbus.hr
    ]);

    if (!readResult[0] || !readResult[0].success || readResult[0].value === null || readResult[0].value === undefined) {
        throw new Error(readResult[0]?.error || "Failed to read Data Registers (Holding Registers) array from OPC UA server");
    }

    const registers = Array.from(readResult[0].value);
    if (targetIndex >= registers.length) {
        // Expand array if index exceeds current size
        for (let i = registers.length; i <= targetIndex; i++) {
            registers[i] = 0;
        }
    }

    // Update only the requested register
    registers[targetIndex] = numVal;

    const dataType = readResult[0].dataType || DataType.Int16;

    // 2. Write updated array back
    const writeResult = await writer.writeNode(
        session,
        NODE_CONFIG.modbus.hr,
        registers,
        dataType
    );

    if (!writeResult.success) {
        throw new Error(writeResult.error || `OPC UA Write failed with status: ${writeResult.statusCode}`);
    }

    // 3. Verification Read-Back
    const verifyRead = await reader.readMultiple(session, [
        NODE_CONFIG.modbus.hr
    ]);
    const verifiedValue = verifyRead[0]?.value ? Array.from(verifyRead[0].value)[targetIndex] : numVal;

    return {
        success: true,
        index: rawNum,
        value: numVal,
        verifiedValue,
        message: `DR[${rawNum}] written and verified as ${verifiedValue}`
    };
}

module.exports = {
    readModbus,
    writeDigitalOutput,
    writeDataRegister
};