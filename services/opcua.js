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
const logger = require("./logger");

const NODE_CONFIG = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "../config/nodes.json"),
        "utf8"
    )
);

/*=========================================
    ROBOT CONNECTIONS MAP
    Key: robotId -> Value: {
        robotId,
        client: OPCUAClient,
        session: ClientSession,
        connected: boolean,
        connecting: boolean,
        endpointUrl: string,
        ip: string,
        port: number,
        endpoint: string,
        reconnectTimer: NodeJS.Timeout | null,
        reconnectAttempts: number,
        autoReconnect: boolean,
        lastConnectedAt: string
    }
=========================================*/
const robotConnections = new Map();

/*=========================================
    AUTO RECONNECT HANDLER (ISOLATED PER ROBOT)
=========================================*/
function handleConnectionLost(robotId, reason = "Connection lost") {
    const conn = robotConnections.get(robotId);
    if (!conn) return;

    if (!conn.connected && conn.connecting) return;

    conn.connected = false;
    console.warn(`Robot ${robotId} → Connection Lost (${reason}) → Scheduling Reconnect`);
    logger.warn(`[OPC UA] Robot ${robotId} → Connection Lost (${reason})`, { robotId, module: "OPC UA" });

    // Safely close stale session without destroying the client connection handle
    if (conn.session) {
        try {
            conn.session.close().catch(() => {});
        } catch {}
    }

    scheduleReconnect(robotId);
}

function scheduleReconnect(robotId) {
    const conn = robotConnections.get(robotId);
    if (!conn || !conn.autoReconnect) return;

    if (conn.reconnectTimer) {
        clearTimeout(conn.reconnectTimer);
    }

    conn.reconnectAttempts += 1;
    const delay = Math.min(3000 * Math.pow(1.5, Math.min(conn.reconnectAttempts, 5)), 20000);

    console.log(`Robot ${robotId} → Reconnecting (attempt ${conn.reconnectAttempts} in ${(delay / 1000).toFixed(1)}s)...`);
    logger.info(`[OPC UA] Robot ${robotId} → Reconnecting (attempt ${conn.reconnectAttempts} in ${(delay / 1000).toFixed(1)}s)...`, { robotId, module: "OPC UA" });

    conn.reconnectTimer = setTimeout(async () => {
        const currentConn = robotConnections.get(robotId);
        if (!currentConn || currentConn.connected) return;

        try {
            console.log(`Robot ${robotId} → Connecting → ${currentConn.ip}:${currentConn.port}`);
            logger.info(`[OPC UA] Robot ${robotId} → Connecting → ${currentConn.endpointUrl}`, { robotId, module: "OPC UA" });

            // Re-establish session
            let session = null;
            if (currentConn.client) {
                try {
                    session = await currentConn.client.createSession();
                } catch {
                    // If existing client cannot create session, recreate client
                    try { await currentConn.client.disconnect(); } catch {}
                    const newClient = createOpcuaClientInstance(robotId);
                    await newClient.connect(currentConn.endpointUrl);
                    session = await newClient.createSession();
                    currentConn.client = newClient;
                }
            }

            if (session) {
                currentConn.session = session;
                currentConn.connected = true;
                currentConn.reconnectAttempts = 0;
                currentConn.lastConnectedAt = new Date().toISOString();

                console.log(`Robot ${robotId} → Session Created`);
                console.log(`Robot ${robotId} → Reconnected Successfully`);
                logger.info(`[OPC UA] Robot ${robotId} → Session Created & Reconnected`, { robotId, module: "OPC UA" });

                // Synchronize session with robotManager
                try {
                    const robotManager = require("./robotManager");
                    robotManager.setSession(robotId, session);
                } catch {}
            }
        } catch (err) {
            console.warn(`Robot ${robotId} → Reconnection failed: ${err.message}`);
            logger.warn(`[OPC UA] Robot ${robotId} → Reconnection failed: ${err.message}`, { robotId, module: "OPC UA" });
            scheduleReconnect(robotId);
        }
    }, delay);
}

/**
 * Factory to create an isolated OPCUAClient instance for a specific robot.
 */
function createOpcuaClientInstance(robotId) {
    const client = OPCUAClient.create({
        applicationName: `FANUC_Dashboard_${robotId}`,
        connectionStrategy: {
            initialDelay: 1000,
            maxRetry: 1
        },
        securityMode: MessageSecurityMode.None,
        securityPolicy: SecurityPolicy.None,
        endpointMustExist: false,
        requestedSessionTimeout: 30000,
        responseTimeout: 10000
    });

    client.on("connection_lost", () => {
        handleConnectionLost(robotId, "TCP Connection Lost");
    });

    client.on("backoff", (number, delay) => {
        console.log(`Robot ${robotId} → Reconnecting (attempt ${number})...`);
    });

    client.on("close", () => {
        const conn = robotConnections.get(robotId);
        if (conn && conn.connected) {
            handleConnectionLost(robotId, "Socket Closed");
        }
    });

    return client;
}

