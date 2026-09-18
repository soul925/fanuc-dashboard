// services/robotManager.js

const fs = require("fs");
const path = require("path");
const logger = require("./logger");

const configDir = path.join(__dirname, "../config");
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

const robotFile = path.join(configDir, "robots.json");

class RobotManager {
    constructor() {
        this.robots = [];
        this.sessions = new Map();
        this.loadRobots();
    }

    /*=========================================
        LOAD ROBOTS
    =========================================*/
    loadRobots() {
        try {
            if (fs.existsSync(robotFile)) {
                const data = fs.readFileSync(robotFile, "utf8").trim();
                this.robots = data ? JSON.parse(data) : [];
            }
            
            // Provide default Robot_1 if empty
            if (!Array.isArray(this.robots) || this.robots.length === 0) {
                this.robots = [
                    {
                        id: "Robot_1",
                        name: "FANUC Robot 1",
                        ip: "127.0.0.1",
                        port: 4880,
                        endpoint: "/FANUC/NanoUaServer",
                        ftpIp: "127.0.0.1",
                        ftpPort: 21,
                        ftpUser: "anonymous",
                        ftpPassword: "",
                        tftpPort: 69,
                        autoConnect: false,
                        connected: false,
                        manufacturer: "FANUC"
                    }
                ];
                this.saveRobots();
            }
        } catch (err) {
            logger.error(`Failed to load robots.json: ${err.message}`);
            this.robots = [];
        }
    }

    /*=========================================
        SAVE ROBOTS
    =========================================*/
    saveRobots() {
        try {
            fs.writeFileSync(
                robotFile,
                JSON.stringify(this.robots, null, 4),
                "utf8"
            );
        } catch (err) {
            logger.error(`Failed to save robots.json: ${err.message}`);
        }
    }

    /*=========================================
        GET ALL ROBOTS
    =========================================*/
    getRobots() {
        return this.robots.map(r => ({
            ...r,
            // Mask password in responses for security
            ftpPassword: r.ftpPassword ? "••••••••" : ""
        }));
    }

    /*=========================================
        GET SINGLE ROBOT (INTERNAL WITH CREDS)
    =========================================*/
    getRobotInternal(id) {
        return this.robots.find(r => r.id === id) || null;
    }

    /*=========================================
        GET SINGLE ROBOT (PUBLIC)
    =========================================*/
    getRobot(id) {
        const robot = this.getRobotInternal(id);
        if (!robot) return null;
        return {
            ...robot,
            ftpPassword: robot.ftpPassword ? "••••••••" : ""
        };
    }

    /*=========================================
        ADD ROBOT
    =========================================*/
    addRobot(data) {
        const id = (data.id || "").trim();
        if (!id) {
            throw new Error("Robot ID is required");
        }

        if (this.robots.some(r => r.id === id)) {
            throw new Error(`Robot ID "${id}" already exists`);
        }

        const ip = (data.ip || "").trim() || "127.0.0.1";
        const newRobot = {
            id,
            name: (data.name || "").trim() || id,
            ip,
            port: parseInt(data.port, 10) || 4880,
            endpoint: (data.endpoint || "").trim() || "/FANUC/NanoUaServer",
            ftpIp: (data.ftpIp || "").trim() || ip,
            ftpPort: parseInt(data.ftpPort, 10) || 21,
            ftpUser: (data.ftpUser || "").trim() || "anonymous",
            ftpPassword: data.ftpPassword !== undefined ? String(data.ftpPassword) : "",
            tftpPort: parseInt(data.tftpPort, 10) || 69,
            autoConnect: Boolean(data.autoConnect),
            connected: false,
            manufacturer: "FANUC"
        };

        this.robots.push(newRobot);
        this.saveRobots();
        logger.info(`[RobotManager] Added robot profile: ${id} (${newRobot.name})`);

        return this.getRobot(id);
    }

    /*=========================================
        UPDATE ROBOT
    =========================================*/
    updateRobot(id, data) {
        const robot = this.getRobotInternal(id);
        if (!robot) {
            throw new Error(`Robot with ID "${id}" not found`);
        }

        if (data.name !== undefined) robot.name = String(data.name).trim();
        if (data.ip !== undefined) robot.ip = String(data.ip).trim();
        if (data.port !== undefined) robot.port = parseInt(data.port, 10) || 4880;
        if (data.endpoint !== undefined) robot.endpoint = String(data.endpoint).trim();
        if (data.ftpIp !== undefined) robot.ftpIp = String(data.ftpIp).trim();
        if (data.ftpPort !== undefined) robot.ftpPort = parseInt(data.ftpPort, 10) || 21;
        if (data.ftpUser !== undefined) robot.ftpUser = String(data.ftpUser).trim();
        if (data.ftpPassword !== undefined && data.ftpPassword !== "••••••••") {
            robot.ftpPassword = String(data.ftpPassword);
        }
        if (data.tftpPort !== undefined) robot.tftpPort = parseInt(data.tftpPort, 10) || 69;
        if (data.autoConnect !== undefined) robot.autoConnect = Boolean(data.autoConnect);

        this.saveRobots();
        logger.info(`[RobotManager] Updated robot profile: ${id}`);

        return this.getRobot(id);
    }

    /*=========================================
        DELETE ROBOT
    =========================================*/
    deleteRobot(id) {
        const initialLength = this.robots.length;
        this.robots = this.robots.filter(r => r.id !== id);
        this.sessions.delete(id);

        if (this.robots.length < initialLength) {
            this.saveRobots();
            logger.info(`[RobotManager] Deleted robot profile: ${id}`);
            return true;
        }
        return false;
    }

    /*=========================================
        SESSION ACCESSORS
    =========================================*/
    setSession(id, session) {
        this.sessions.set(id, session);
    }

    getSession(id) {
        return this.sessions.get(id);
    }

    removeSession(id) {
        this.sessions.delete(id);
    }

    isConnected(id) {
        return this.sessions.has(id);
    }

    getConnectedRobots() {
        return Array.from(this.sessions.keys());
    }
}

module.exports = new RobotManager();