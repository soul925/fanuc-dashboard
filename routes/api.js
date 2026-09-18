const express = require("express");

const router = express.Router();

const controller = require("../controllers/robotController");

/*=========================================
    CONNECTION
=========================================*/

router.post("/connect", controller.connect);

router.post("/disconnect", controller.disconnect);

/*=========================================
    ROBOT MANAGER
=========================================*/

router.get("/robots", controller.getRobots);

router.post("/robots", controller.addRobot);

router.put("/robots/:id", controller.updateRobot);

router.delete("/robots/:id", controller.deleteRobot);

router.get("/robots/connected", controller.connectedRobots);

/*=========================================
    ROBOT STATUS
=========================================*/

router.get("/status-all", controller.allStatus);
router.get("/status/:robotId", controller.status);
router.get("/modbus/:robotId", controller.modbus);

/*=========================================
    OPC UA BROWSER & NAVIGATOR
=========================================*/

router.get("/browse/:robotId", controller.browse);
router.get("/browse-children/:robotId", controller.browseChildren);
router.get("/browse-tree/:robotId", controller.browseTree);
router.get("/node-details/:robotId", controller.getNodeDetails);

/*=========================================
    READ
=========================================*/

router.post("/read", controller.read);

/*=========================================
    READ MULTIPLE
=========================================*/

router.post("/readMultiple", controller.readMultiple);

/*=========================================
    WRITE
=========================================*/

router.post("/write", controller.write);

/*=========================================
    SEARCH
=========================================*/

router.get("/search", controller.search);

/*=========================================
    CACHE
=========================================*/

router.get("/cache", controller.cache);

/*=========================================
    SUBSCRIBE
=========================================*/

router.get("/subscribe", async (req, res) => {

    res.json({

        success: false,

        message: "Use WebSocket Version"

    });

});

/*=========================================
    EXPORT
=========================================*/

module.exports = router;