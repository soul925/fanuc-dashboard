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

function formatArray(data, start = 0, count = 32) {

    if (!Array.isArray(data) && !ArrayBuffer.isView(data)) {
        return [];
    }

    const end = Math.min(start + count, data.length);

    const result = [];

    for (let i = start; i < end; i++) {

        result.push({
            index: i,
            value: data[i]
        });

    }

    return result;

}

async function readModbus(session, options = {}) {

    const {

        diStart = 0,
        diCount = 128,

        doStart = 0,
        doCount = 128,

        irStart = 0,
        irCount = 128,

        hrStart = 0,
        hrCount = 128

    } = options;

    const result = await reader.readMultiple(session, [

        NODE_CONFIG.modbus.di,
        NODE_CONFIG.modbus.do,
        NODE_CONFIG.modbus.ir,
        NODE_CONFIG.modbus.hr

    ]);
    console.dir(result, { depth: null });

    console.log("========== MODBUS ==========");
    console.log("DI Length:", result[0]?.value?.length);
    console.log("DO Length:", result[1]?.value?.length);
    console.log("IR Length:", result[2]?.value?.length);
    console.log("HR Length:", result[3]?.value?.length);
    console.log("============================");

    return {

        connected: true,

        digitalInputs: formatArray(
            result[0]?.value,
            diStart,
            diCount
        ),

        digitalOutputs: formatArray(
            result[1]?.value,
            doStart,
            doCount
        ),

        inputRegisters: formatArray(
            result[2]?.value,
            irStart,
            irCount
        ),

        holdingRegisters: formatArray(
            result[3]?.value,
            hrStart,
            hrCount
        )

    };

}

async function writeDigitalOutput(session, index, value) {

    const result = await reader.readMultiple(session, [
        NODE_CONFIG.modbus.do
    ]);

    const outputs = [...result[0].value];

    outputs[index] = value;

    return writer.writeNode(
        session,
        NODE_CONFIG.modbus.do,
        outputs,
        DataType.Boolean
    );

}

module.exports = {

    readModbus,
    writeDigitalOutput

};