const fs = require("fs");
const path = require("path");

const robotFile = path.join(__dirname, "../config/robots.json");

class RobotManager {

    constructor() {

        this.robots = [];

        this.sessions = new Map();

        this.loadRobots();

    }

    /*=========================================
        LOAD
    =========================================*/

    loadRobots() {

        try {

            if (fs.existsSync(robotFile)) {

                this.robots = JSON.parse(

                    fs.readFileSync(robotFile, "utf8")

                );

            }

            else {

                this.saveRobots();

            }

        }

        catch (err) {

            console.error(err);

            this.robots = [];

        }

    }

    /*=========================================
        SAVE
    =========================================*/

    saveRobots() {

        fs.writeFileSync(

            robotFile,

            JSON.stringify(this.robots, null, 4)

        );

    }

    /*=========================================
        ROBOTS
    =========================================*/

    getRobots() {

        return this.robots;

    }

    getRobot(id) {

        return this.robots.find(

            r => r.id === id

        );

    }

    addRobot(robot) {

        if (this.getRobot(robot.id)) {

            throw new Error("Robot ID already exists");

        }

        this.robots.push({

            connected: false,

            manufacturer: "FANUC",

            model: "",

            ...robot

        });

        this.saveRobots();

        return robot;

    }

    updateRobot(id, data) {

        const robot = this.getRobot(id);

        if (!robot) {

            throw new Error("Robot not found");

        }

        Object.assign(robot, data);

        this.saveRobots();

        return robot;

    }

    deleteRobot(id) {

        this.robots = this.robots.filter(

            r => r.id !== id

        );

        this.sessions.delete(id);

        this.saveRobots();

    }

    /*=========================================
        CONNECTIONS
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

        return Array.from(

            this.sessions.keys()

        );

    }

}

module.exports = new RobotManager();