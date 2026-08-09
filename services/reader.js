// services/reader.js

const { AttributeIds } = require("node-opcua");

/**
 * Read a single OPC UA node
 */
async function readNode(session, nodeId) {

    try {

        const dataValue = await session.read({
            nodeId,
            attributeId: AttributeIds.Value
        });

        return {
            success: true,
            nodeId,
            value: dataValue.value?.value ?? null,
            dataType: dataValue.value?.dataType ?? null,
            statusCode: dataValue.statusCode.toString(),
            sourceTimestamp: dataValue.sourceTimestamp,
            serverTimestamp: dataValue.serverTimestamp
        };

    } catch (err) {

        return {
            success: false,
            nodeId,
            error: err.message
        };

    }

}

/**
 * Read multiple OPC UA nodes
 */
async function readMultiple(session, nodeIds) {

    const results = [];

    for (const nodeId of nodeIds) {
        results.push(await readNode(session, nodeId));
    }

    return results;

}

module.exports = {
    readNode,
    readMultiple
};