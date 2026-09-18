const express = require("express");
const router = express.Router();
const alarmController = require("../controllers/alarmController");

router.post("/clear", alarmController.clearAlarms);
router.get("/:robotId", alarmController.getAlarms);

module.exports = router;