const {
    OPCUAClient,
    AttributeIds,
    BrowseDirection,
    NodeClass
} = require("node-opcua");

const fs = require("fs");

const endpoint = "opc.tcp://192.168.1.100:4880/FANUC/NanoUaServer";

let session;

const nodes = [];
const visited = new Set();

async function readAttribute(nodeId, attributeId) {

    try {

        const dv = await session.read({
            nodeId,
            attributeId
        });

        return {
            status: dv.statusCode.toString(),
            value: dv.value?.value,
            dataType: dv.value?.dataType?.toString()
        };

    } catch (err) {

        return {
            status: "ERROR",
            value: null,
            dataType: null
        };

    }

}

async function browse(nodeId = "ObjectsFolder") {

    if (visited.has(nodeId.toString()))
        return;

    visited.add(nodeId.toString());

    let result;

    try {

        result = await session.browse({

            nodeId,

            browseDirection: BrowseDirection.Forward,

            includeSubtypes: true,

            nodeClassMask: 0,

            resultMask: 63

        });

    } catch (err) {

        console.log(err.message);

        return;

    }

    console.log(
        "Browsing:",
        nodeId.toString(),
        result.references?.length || 0
    );

for (const ref of result.references || []) {

    const id = ref.nodeId.toString();

    console.log(
        ref.browseName?.name,
        id,
        NodeClass[ref.nodeClass]
    );

    const value = await readAttribute(
        id,
        AttributeIds.Value
    );

    const access = await readAttribute(
        id,
        AttributeIds.AccessLevel
    );

    const userAccess = await readAttribute(
        id,
        AttributeIds.UserAccessLevel
    );

    const dataType = await readAttribute(
        id,
        AttributeIds.DataType
    );

    const valueRank = await readAttribute(
        id,
        AttributeIds.ValueRank
    );

    const arrayDimensions = await readAttribute(
        id,
        AttributeIds.ArrayDimensions
    );

    nodes.push({

        nodeId: id,

        browseName: ref.browseName?.name || "",

        displayName: ref.displayName?.text || "",

        nodeClass: NodeClass[ref.nodeClass],

        dataType: dataType.value,

        value: value.value,

        valueStatus: value.status,

        accessLevel: access.value,

        userAccessLevel: userAccess.value,

        valueRank: valueRank.value,

        arrayDimensions: arrayDimensions.value

    });

    await browse(id);

}
}
async function main() {

    const client = OPCUAClient.create({
        endpointMustExist: false
    });

    await client.connect(endpoint);

    session = await client.createSession();

    console.log("Connected");

    await browse("ObjectsFolder");

    console.log("Nodes Found:", nodes.length);

    fs.writeFileSync(
        "opcua_nodes.json",
        JSON.stringify(nodes, null, 2)
    );

    console.log("JSON saved.");

    await session.close();

    await client.disconnect();
}

main().catch(console.error);
