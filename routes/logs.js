// routes/logs.js

const express = require("express");
const router = express.Router();
const logController = require("../controllers/logController");

router.get("/", logController.getLogs);
router.post("/clear", logController.clearLogs);

module.exports = router;
