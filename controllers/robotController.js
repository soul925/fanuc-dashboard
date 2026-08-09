const opcua = require("../services/opcua");

/* ===========================
   BROWSE
=========================== */

exports.browse = async (req, res) => {

    try {

        const robotId = req.params.robotId;

        const data = await opcua.browseNamespace(robotId);

        res.json({
            success: true,
            nodes: data
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
   CONNECT
=========================== */

exports.connect = async (req, res) => {

    try {

        const {

            robotId,

            ip,

            port,

            endpoint

        } = req.body;

        const result = await opcua.connect(

            robotId,

            ip,

            port,

            endpoint

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

    }

    catch (err) {

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

const robotManager = require("../services/robotManager");

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