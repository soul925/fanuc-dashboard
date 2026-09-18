const express = require("express");
const router = express.Router();
const registerController = require("../controllers/registerController");

router.get("/:robotId", registerController.getRegisters);
router.post("/write", registerController.writeRegister);

module.exports = router;