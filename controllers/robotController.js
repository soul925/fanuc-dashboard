const opcua = require("../services/opcua");
const robotManager = require("../services/robotManager");

/* ===========================
   BROWSE (CHILDREN / SPECIFIC NODE)
=========================== */

exports.browse = async (req, res) => {
    try {
        const { robotId } = req.params;
        const nodeId = req.query.nodeId || "ObjectsFolder";
        const data = await opcua.browseChildren(robotId, nodeId);
        res.json({
            success: true,
            robotId,
            currentNode: data.currentNode,
            count: data.childrenCount,
            nodes: data.children
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

/* ===========================
   BROWSE IMMEDIATE CHILDREN
=========================== */

exports.browseChildren = async (req, res) => {
    try {
        const { robotId } = req.params;
        const nodeId = req.query.nodeId || req.body.nodeId || "ObjectsFolder";
        const data = await opcua.browseChildren(robotId, nodeId);
        res.json({
            success: true,
            robotId,
            currentNode: data.currentNode,
            count: data.childrenCount,
            nodes: data.children
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

/* ===========================
   BROWSE FULL TREE
=========================== */

exports.browseTree = async (req, res) => {
    try {
        const { robotId } = req.params;
        const rootNodeId = req.query.nodeId || "ObjectsFolder";
        const data = await opcua.browseTree(robotId, rootNodeId);
        res.json({
            success: true,
            robotId,
            nodes: data
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

/* ===========================
   GET NODE DETAILS
=========================== */

exports.getNodeDetails = async (req, res) => {
    try {
        const { robotId } = req.params;
        const nodeId = req.query.nodeId || req.params.nodeId;
        if (!nodeId) {
            return res.status(400).json({ success: false, message: "Node ID is required" });
        }
        const data = await opcua.getNodeDetails(robotId, nodeId);
        res.json({
            success: true,
            robotId,
            details: data
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

/* ===========================
   CONNECT
=========================== */

exports.connect = async (req, res) => {
    try {
        let { robotId, ip, port, endpoint } = req.body;

        if (!robotId) {
            return res.status(400).json({ success: false, message: "Robot ID is required" });
        }

        if (!ip) {
            const bot = robotManager.getRobot(robotId);
            if (bot) {
                ip = bot.ip;
                port = bot.port || 4880;
                endpoint = bot.endpoint || "/FANUC/NanoUaServer";
            }
        }

        if (!ip) {
            return res.status(400).json({ success: false, message: `Missing connection parameters for ${robotId}` });
        }

        const result = await opcua.connect(robotId, ip, port || 4880, endpoint || "/FANUC/NanoUaServer");
        res.json(result);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

/* ===========================
   DISCONNECT
=========================== */

exports.disconnect = async (req, res) => {

    try {

        const { robotId } = req.body;

        const result = await opcua.disconnect(robotId);

        res.json(result);

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};

/* ===========================
   STATUS
=========================== */

exports.status = async (req, res) => {
    try {
        const robotId = req.params.robotId;
        const data = await opcua.readStatus(robotId);
        res.json(data);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.allStatus = async (req, res) => {
    try {
        const data = await opcua.readAllRobotsSummary();
        res.json({
            success: true,
            totalRobots: data.totalRobots !== undefined ? data.totalRobots : (data.robots ? data.robots.length : 0),
            onlineRobots: data.onlineRobots !== undefined ? data.onlineRobots : 0,
            totalActiveAlarms: data.totalActiveAlarms !== undefined ? data.totalActiveAlarms : 0,
            count: data.robots ? data.robots.length : (Array.isArray(data) ? data.length : 0),
            robots: data.robots || data
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
/* ===========================
   MODBUS
=========================== */

exports.modbus = async (req, res) => {

    try {

        const robotId = req.params.robotId;

        const options = {

            diStart: Number(req.query.diStart ?? 0),
            diCount: Number(req.query.diCount ?? 128),

            doStart: Number(req.query.doStart ?? 0),
            doCount: Number(req.query.doCount ?? 128),

            irStart: Number(req.query.irStart ?? 0),
            irCount: Number(req.query.irCount ?? 128),

            hrStart: Number(req.query.hrStart ?? 0),
            hrCount: Number(req.query.hrCount ?? 128)

        };

        const data = await opcua.readModbus(robotId, options);

        res.json(data);

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};

/* ===========================
   READ NODE
=========================== */

exports.read = async (req, res) => {

    try {

        const {

            robotId,

            nodeId

        } = req.body;

        const data = await opcua.readNode(

            robotId,

            nodeId

        );

        res.json(data);

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};

/* ===========================
   READ MULTIPLE NODES
=========================== */

exports.readMultiple = async (req, res) => {

    try {

        const {

            robotId,

            nodeIds

        } = req.body;

        const data = await opcua.readMultiple(

            robotId,

            nodeIds

        );

        res.json({

            success: true,

            values: data

        });

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};

/* ===========================
   WRITE NODE
=========================== */

exports.write = async (req, res) => {

    console.log("WRITE REQUEST:", req.body);

    try {

        const {
            robotId,
            nodeId,
            value,
            dataType,
            index
        } = req.body;

        let result;

        // Handle Digital Output array
        if (nodeId === "ns=1;i=302" && index !== undefined) {

            result = await opcua.writeDigitalOutput(
                robotId,
                Number(index),
                Boolean(value)
            );

        } else {

            result = await opcua.writeNode(
                robotId,
                nodeId,
                value,
                dataType
            );

        }

        res.json(result);

    }

    catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};

/* ===========================
   SEARCH
=========================== */

exports.search = (req, res) => {

    try {

        const {

            robotId,

            q = ""

        } = req.query;

        const result = opcua.search(

            robotId,

            q

        );

        res.json(result);

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};

/* ===========================
   CACHE
=========================== */

exports.cache = (req, res) => {

    try {

        const { robotId } = req.query;

        const result = opcua.getCachedNodes(

            robotId

        );

        res.json(result);

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};
/* ===========================
   CONNECTED ROBOTS
=========================== */

exports.connectedRobots = (req, res) => {

    res.json({

        success: true,

        robots: opcua.getConnectedRobots()

    });

};

/* ===========================
   ROBOT MANAGER
=========================== */

exports.getRobots = (req, res) => {

    res.json(robotManager.getRobots());

};

exports.addRobot = (req, res) => {

    try {

        const robot = robotManager.addRobot(req.body);

        res.json({

            success: true,

            robot

        });

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};

exports.updateRobot = (req, res) => {

    try {

        const robot = robotManager.updateRobot(

            req.params.id,

            req.body

        );

        res.json({

            success: true,

            robot

        });

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};

exports.deleteRobot = (req, res) => {

    try {

        robotManager.deleteRobot(req.params.id);

        res.json({

            success: true

        });

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

};