/*=========================================
    CONNECT (CONCURRENT & ISOLATED)
=========================================*/
async function connect(robotId, ip, port, endpoint) {
    if (!robotId || !ip || !port || !endpoint) {
        throw new Error("Missing connection parameters");
    }

    const existing = robotConnections.get(robotId);
    if (existing && existing.connected && existing.session) {
        return {
            success: true,
            robotId,
            message: `Robot ${robotId} is already connected.`
        };
    }

    const endpointUrl = `opc.tcp://${ip}:${port}${endpoint}`;

    // Mark robot as connecting without blocking any other robot
    const connectionRecord = existing || {
        robotId,
        client: null,
        session: null,
        connected: false,
        connecting: true,
        endpointUrl,
        ip,
        port: parseInt(port, 10) || 4880,
        endpoint,
        reconnectTimer: null,
        reconnectAttempts: 0,
        autoReconnect: true,
        lastConnectedAt: null
    };
    connectionRecord.connecting = true;
    connectionRecord.endpointUrl = endpointUrl;
    connectionRecord.ip = ip;
    connectionRecord.port = parseInt(port, 10) || 4880;
    connectionRecord.endpoint = endpoint;
    robotConnections.set(robotId, connectionRecord);

    console.log(`Robot ${robotId} → Connecting → ${ip}:${port}`);
    logger.info(`[OPC UA] Robot ${robotId} → Connecting → ${endpointUrl}`, { robotId, module: "OPC UA" });

    let client = createOpcuaClientInstance(robotId);
    let session = null;

    try {
        await client.connect(endpointUrl);

        session = await client.createSession();

        connectionRecord.client = client;
        connectionRecord.session = session;
        connectionRecord.connected = true;
        connectionRecord.connecting = false;
        connectionRecord.reconnectAttempts = 0;
        connectionRecord.lastConnectedAt = new Date().toISOString();

        if (connectionRecord.reconnectTimer) {
            clearTimeout(connectionRecord.reconnectTimer);
            connectionRecord.reconnectTimer = null;
        }

        console.log(`Robot ${robotId} → Session Created`);
        logger.info(`[OPC UA] Robot ${robotId} → Session Created successfully (${endpointUrl})`, { robotId, module: "OPC UA" });

        // Update robotManager session map
        try {
            const robotManager = require("./robotManager");
            robotManager.setSession(robotId, session);
        } catch {}

        return {
            success: true,
            robotId,
            endpointUrl,
            message: `Connected successfully to ${robotId} (${endpointUrl})`
        };

    } catch (err) {
        connectionRecord.connecting = false;
        connectionRecord.connected = false;

        console.error(`Robot ${robotId} → Connection Error: ${err.message}`);
        logger.error(`[OPC UA] Connection error for ${robotId} (${endpointUrl}): ${err.message}`, { robotId, module: "OPC UA" });

        if (session) {
            try { await session.close(); } catch {}
        }
        if (client) {
            try { await client.disconnect(); } catch {}
        }

        return {
            success: false,
            robotId,
            message: err.message || `Failed to connect to ${robotId}`
        };
    }
}

/*=========================================
    DISCONNECT (ISOLATED PER ROBOT)
=========================================*/
async function disconnect(robotId) {
    const conn = robotConnections.get(robotId);
    if (!conn) {
        return {
            success: false,
            robotId,
            message: `Robot ${robotId} is not connected`
        };
    }

    // Disable auto-reconnect and clear timer
    conn.autoReconnect = false;
    if (conn.reconnectTimer) {
        clearTimeout(conn.reconnectTimer);
        conn.reconnectTimer = null;
    }

    // Terminate only this robot's subscriptions
    try {
        await subscriber.terminateSubscription(robotId);
    } catch {}

    // Close this robot's session
    if (conn.session) {
        try {
            await conn.session.close();
        } catch {}
    }

    // Disconnect this robot's client
    if (conn.client) {
        try {
            await conn.client.disconnect();
        } catch {}
    }

    robotConnections.delete(robotId);

    try {
        const robotManager = require("./robotManager");
        robotManager.removeSession(robotId);
    } catch {}

    cache.clearCache(robotId);

    console.log(`Robot ${robotId} → Disconnected`);
    logger.info(`[OPC UA] Robot ${robotId} → Disconnected`, { robotId, module: "OPC UA" });

    return {
        success: true,
        robotId,
        message: `Robot ${robotId} disconnected`
    };
}

