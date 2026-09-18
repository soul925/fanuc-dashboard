const express = require("express");
const router = express.Router();
const ioController = require("../controllers/ioController");

router.get("/:robotId", ioController.getIO);
router.post("/write", ioController.writeIO);
router.post("/write-output", ioController.writeIO);

module.exports = router;