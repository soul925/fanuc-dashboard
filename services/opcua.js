const {
    OPCUAClient,
    MessageSecurityMode,
    SecurityPolicy
} = require("node-opcua");

const fs = require("fs");
const path = require("path");

const browser = require("./browser");
const reader = require("./reader");
const writer = require("./writer");
const subscriber = require("./subscriber");
const cache = require("./cache");
const modbus = require("./modbus");

const NODE_CONFIG = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "../config/nodes.json"),
        "utf8"
    )
);

/*=========================================
    ROBOT CONNECTIONS
=========================================*/

const robotConnections = new Map();

/*
robotConnections = {
    robotId: {
        client,
        session,
        connected
    }
}
*/

/*=========================================
    CONNECT
=========================================*/

async function connect(robotId, ip, port, endpoint) {

    if (robotConnections.has(robotId)) {

        return {
            success: true,
            message: "Already Connected"
        };

    }

    let client = null;
    let session = null;

    try {

        const url = `opc.tcp://${ip}:${port}${endpoint}`;

        console.log(`Connecting ${robotId} -> ${url}`);

        client = OPCUAClient.create({

            securityMode: MessageSecurityMode.None,

            securityPolicy: SecurityPolicy.None,

            endpointMustExist: false,

            connectionStrategy: {

                initialDelay: 1000,

                maxRetry: 10

            },

            keepSessionAlive: true

        });

        await client.connect(url);

        session = await client.createSession();

        robotConnections.set(robotId, {

            client,

            session,

            connected: true

        });

        console.log("=================================");
        console.log(`${robotId} CONNECTED`);
        console.log("=================================");

        return {

            success: true,

            message: "Connected Successfully"

        };

    } catch (err) {

        console.error(err);

        if (session) {

            try {

                await session.close();

            } catch {}

        }

        if (client) {

            try {

                await client.disconnect();

            } catch {}

        }

        robotConnections.delete(robotId);

        return {

            success: false,

            message: err.message

        };

    }

}

/*=========================================
    DISCONNECT
=========================================*/

async function disconnect(robotId) {

    const robot = robotConnections.get(robotId);

    if (!robot) {

        return {

            success: false,

            message: "Robot not connected"

        };

    }

    try {

        await subscriber.terminateSubscription();

    } catch {}

    try {

        await robot.session.close();

    } catch {}

    try {

        await robot.client.disconnect();

    } catch {}

    robotConnections.delete(robotId);

    cache.clearCache(robotId);

    console.log(`${robotId} disconnected`);

    return {

        success: true,

        message: "Disconnected"

    };

}
/*=========================================
    SESSION
=========================================*/

function getSession(robotId) {

    const robot = robotConnections.get(robotId);

    if (!robot) {
        throw new Error("Robot not connected");
    }

    return robot.session;

}

function isConnected(robotId) {

    return robotConnections.has(robotId);

}

/*=========================================
    READ SINGLE NODE
=========================================*/

async function readNode(robotId, nodeId) {

    const session = getSession(robotId);

    return await reader.readNode(session, nodeId);

}

/*=========================================
    READ MULTIPLE NODES
=========================================*/

async function readMultiple(robotId, nodeIds) {

    const session = getSession(robotId);

    return await reader.readMultiple(session, nodeIds);

}

/*=========================================
    BROWSE ENTIRE OPC UA NAMESPACE
=========================================*/

async function browseNamespace(robotId) {

    const session = getSession(robotId);

    cache.clearCache(robotId);

    console.log(`Browsing OPC UA Namespace for ${robotId}...`);

    const tree = await browser.browseNode(
    robotId,
    session
    );

    console.log(
    "Browse Complete:",
    cache.getAllNodes(robotId).length,
    "nodes discovered"
    );
    return tree;

}

/*=========================================
    SEARCH CACHE
=========================================*/

function search(robotId, keyword) {

    return cache.searchNodes(

        robotId,

        keyword

    );

}

/*=========================================
    GET CACHE
=========================================*/

function getCachedNodes(robotId) {

    return cache.getAllNodes(

        robotId

    );

}
/*=========================================
    SUBSCRIBE
=========================================*/

async function subscribe(robotId, nodeId, callback) {

    const session = getSession(robotId);

    return subscriber.subscribeNode(
        session,
        nodeId,
        callback
    );

}

/*=========================================
    WRITE NODE
=========================================*/

async function writeNode(robotId, nodeId, value, dataType) {

    const session = getSession(robotId);

    return writer.writeNode(
        session,
        nodeId,
        value,
        dataType
    );

}
/*=========================================
    WRITE DIGITAL OUTPUT
=========================================*/

async function writeDigitalOutput(robotId, index, value) {

    const session = getSession(robotId);

    return modbus.writeDigitalOutput(
        session,
        index,
        value
    );

}

/*=========================================
    ROBOT STATUS
=========================================*/

async function readStatus(robotId) {

    if (!isConnected(robotId)) {

        return {

            connected: false,

            model: "-",

            serial: "-",

            speed: "-",

            mode: "-",

            estop: "-",

            pstop: "-",

            program: "-"

        };

    }

    const result = await readMultiple(robotId, [

    NODE_CONFIG.robot.model,

    NODE_CONFIG.robot.serial,

    NODE_CONFIG.robot.speed,

    NODE_CONFIG.robot.mode,

    NODE_CONFIG.robot.estop,

    NODE_CONFIG.robot.pstop,

    NODE_CONFIG.robot.program

]);

    console.log("===== STATUS RESULT =====");
    console.dir(result, { depth: null });
    console.log("=========================");
    console.dir(result[0], { depth: null });
    console.dir(result[0].value, { depth: null });

    return {

    connected: true,

    model: result[0]?.value?.text ?? result[0]?.value,

    serial: result[1]?.value?.text ?? result[1]?.value,

    speed: result[2]?.value?.text ?? result[2]?.value,

    mode: result[3]?.value?.text ?? result[3]?.value,

    estop: result[4]?.value?.text ?? result[4]?.value,

    pstop: result[5]?.value?.text ?? result[5]?.value,

    program: result[6]?.value?.text ?? result[6]?.value

    };

    

}

/*=========================================
    MODBUS DATA
=========================================*/

async function readModbus(robotId, options = {}) {

    if (!isConnected(robotId)) {

        return {
            connected: false
        };

    }

    const session = getSession(robotId);

    return await modbus.readModbus(session, options);

}


/*=========================================
    ROBOT LIST
=========================================*/

function getConnectedRobots() {

    return Array.from(robotConnections.keys());

}

/*=========================================
    EXPORTS
=========================================*/

module.exports = {

    /* Connection */

    connect,

    disconnect,

    isConnected,

    getSession,

    getConnectedRobots,

    /* Dashboard */

    readStatus,
    readModbus,

    /* Generic OPC UA */

    browseNamespace,

    readNode,

    readMultiple,

    writeNode,
    writeDigitalOutput,

    /* Subscription */

    subscribe,

    /* Cache */

    search,

    getCachedNodes

};