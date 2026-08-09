//==================================================
// FANUC OPC UA Dashboard
// app.js
//==================================================
let monitoredSignals = [];
let currentNode = null;
let connected = false;
let currentRobotId = "";
let pollTimer = null;
let browseCache = [];

//==================================================
// PAGE NAVIGATION
//==================================================

function showPage(pageId, element) {

    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
    });

    document.getElementById(pageId).classList.add("active");

    document.querySelectorAll(".sidebar li").forEach(item => {
        item.classList.remove("active");
    });

    if (element) {
        element.classList.add("active");
    }

}

//==================================================
// LOGGING
//==================================================

function addLog(message) {

    const logArea = document.getElementById("logArea");

    if (!logArea) return;

    const time = new Date().toLocaleTimeString();

    logArea.value += `[${time}] ${message}\n`;

    logArea.scrollTop = logArea.scrollHeight;

}

//==================================================
// CONNECT
//==================================================

async function connectRobot() {

    if (connected) {
        alert("Already connected.");
        return;
    }

    const robotId = document.getElementById("robotId").value.trim();
    const ip = document.getElementById("ip").value.trim();
    const port = document.getElementById("port").value.trim();
    const endpoint = document.getElementById("endpoint").value.trim();

    if (!robotId || !ip || !port || !endpoint) {
        alert("Please fill all fields.");
        return;
    }

    try {

        const response = await fetch("/api/connect", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                robotId,
                ip,
                port,
                endpoint
            })

        });

        const result = await response.json();
        console.log("Browse result:", result);

        if (!result.success) {
            alert(result.message || "Connection failed.");
            return;
        }

        currentRobotId = robotId;
        document.getElementById("connRobot").innerText = robotId;
        document.getElementById("connStatus").innerText = "Connected";
        document.getElementById("connEndpoint").innerText = endpoint;
        connected = true;

        document.getElementById("statusText").innerText = "Connected";
        document.getElementById("statusDot").className = "online";

        addLog(`Connected to ${robotId}`);

        startPolling();

    }

    catch (err) {

        alert(err.message);

        addLog(err.message);

    }

}

//==================================================
// DISCONNECT
//==================================================

async function disconnectRobot() {

    if (!connected)
        return;

    try {

        await fetch("/api/disconnect", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                robotId: currentRobotId
            })

        });

    }

    catch (err) {

        console.log(err);

    }

    connected = false;
    document.getElementById("connRobot").innerText = "--";
    document.getElementById("connStatus").innerText = "Disconnected";
    document.getElementById("connEndpoint").innerText = "--";

    currentRobotId = "";

    clearInterval(pollTimer);

    document.getElementById("statusText").innerText = "Disconnected";
    document.getElementById("statusDot").className = "offline";

    addLog("Disconnected.");

}
//==================================================
// POLLING
//==================================================

function startPolling() {

    if (pollTimer)
        clearInterval(pollTimer);

    loadStatus();

    const pollRate = parseInt(localStorage.getItem("pollRate")) || 1000;

    pollTimer = setInterval(loadStatus, pollRate);

}
//==================================================
// LOAD STATUS
//==================================================

async function loadStatus() {

    if (!connected || !currentRobotId)
        return;

    try {

        const response = await fetch(`/api/status/${currentRobotId}`);

        const data = await response.json();

        console.log(data);

        if (!response.ok || data.success === false) {
            throw new Error(data.message || "Unable to load status");
        }

        // Dashboard
        setValue("model", data.model);
        setValue("serial", data.serial);
        setValue("program", data.program);
        setValue("speed", data.speed);
        setValue("mode", data.mode);
        setValue("servo", data.servo);
        setValue("estop", data.estop);
        setValue("pstop", data.pstop);

        // Robot Monitor
        setValue("mModel", data.model);
        setValue("mSerial", data.serial);
        setValue("mProgram", data.program);
        setValue("mSpeed", data.speed);
        setValue("mMode", data.mode);
        setValue("mServo", data.servo);
        setValue("mEstop", data.estop);
        setValue("mPstop", data.pstop);

        // Overview
        // loadOverview();

        await updateDashboardSignals();
        await loadIO();

    }
    catch (err) {

        console.error(err);
        addLog(err.message);

    }

}

//==================================================
// HELPER
//==================================================

