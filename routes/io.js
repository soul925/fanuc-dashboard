const express = require("express");
const router = express.Router();
const ioController = require("../controllers/ioController");

router.get("/:robotId", ioController.getIO);

module.exports = router;