/*=========================================
    SESSION ACCESSORS
=========================================*/
function getSession(robotId) {
    if (!robotId) {
        throw new Error("robotId is required to get session");
    }

    const conn = robotConnections.get(robotId);
    if (!conn || !conn.session || !conn.connected) {
        throw new Error(`Robot "${robotId}" is not connected (No active OPC UA session)`);
    }

    return conn.session;
}

function isConnected(robotId) {
    if (!robotId) return false;
    const conn = robotConnections.get(robotId);
    return Boolean(conn && conn.connected && conn.session);
}

function getConnectedRobots() {
    const online = [];
    for (const [id, conn] of robotConnections.entries()) {
        if (conn.connected && conn.session) {
            online.push(id);
        }
    }
    return online;
}

/*=========================================
    READ SINGLE NODE
=========================================*/
async function readNode(robotId, nodeId) {
    try {
        const session = getSession(robotId);
        const result = await reader.readNode(session, nodeId);

        if (!result.success && result.error && (
            result.error.includes("BadConnectionClosed") ||
            result.error.includes("Invalid Channel") ||
            result.error.includes("BadSessionClosed") ||
            result.error.includes("BadServerHalted")
        )) {
            handleConnectionLost(robotId, result.error);
        }

        return result;
    } catch (err) {
        return {
            success: false,
            nodeId,
            error: err.message
        };
    }
}

/*=========================================
    READ MULTIPLE NODES
=========================================*/
async function readMultiple(robotId, nodeIds) {
    try {
        const session = getSession(robotId);
        const results = await reader.readMultiple(session, nodeIds);

        if (results.length > 0 && !results[0].success && results[0].error && (
            results[0].error.includes("BadConnectionClosed") ||
            results[0].error.includes("Invalid Channel") ||
            results[0].error.includes("BadSessionClosed") ||
            results[0].error.includes("BadServerHalted")
        )) {
            handleConnectionLost(robotId, results[0].error);
        }

        return results;
    } catch (err) {
        return nodeIds.map(nodeId => ({
            success: false,
            nodeId,
            error: err.message
        }));
    }
}

/*=========================================
    BROWSE OPC UA NODE CHILDREN
=========================================*/
async function browseChildren(robotId, nodeId = "ObjectsFolder") {
    const session = getSession(robotId);
    return browser.browseChildren(robotId, session, nodeId);
}

/*=========================================
    BROWSE OPC UA TREE
=========================================*/
async function browseTree(robotId, rootNodeId = "ObjectsFolder") {
    const session = getSession(robotId);
    return browser.browseTree(robotId, session, rootNodeId);
}

/*=========================================
    GET DETAILED NODE PROPERTIES
=========================================*/
async function getNodeDetails(robotId, nodeId) {
    const session = getSession(robotId);
    return browser.readNodeDetails(robotId, session, nodeId);
}

/*=========================================
    BROWSE ENTIRE OPC UA NAMESPACE (LEGACY)
=========================================*/
async function browseNamespace(robotId) {
    const session = getSession(robotId);
    cache.clearCache(robotId);
    return browser.browseTree(robotId, session, "ObjectsFolder");
}

/*=========================================
    SEARCH CACHE
=========================================*/
function search(robotId, keyword) {
    return cache.searchNodes(robotId, keyword);
}

/*=========================================
    GET CACHE
=========================================*/
function getCachedNodes(robotId) {
    return cache.getAllNodes(robotId);
}

/*=========================================
    SUBSCRIBE
=========================================*/
async function subscribe(robotId, nodeId, callback) {
    const session = getSession(robotId);
    return subscriber.subscribeNode(robotId, session, nodeId, callback);
}

/*=========================================
    WRITE NODE
=========================================*/
async function writeNode(robotId, nodeId, value, dataType) {
    const session = getSession(robotId);
    return writer.writeNode(session, nodeId, value, dataType);
}

/*=========================================
    WRITE DIGITAL OUTPUT
=========================================*/
async function writeDigitalOutput(robotId, index, value) {
    const session = getSession(robotId);
    return modbus.writeDigitalOutput(session, index, value);
}

/*=========================================
    WRITE DATA REGISTER
=========================================*/
async function writeDataRegister(robotId, index, value) {
    const session = getSession(robotId);
    return modbus.writeDataRegister(session, index, value);
}

