// controllers/backupController.js

const backupService = require("../services/backup");
const database = require("../services/database");
const path = require("path");
const fs = require("fs");

exports.backupRobot = async (req, res) => {
    try {
        const { robotId } = req.params;
        const result = await backupService.backupRobot(robotId, req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.testFtp = async (req, res) => {
    try {
        const robotId = req.params.robotId || req.body.robotId || req.query.robotId;
        const result = await backupService.testFtpConnection(robotId);
        res.json(result);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.backupAll = async (req, res) => {
    try {
        const result = await backupService.backupAllRobots(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.listBackups = (req, res) => {
    try {
        const { robotId } = req.query;
        const backups = backupService.listBackups(robotId);
        res.json({
            success: true,
            count: backups.length,
            backups
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.getHistory = (req, res) => {
    try {
        const { robotId } = req.query;
        const history = database.getBackupHistory(robotId, 100);
        res.json({
            success: true,
            count: history.length,
            history
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.downloadBackup = (req, res) => {
    try {
        const { filename } = req.params;
        const backups = backupService.listBackups();
        const target = backups.find(b => b.filename === filename);

        if (!target || !fs.existsSync(target.path)) {
            return res.status(404).json({
                success: false,
                message: "Backup file not found"
            });
        }

        res.download(target.path, target.filename);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.deleteBackup = (req, res) => {
    try {
        const { filename } = req.params;
        const result = backupService.deleteBackup(filename);
        res.json({
            success: result,
            message: `Backup ${filename} deleted successfully.`
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
