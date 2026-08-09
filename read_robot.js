const {
    OPCUAClient,
    MessageSecurityMode,
    SecurityPolicy,
    AttributeIds
} = require("node-opcua");

const endpoint = "opc.tcp://192.168.4.90:4880/FANUC/NanoUaServer";

async function main() {

    console.log("==================================");
    console.log("FANUC OPC UA Test");
    console.log("==================================");

    let client = null;
    let session = null;

    try {

        console.log("Creating OPC UA Client...");

        client = OPCUAClient.create({
            securityMode: MessageSecurityMode.None,
            securityPolicy: SecurityPolicy.None,
            endpointMustExist: false
        });

        console.log("Client Created");

        console.log("Connecting to:");
        console.log(endpoint);

        await client.connect(endpoint);

        console.log("✅ Connected Successfully");

        console.log("Creating Session...");

        session = await client.createSession();

        console.log("✅ Session Created");

        const nodes = [
            {
                name: "Operational Mode",
                nodeId: "ns=3;i=50003"
            },
            {
                name: "Emergency Stop",
                nodeId: "ns=3;i=50004"
            },
            {
                name: "Protective Stop",
                nodeId: "ns=3;i=50005"
            }
        ];

        console.log("----------------------------------");

        for (const node of nodes) {

            try {

                const data = await session.read({
                    nodeId: node.nodeId,
                    attributeId: AttributeIds.Value
                });

                console.log(`${node.name}: ${data.value.value}`);

            } catch (err) {

                console.log(`${node.name}: ERROR`);
                console.log(err.message);

            }

        }

        console.log("----------------------------------");

    } catch (err) {

        console.log("❌ ERROR OCCURRED");
        console.log(err);
        console.log(err.message);

    } finally {

        try {

            if (session) {
                console.log("Closing Session...");
                await session.close();
            }

        } catch (e) {
            console.log("Session Close Error:", e.message);
        }

        try {

            if (client) {
                console.log("Disconnecting Client...");
                await client.disconnect();
            }

        } catch (e) {
            console.log("Disconnect Error:", e.message);
        }

        console.log("Finished");

    }

}

main();