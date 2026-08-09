const express = require("express");
const router = express.Router();
const programController = require("../controllers/programController");

router.get("/:robotId", programController.getProgram);

module.exports = router;