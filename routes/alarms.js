const express = require("express");
const router = express.Router();
const alarmController = require("../controllers/alarmController");

router.get("/:robotId", alarmController.getAlarms);

module.exports = router;