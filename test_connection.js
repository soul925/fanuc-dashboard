const {
    OPCUAClient,
    AttributeIds
} = require("node-opcua");

const endpoint = "opc.tcp://192.168.1.100:4880/FANUC/NanoUaServer";

async function main() {

    const client = OPCUAClient.create({
        endpointMustExist: false
    });

    await client.connect(endpoint);

    const session = await client.createSession();

    const nodes = [
        "ns=1;i=301",
        "ns=1;i=302",
        "ns=1;i=303",
        "ns=1;i=304"
    ];

    for (const nodeId of nodes) {

        console.log("\n==================================");
        console.log("Node:", nodeId);

        try {

            const dv = await session.read({
                nodeId,
                attributeId: AttributeIds.Value
            });

            console.log("Status:", dv.statusCode.toString());
            console.log("DataType:", dv.value.dataType.toString());
            console.dir(dv.value.value, { depth: null });

        } catch (err) {

            console.log(err.message);

        }

    }

    await session.close();
    await client.disconnect();
}

main().catch(console.error);