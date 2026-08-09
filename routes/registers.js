const express = require("express");
const router = express.Router();
const registerController = require("../controllers/registerController");

router.get("/:robotId", registerController.getRegisters);

module.exports = router;