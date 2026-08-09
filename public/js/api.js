const API_BASE = "/api";

async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(API_BASE + url, {
            headers: {
                "Content-Type": "application/json"
            },
            ...options
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Request failed");
        }

        return data;

    } catch (err) {
        console.error(err);
        alert(err.message);
        throw err;
    }
}

/*==============================
    ROBOT APIs
==============================*/

async function getRobots() {
    return apiRequest("/robots");
}

async function getConnectedRobots() {
    return apiRequest("/robots/connected");
}

async function addRobot(robot) {
    return apiRequest("/robots", {
        method: "POST",
        body: JSON.stringify(robot)
    });
}

async function updateRobot(id, robot) {
    return apiRequest(`/robots/${id}`, {
        method: "PUT",
        body: JSON.stringify(robot)
    });
}

async function deleteRobot(id) {
    return apiRequest(`/robots/${id}`, {
        method: "DELETE"
    });
}

async function connectRobot(robotId) {
    return apiRequest("/connect", {
        method: "POST",
        body: JSON.stringify({ robotId })
    });
}

async function disconnectRobot(robotId) {
    return apiRequest("/disconnect", {
        method: "POST",
        body: JSON.stringify({ robotId })
    });
}

/*==============================
    OPC UA APIs
==============================*/

async function getStatus(robotId) {
    return apiRequest(`/status/${robotId}`);
}

async function browseRobot(robotId) {
    return apiRequest(`/browse/${robotId}`);
}

async function readNode(robotId, nodeId) {
    return apiRequest("/read", {
        method: "POST",
        body: JSON.stringify({
            robotId,
            nodeId
        })
    });
}

async function writeNode(robotId, nodeId, value) {
    return apiRequest("/write", {
        method: "POST",
        body: JSON.stringify({
            robotId,
            nodeId,
            value
        })
    });
}

async function searchNodes(robotId, q) {
    return apiRequest(`/search?robotId=${robotId}&q=${encodeURIComponent(q)}`);
}

async function getCache(robotId) {
    return apiRequest(`/cache?robotId=${robotId}`);
}