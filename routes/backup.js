// routes/backup.js

const express = require("express");
const router = express.Router();
const backupController = require("../controllers/backupController");

router.get("/test-ftp/:robotId", backupController.testFtp);
router.post("/test-ftp/:robotId", backupController.testFtp);
router.post("/test-ftp", backupController.testFtp);
router.post("/all", backupController.backupAll);
router.post("/:robotId", backupController.backupRobot);
router.get("/list", backupController.listBackups);
router.get("/history", backupController.getHistory);
router.get("/download/:filename", backupController.downloadBackup);
router.delete("/:filename", backupController.deleteBackup);

module.exports = router;