function setValue(id, value) {

    const el = document.getElementById(id);

    if (el)
        el.innerText = value ?? "--";

}
//==================================================
// BROWSE OPC UA
//==================================================

async function browseNodes() {

    if (!connected || !currentRobotId) {
        alert("Connect to a robot first.");
        return;
    }

    try {

        addLog(`Browsing namespace (${currentRobotId})...`);

        console.log("Browsing:", currentRobotId);

        const response = await fetch(`/api/browse/${currentRobotId}`);

        console.log("Browse status:", response.status);
        const result = await response.json();

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "Browse failed");
        }

        browseCache = result.nodes || result || [];

        renderTree(browseCache);

        addLog("Browse completed.");

    }

    catch (err) {

        addLog(err.message);

    }

}

//==================================================
// RENDER TREE
//==================================================

function createTreeHTML(nodes, level = 0) {

    let html = "";

    nodes.forEach(node => {

        html += `
        <div class="tree-item"
            style="padding-left:${level * 20}px"
            onclick="selectNode(
                '${node.nodeId || ""}',
                '${node.browseName || ""}',
                '${node.displayName || ""}',
                '${node.dataType || ""}',
                '${node.writable || false}'
            )">

            <i class="fa-solid fa-cube"></i>

            ${node.displayName || node.browseName || node.nodeId}

        </div>
        `;

        if (node.children && node.children.length > 0) {
            html += createTreeHTML(node.children, level + 1);
        }

    });

    return html;

}

function renderTree(nodes) {

    const tree = document.getElementById("nodeTree");

    if (!Array.isArray(nodes) || nodes.length === 0) {

        tree.innerHTML = "<p>No nodes found.</p>";
        return;

    }

    tree.innerHTML = createTreeHTML(nodes);

}

//==================================================
// SELECT NODE
//==================================================

function selectNode(nodeId, browse, display, datatype, access) {

    setValue("selectedNodeId", nodeId);
    setValue("selectedBrowseName", browse);
    setValue("selectedDisplayName", display);
    setValue("selectedDatatype", datatype);
    setValue("selectedAccess", access);
    setValue("selectedValue", "--");

    const readNode = document.getElementById("readNodeId");
    const writeNode = document.getElementById("writeNodeId");

    if (readNode)
        readNode.value = nodeId;

    if (writeNode)
        writeNode.value = nodeId;

    currentNode = {
    nodeId,
    browseName: browse,
    displayName: display,
    dataType: datatype
    };
}
function addSignal() {

    if (!currentNode) {
        alert("Select a node first.");
        return;
    }

    const name =
        document.getElementById("signalName").value.trim() ||
        currentNode.displayName;

    monitoredSignals.push({
        ...currentNode,
        friendlyName: name
    });

    localStorage.setItem(
        "monitoredSignals",
        JSON.stringify(monitoredSignals)
    );

    renderSignals();
    renderDashboardSignals();

}

function removeSignal(index) {

    monitoredSignals.splice(index, 1);

    localStorage.setItem(
        "monitoredSignals",
        JSON.stringify(monitoredSignals)
    );

    renderSignals();
    renderDashboardSignals();

}

function renderSignals() {

    const container =
        document.getElementById("selectedSignals");

    if (!container) return;

    if (monitoredSignals.length === 0) {

        container.innerHTML = "<p>No signals selected.</p>";
        return;

    }

    container.innerHTML = "";

    monitoredSignals.forEach((signal, index) => {

        container.innerHTML += `
            <div class="card">
                <b>${signal.friendlyName}</b><br>
                <small>${signal.nodeId}</small><br><br>
                <button onclick="removeSignal(${index})">
                    Remove
                </button>
            </div>
        `;

    });

}

function clearSignalSelection() {

    currentNode = null;

    const input = document.getElementById("signalName");
    if (input) input.value = "";

}

