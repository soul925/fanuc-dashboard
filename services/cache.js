/*=========================================
    MULTI ROBOT CACHE
=========================================*/

const robotCache = new Map();

/*
Structure

robotCache = {
    robot1: [
        {...},
        {...}
    ],

    robot2: [
        {...},
        {...}
    ]
}
*/

/*=========================================
    CLEAR
=========================================*/

function clearCache(robotId) {

    robotCache.set(robotId, []);

}

/*=========================================
    ADD NODE
=========================================*/

function addNode(robotId, node) {

    if (!robotCache.has(robotId)) {

        robotCache.set(robotId, []);

    }

    robotCache.get(robotId).push(node);

}

/*=========================================
    GET ALL
=========================================*/

function getAllNodes(robotId) {

    return robotCache.get(robotId) || [];

}

/*=========================================
    SEARCH
=========================================*/

function searchNodes(robotId, keyword) {

    keyword = keyword.toLowerCase();

    return getAllNodes(robotId).filter(node =>

        (node.browseName || "")
            .toLowerCase()
            .includes(keyword)

        ||

        (node.displayName || "")
            .toLowerCase()
            .includes(keyword)

        ||

        (node.nodeId || "")
            .toLowerCase()
            .includes(keyword)

    );

}

/*=========================================
    REMOVE ROBOT CACHE
=========================================*/

function removeRobot(robotId) {

    robotCache.delete(robotId);

}

/*=========================================
    GET ROBOTS
=========================================*/

function getRobots() {

    return Array.from(robotCache.keys());

}

/*=========================================
    EXPORT
=========================================*/

module.exports = {

    clearCache,

    addNode,

    getAllNodes,

    searchNodes,

    removeRobot,

    getRobots

};