/*=========================================
    ROBOT STATUS
=========================================*/
async function readStatus(robotId) {
    if (!isConnected(robotId)) {
        return {
            connected: false,
            robotId,
            model: "--",
            speed: "--",
            mode: "--",
            estop: "--",
            pstop: "--",
            program: "--"
        };
    }

    const result = await readMultiple(robotId, [
        NODE_CONFIG.robot.model,
        NODE_CONFIG.robot.speed,
        NODE_CONFIG.robot.mode,
        NODE_CONFIG.robot.estop,
        NODE_CONFIG.robot.pstop,
        NODE_CONFIG.robot.program
    ]);

    function extractValue(val) {
        if (val === null || val === undefined) return "--";
        if (typeof val === "object") {
            if (val.text !== undefined) return val.text;
            if (val.value !== undefined) return extractValue(val.value);
            return JSON.stringify(val);
        }
        return val;
    }

    return {
        connected: true,
        robotId,
        model: extractValue(result[0]?.value),
        speed: extractValue(result[1]?.value),
        mode: extractValue(result[2]?.value),
        estop: extractValue(result[3]?.value),
        pstop: extractValue(result[4]?.value),
        program: extractValue(result[5]?.value)
    };
}

/*=========================================
    MODBUS DATA
=========================================*/
async function readModbus(robotId, options = {}) {
    if (!isConnected(robotId)) {
        return {
            connected: false,
            robotId
        };
    }

    const session = getSession(robotId);
    return await modbus.readModbus(session, options);
}

/*=========================================
    MULTI-ROBOT PARALLEL SUMMARY TELEMETRY
=========================================*/
async function readAllRobotsSummary() {
    const robotManager = require("./robotManager");
    const alarmsService = require("./alarms");
    const configuredRobots = robotManager.getRobots();

    const summaryPromises = configuredRobots.map(async (robot) => {
        const isConn = isConnected(robot.id);
        if (!isConn) {
            return {
                id: robot.id,
                name: robot.name || robot.id,
                ip: robot.ip,
                port: robot.port || 4880,
                connected: false,
                model: "--",
                mode: "--",
                program: "--",
                speed: "--",
                activeAlarmsCount: 0,
                alarm: "Disconnected"
            };
        }

        try {
            const status = await readStatus(robot.id);
            let activeAlarmsCount = 0;
            let alarmLabel = "Normal";

            try {
                const alarmData = await alarmsService.getAlarms(robot.id, 5);
                activeAlarmsCount = alarmData.activeCount || 0;
                if (activeAlarmsCount > 0) {
                    alarmLabel = `${activeAlarmsCount} Active Alarm${activeAlarmsCount > 1 ? "s" : ""}`;
                }
            } catch {}

            return {
                id: robot.id,
                name: robot.name || robot.id,
                ip: robot.ip,
                port: robot.port || 4880,
                connected: true,
                model: status.model || "--",
                mode: status.mode || "--",
                program: status.program || "--",
                speed: status.speed !== undefined && status.speed !== null ? status.speed : "--",
                activeAlarmsCount,
                alarm: alarmLabel
            };
        } catch (err) {
            return {
                id: robot.id,
                name: robot.name || robot.id,
                ip: robot.ip,
                port: robot.port || 4880,
                connected: true,
                model: "--",
                mode: "--",
                program: "--",
                speed: "--",
                activeAlarmsCount: 0,
                alarm: "Error",
                error: err.message
            };
        }
    });

    const results = await Promise.allSettled(summaryPromises);
    const formatted = results.map((r, idx) => {
        if (r.status === "fulfilled") return r.value;
        const fallbackRobot = configuredRobots[idx];
        return {
            id: fallbackRobot?.id || `Robot_${idx + 1}`,
            name: fallbackRobot?.name || `Robot_${idx + 1}`,
            ip: fallbackRobot?.ip || "",
            port: fallbackRobot?.port || 4880,
            connected: false,
            model: "--",
            mode: "--",
            program: "--",
            speed: "--",
            activeAlarmsCount: 0,
            alarm: "Disconnected"
        };
    });

    const totalActiveAlarms = formatted.reduce((acc, r) => acc + (r.activeAlarmsCount || 0), 0);
    const onlineRobots = formatted.filter(r => r.connected).length;

    return {
        totalRobots: configuredRobots.length,
        onlineRobots,
        totalActiveAlarms,
        robots: formatted
    };
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

    /* Dashboard & Multi-Robot */
    readStatus,
    readModbus,
    readAllRobotsSummary,

    /* Generic OPC UA */
    browseChildren,
    browseTree,
    getNodeDetails,
    browseNamespace,
    readNode,
    readMultiple,
    writeNode,
    writeDigitalOutput,
    writeDataRegister,

    /* Subscription */
    subscribe,

    /* Cache */
    search,
    getCachedNodes
};