function renderDashboardSignals() {

    const container = document.getElementById("dashboardSignals");

    if (!container) return;

    if (monitoredSignals.length === 0) {

        container.innerHTML = "<p>No signals added.</p>";
        return;

    }

    container.innerHTML = "";

    monitoredSignals.forEach(signal => {

        container.innerHTML += `
            <div class="card" style="margin-bottom:10px;">
                <b>${signal.friendlyName}</b><br>
                <small>${signal.nodeId}</small><br>
                <span id="dash-${signal.nodeId.replace(/[^a-zA-Z0-9]/g,'')}">--</span>
            </div>
        `;

    });

}
async function updateDashboardSignals() {

    if (!connected || !currentRobotId || monitoredSignals.length === 0)
        return;

    try {

        const response = await fetch("/api/readMultiple", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                robotId: currentRobotId,

                nodeIds: monitoredSignals.map(signal => signal.nodeId)

            })

        });

        const result = await response.json();

        if (!result.success) return;

        result.values.forEach((value, index) => {

            const signal = monitoredSignals[index];

            const id =
                "dash-" +
                signal.nodeId.replace(/[^a-zA-Z0-9]/g, "");

            const element = document.getElementById(id);

            if (element) {

                element.innerText = value.success
                    ? value.value
                    : "Error";

            }

        });

    }

    catch (err) {

        console.error(err);

    }

}
//==================================================
// SEARCH
//==================================================

function searchNodes() {

    const keyword = document
        .getElementById("nodeSearch")
        .value
        .trim()
        .toLowerCase();

    if (!keyword) {

        renderTree(browseCache);

        return;

    }

    const filtered = browseCache.filter(node => {

        return (
            (node.displayName || "").toLowerCase().includes(keyword) ||
            (node.browseName || "").toLowerCase().includes(keyword) ||
            (node.nodeId || "").toLowerCase().includes(keyword)
        );

    });

    renderTree(filtered);

}
//==================================================
// READ NODE
//==================================================

async function readNode() {

    if (!connected || !currentRobotId) {
        alert("Connect to a robot first.");
        return;
    }

    const nodeId = document
        .getElementById("readNodeId")
        .value
        .trim();

    if (!nodeId) {
        alert("Enter NodeId");
        return;
    }

    try {

        const response = await fetch("/api/read", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                robotId: currentRobotId,
                nodeId
            })

        });

        const result = await response.json();

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "Read failed");
        }

        document.getElementById("readValue").value =
            JSON.stringify(result, null, 2);

        setValue("selectedValue", result.value ?? "--");

        addLog(`Read ${nodeId}`);

    }

    catch (err) {

        addLog(err.message);

    }

}

//==================================================
// WRITE NODE
//==================================================

async function writeNode() {

    if (!connected || !currentRobotId) {
        alert("Connect to a robot first.");
        return;
    }

    const nodeId = document
        .getElementById("writeNodeId")
        .value
        .trim();

    const value = document
        .getElementById("writeValue")
        .value;

    const dataType = document
        .getElementById("dataType")
        .value;

    if (!nodeId) {
        alert("Enter NodeId");
        return;
    }

    try {

        const response = await fetch("/api/write", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                robotId: currentRobotId,
                nodeId,
                value,
                dataType

            })

        });

        const result = await response.json();

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "Write failed");
        }

        alert(result.message);

        addLog(`Write ${nodeId}`);

    }

    catch (err) {

        addLog(err.message);

    }

}
//==================================================
// SETTINGS
//==================================================

function saveSettings() {

    const pollRate =
        document.getElementById("pollRate").value;

    localStorage.setItem("pollRate", pollRate);
    document.getElementById("currentPollRate").innerText = `${pollRate} ms`;

    localStorage.setItem(
        "autoConnect",
        document.getElementById("autoConnect").checked
    );

    if (connected) {

        clearInterval(pollTimer);

        pollTimer = setInterval(
            loadStatus,
            parseInt(pollRate) || 1000
        );

    }

    addLog("Settings saved.");

    alert("Settings Saved.");

}

function toggleDarkMode() {

    document.body.classList.toggle("dark");

    localStorage.setItem(
        "darkMode",
        document.body.classList.contains("dark")
    );

}

function clearLogs() {

    const logArea = document.getElementById("logArea");

    if (logArea)
        logArea.value = "";

}
//==================================================
// OVERVIEW
//==================================================

// async function loadOverview() {

//     if (!connected || !currentRobotId)
//         return;

//     try {

//         const response = await fetch(`/api/overview/${currentRobotId}`);

//         const data = await response.json();

//         if (!response.ok || data.success === false) {
//             throw new Error(data.message || "Overview load failed");
//         }

//         setValue("ovModel", data.model);
//         setValue("ovSerial", data.serial);
//         setValue("ovVersion", data.version);
//         setValue("ovManufacturer", data.manufacturer);
//         setValue("ovMode", data.mode);
//         setValue("ovOperation", data.operation);
//         setValue("ovServo", data.servo);
//         setValue("ovAlarm", data.alarm);

