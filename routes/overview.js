const express = require("express");
const router = express.Router();
const overviewController = require("../controllers/overviewController");

router.get("/:robotId", overviewController.getOverview);

module.exports = router;