//     }
//     catch (err) {

//         console.error(err);
//         addLog(err.message);

//     }

// }
//==================================================
// I/O MONITOR
//==================================================

async function loadIOMonitor() {

    if (!connected || !currentRobotId)
        return;

    try {

        const response = await fetch(
            `/api/modbus/${currentRobotId}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error("Unable to load I/O");
        }

        renderDI(data.digitalInputs || []);

        renderDO(data.digitalOutputs || []);

        renderIR(data.inputRegisters || []);
        renderHR(data.holdingRegisters || []);

    }

    catch (err) {

        console.error(err);
        addLog(err.message);

    }

}
//==================================================
// RENDER INPUT REGISTERS
//==================================================

function renderIR(registers) {

    const container = document.getElementById("inputRegisters");

    if (!container) return;

    container.innerHTML = "";

    registers.forEach(reg => {

        container.innerHTML += `

            <div class="io-item">

                <strong>IR${reg.index}</strong><br><br>

                <span>${reg.value}</span>

            </div>

        `;

    });

}

//==================================================
// RENDER HOLDING REGISTERS
//==================================================

function renderHR(registers) {

    const container = document.getElementById("holdingRegisters");

    if (!container) return;

    container.innerHTML = "";

    registers.forEach(reg => {

        container.innerHTML += `

            <div class="io-item">

                <strong>HR${reg.index}</strong><br><br>

                <span>${reg.value}</span>

            </div>

        `;

    });

}
//==================================================
// LOAD I/O
//==================================================

async function loadIO() {

    if (!connected || !currentRobotId)
        return;

    try {

        const response = await fetch(`/api/modbus/${currentRobotId}`);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Unable to load I/O");
        }

        renderDI(data.digitalInputs || []);
        renderDO(data.digitalOutputs || []);
        renderIR(data.inputRegisters || []);
        renderHR(data.holdingRegisters || []);

    }

    catch (err) {

        console.error(err);
        addLog(err.message);

    }

}

//==================================================
// RENDER DIGITAL INPUTS
//==================================================

function renderDI(inputs) {

    const container = document.getElementById("digitalInputs");

    if (!container) return;

    container.innerHTML = "";

    inputs.forEach(input => {

        container.innerHTML += `

            <div class="io-item">

                <strong>DI${input.index}</strong><br><br>

                <span class="${input.value ? "io-on" : "io-off"}">

                    ${input.value ? "🟢 ON" : "🔴 OFF"}

                </span>

            </div>

        `;

    });

}

//==================================================
// RENDER DIGITAL OUTPUTS
//==================================================
function renderDO(outputs) {

    const container = document.getElementById("digitalOutputs");

    if (!container) return;

    container.innerHTML = "";

    outputs.forEach(output => {

        container.innerHTML += `

            <div class="io-item">

                <strong>DO${output.index}</strong><br><br>

                <span class="${output.value ? "io-on" : "io-off"}">

                    ${output.value ? "🟢 ON" : "🔴 OFF"}

                </span>

                <br><br>

                <button onclick="writeDO(${output.index}, 1)">
                    ON
                </button>

                <button onclick="writeDO(${output.index}, 0)">
                    OFF
                </button>

            </div>

        `;

    });

}
//==================================================
// WRITE DIGITAL OUTPUT
//==================================================
async function writeDO(index, value) {

    try {

        const response = await fetch("/api/write", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                robotId: currentRobotId,

                nodeId: "ns=1;i=302",

                index: index,

                value: Boolean(value)

            })

        });

        const result = await response.json();

        console.log(result);

        await loadIO();

    }

    catch (err) {

        console.error(err);

    }

}
//==================================================
// INITIALIZE
//==================================================

window.onload = () => {

    const pollRate = localStorage.getItem("pollRate");

    if (pollRate) {

        document.getElementById("pollRate").value = pollRate;

    }

    if (localStorage.getItem("autoConnect") === "true") {

        document.getElementById("autoConnect").checked = true;

    }

    if (localStorage.getItem("darkMode") === "true") {

    document.body.classList.add("dark");

}

const savedSignals = localStorage.getItem("monitoredSignals");

if (savedSignals) {

    monitoredSignals = JSON.parse(savedSignals);

    renderSignals();
    renderDashboardSignals();

}

addLog("Dashboard Ready.");

};