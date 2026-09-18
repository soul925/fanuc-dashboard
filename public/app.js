//==================================================
// FANUC Multi-Robot Industrial Dashboard & Manager
// app.js
//==================================================

let configuredRobots = [];
let activeRobotId = "Robot_1";
let connected = false;
let connectedRobots = new Set();
let isConnecting = false;
let activePageId = "dashboard";
let pollTimer = null;
let browseCache = [];
let currentNode = null;
let alarmSearchDebounceTimer = null;
let logSearchDebounceTimer = null;
let currentAlarmHistoryCache = [];
let currentAppLogsCache = [];

// Range storage per robot: { Robot_1: { di: [], do: [], ir: [], dr: [] } }
let robotRanges = {};

//==================================================
// THEME MANAGEMENT (DARK / LIGHT MODE)
//==================================================

function initTheme() {
    const savedTheme = localStorage.getItem("fanuc_theme") || "dark";
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const btn = document.getElementById("themeToggleBtn");
    if (btn) {
        btn.innerHTML = theme === "light" 
            ? `<i class="fa-solid fa-sun" style="color: #FF9800;"></i>` 
            : `<i class="fa-solid fa-moon" style="color: var(--fanuc-yellow);"></i>`;
        btn.title = theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode";
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    localStorage.setItem("fanuc_theme", nextTheme);
    applyTheme(nextTheme);
    addLog(`Switched theme to ${nextTheme.toUpperCase()} MODE`);
}

//==================================================
// INITIALIZATION
//==================================================

function startSystemClock() {
    function update() {
        const el = document.getElementById("footerSystemTime");
        if (el) {
            const now = new Date();
            el.innerText = now.toLocaleTimeString();
        }
    }
    update();
    setInterval(update, 1000);
}

document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    startSystemClock();
    loadSavedRanges();
    await fetchRobots();
    await checkConnectedRobots();
    setupGlobalRobotSelector();
    setupDropdownFilters();
    startPollingLoop();
    showPage("dashboard");
});

//==================================================
// RANGE PERSISTENCE (PER ROBOT)
//==================================================

function loadSavedRanges() {
    try {
        const saved = localStorage.getItem("fanuc_robot_ranges");
        if (saved) {
            robotRanges = JSON.parse(saved);
        }
    } catch {
        robotRanges = {};
    }
}

function saveRanges() {
    try {
        localStorage.setItem("fanuc_robot_ranges", JSON.stringify(robotRanges));
    } catch {}
}

function getActiveRanges() {
    if (!robotRanges[activeRobotId]) {
        robotRanges[activeRobotId] = {
            di: [{ start: 1, end: 100, namePrefix: "DI" }],
            do: [{ start: 1, end: 50, namePrefix: "DO" }],
            ir: [{ start: 1, end: 50, namePrefix: "IR" }],
            dr: [{ start: 1, end: 100, namePrefix: "DR" }]
        };
        saveRanges();
    }
    return robotRanges[activeRobotId];
}

//==================================================
// ROBOTS FETCH & SELECTORS
//==================================================

async function fetchRobots() {
    try {
        const res = await fetch("/api/robots");
        if (res.ok) {
            configuredRobots = await res.json();
            if (!Array.isArray(configuredRobots) || configuredRobots.length === 0) {
                configuredRobots = [{ id: "Robot_1", name: "FANUC Robot 1", ip: "127.0.0.1", port: 4880, endpoint: "/FANUC/NanoUaServer" }];
            }
        }
    } catch (err) {
        console.error("Failed to fetch robots:", err);
    }
}

async function checkConnectedRobots() {
    try {
        const res = await fetch("/api/robots/connected");
        if (res.ok) {
            const data = await res.json();
            connectedRobots = new Set(data.robots || []);
            connected = connectedRobots.has(activeRobotId);
            updateTopbarConnectionStatus();
        }
    } catch {}
}

function setupGlobalRobotSelector() {
    const selector = document.getElementById("globalRobotSelector");
    if (!selector) return;

    selector.innerHTML = "";
    configuredRobots.forEach(r => {
        const isConn = connectedRobots.has(r.id);
        const opt = document.createElement("option");
        opt.value = r.id;
        opt.textContent = `${r.name || r.id} (${r.ip}) ${isConn ? "●" : "○"}`;
        selector.appendChild(opt);
    });

    const savedActive = localStorage.getItem("fanuc_active_robot");
    if (savedActive && configuredRobots.some(r => r.id === savedActive)) {
        activeRobotId = savedActive;
    } else if (configuredRobots.length > 0) {
        activeRobotId = configuredRobots[0].id;
    }

    selector.value = activeRobotId;
    updateActiveRobotDisplay();
    setupDropdownFilters();
}

function setupDropdownFilters() {
    // 1. Alarm Robot Filter
    const alarmFilter = document.getElementById("alarmRobotFilter");
    if (alarmFilter) {
        const curVal = alarmFilter.value;
        alarmFilter.innerHTML = `<option value="all">All Robots</option>`;
        configuredRobots.forEach(r => {
            const opt = document.createElement("option");
            opt.value = r.id;
            opt.textContent = `${r.name || r.id} (${r.id})`;
            alarmFilter.appendChild(opt);
        });
        if (curVal && (curVal === "all" || configuredRobots.some(r => r.id === curVal))) {
            alarmFilter.value = curVal;
        }
    }

    // 2. Backup Target Robot Selector
    const backupSelect = document.getElementById("backupTargetRobotSelect");
    if (backupSelect) {
        backupSelect.innerHTML = "";
        configuredRobots.forEach(r => {
            const opt = document.createElement("option");
            opt.value = r.id;
            opt.textContent = `${r.name || r.id} [${r.ip}]`;
            backupSelect.appendChild(opt);
        });
        if (configuredRobots.some(r => r.id === activeRobotId)) {
            backupSelect.value = activeRobotId;
        }
    }

    // 3. Log Robot Filter
    const logFilter = document.getElementById("logRobotFilter");
    if (logFilter) {
        const curVal = logFilter.value;
        logFilter.innerHTML = `<option value="all">All Robots</option>`;
        configuredRobots.forEach(r => {
            const opt = document.createElement("option");
            opt.value = r.id;
            opt.textContent = `${r.name || r.id} (${r.id})`;
            logFilter.appendChild(opt);
        });
        if (curVal && (curVal === "all" || configuredRobots.some(r => r.id === curVal))) {
            logFilter.value = curVal;
        }
    }
}

function onGlobalRobotChange(robotId) {
    activeRobotId = robotId;
    localStorage.setItem("fanuc_active_robot", robotId);
    connected = connectedRobots.has(activeRobotId);
    
    updateTopbarConnectionStatus();
    updateActiveRobotDisplay();
    renderRangeTags();

    // Trigger active page refresh
    if (activePageId === "dashboard") {
        loadStatus();
        loadAllRobotsSummary();
    } else if (activePageId === "io" || activePageId === "registers") {
        loadIO();
    } else if (activePageId === "programs") {
        loadPrograms();
    } else if (activePageId === "alarms") {
        loadAlarms();
    } else if (activePageId === "backups") {
        loadBackupsList();
    } else if (activePageId === "logs") {
        loadAppLogs();
    } else if (activePageId === "robot") {
        loadStatus();
    }
}

function updateActiveRobotDisplay() {
    const activeObj = configuredRobots.find(r => r.id === activeRobotId) || { id: activeRobotId, name: activeRobotId, ip: "127.0.0.1", port: 4880 };
    
    setValue("activeRobotTitle", `${activeObj.name || activeObj.id}`);
    setValue("activeAlarmsRobotTitle", `${activeObj.name || activeObj.id}`);
    setValue("activeRobotEndpointBadge", `opc.tcp://${activeObj.ip}:${activeObj.port || 4880}`);
    setValue("robotIdDisplay", activeObj.id);
    setValue("robotEndpoint", `opc.tcp://${activeObj.ip}:${activeObj.port || 4880}`);

    // Update Backup Diagnostics Box
    setValue("diagRobotIp", activeObj.ip || "--");
    setValue("diagOpcua", `opc.tcp://${activeObj.ip}:${activeObj.port || 4880}`);
    setValue("diagFtp", `ftp://${activeObj.ftpIp || activeObj.ip}:${activeObj.ftpPort || 21}`);

    const backupSelect = document.getElementById("backupTargetRobotSelect");
    if (backupSelect && backupSelect.value !== activeRobotId && configuredRobots.some(r => r.id === activeRobotId)) {
        backupSelect.value = activeRobotId;
    }
}

function updateTopbarConnectionStatus() {
    const dot = document.getElementById("statusDot");
    const text = document.getElementById("statusText");
    const btn = document.getElementById("quickConnectBtn");

    connected = connectedRobots.has(activeRobotId);
    const activeObj = configuredRobots.find(r => r.id === activeRobotId);
    const displayName = activeObj ? (activeObj.name || activeObj.id) : activeRobotId;

    if (connected) {
        if (dot) dot.className = "online";
        if (text) text.innerText = `Connected (${displayName})`;
        if (btn) {
            btn.className = "btn-sm btn-danger";
            btn.innerHTML = `<i class="fa-solid fa-plug-circle-xmark"></i> Disconnect`;
        }
        setValue("robotStatus", "Connected");
    } else {
        if (dot) dot.className = "offline";
        if (text) text.innerText = `Disconnected (${displayName})`;
        if (btn) {
            btn.className = "btn-sm btn-primary";
            btn.innerHTML = `<i class="fa-solid fa-plug"></i> Connect`;
        }
        setValue("robotStatus", "Disconnected");
    }
}

//==================================================
// QUICK CONNECT / DISCONNECT ACTIVE ROBOT
//==================================================

async function toggleActiveRobotConnection() {
    if (isConnecting) return;

    const robot = configuredRobots.find(r => r.id === activeRobotId);
    if (!robot) {
        alert("Selected robot configuration not found.");
        return;
    }

    if (connectedRobots.has(activeRobotId)) {
        // Disconnect
        try {
            const res = await fetch("/api/disconnect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ robotId: activeRobotId })
            });
            const data = await res.json();
            if (data.success) {
                connectedRobots.delete(activeRobotId);
                addLog(`Disconnected from ${activeRobotId}`);
            }
        } catch (err) {
            alert("Disconnect failed: " + err.message);
        }
    } else {
        // Connect
        const btn = document.getElementById("quickConnectBtn");
        try {
            isConnecting = true;
            if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Connecting...`;
            
            const res = await fetch("/api/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    robotId: robot.id,
                    ip: robot.ip,
                    port: robot.port,
                    endpoint: robot.endpoint
                })
            });
            const data = await res.json();
            if (data.success) {
                connectedRobots.add(activeRobotId);
                addLog(`Connected successfully to ${activeRobotId} (${robot.ip})`);
            } else {
                alert(data.message || `Could not connect to ${activeRobotId}`);
            }
        } catch (err) {
            alert(`Connection error for ${activeRobotId}: ` + err.message);
        } finally {
            isConnecting = false;
        }
    }

    updateTopbarConnectionStatus();
    setupGlobalRobotSelector();
    await loadAllRobotsSummary();
    if (connectedRobots.has(activeRobotId)) {
        await loadStatus();
    }
}

//==================================================
// PAGE NAVIGATION
//==================================================

function showPage(pageId, element) {
    activePageId = pageId;

    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add("active");

    document.querySelectorAll(".sidebar li").forEach(item => item.classList.remove("active"));
    if (element) {
        element.classList.add("active");
    } else {
        const matchingNav = Array.from(document.querySelectorAll(".sidebar li")).find(li => li.getAttribute("onclick")?.includes(pageId));
        if (matchingNav) matchingNav.classList.add("active");
    }

    // Refresh active page data
    renderRangeTags();
    if (pageId === "dashboard") {
        loadAllRobotsSummary();
        if (connected) loadStatus();
    } else if (pageId === "robots") {
        loadRobotManagerTable();
    } else if (pageId === "io" || pageId === "registers") {
        loadIO();
    } else if (pageId === "programs") {
        loadPrograms();
    } else if (pageId === "alarms") {
        loadAlarms();
    } else if (pageId === "backups") {
        loadBackupsList();
    } else if (pageId === "logs") {
        loadAppLogs();
    } else if (pageId === "browser") {
        initBrowserPage();
    } else if (pageId === "robot") {
        loadStatus();
    }
}

//==================================================
// MULTI-ROBOT FLEET DASHBOARD
//==================================================

async function loadAllRobotsSummary() {
    try {
        const res = await fetch("/api/status-all");
        if (!res.ok) return;

        const data = await res.json();
        const robots = data.robots || [];

        // Update stats
        setValue("statTotalRobots", configuredRobots.length);
        const onlineCount = robots.filter(r => r.connected).length;
        setValue("statConnectedRobots", onlineCount);
        
        // Sum total active alarms across the fleet
        const totalAlarms = data.totalActiveAlarms !== undefined ? data.totalActiveAlarms : robots.reduce((acc, r) => acc + (r.activeAlarmsCount || 0), 0);
        setValue("statAlarmsActive", totalAlarms);

        const container = document.getElementById("multiRobotGrid");
        if (!container) return;

        if (robots.length === 0) {
            container.innerHTML = `<p class="empty-state">No configured robots found. Add a robot in Robot Manager.</p>`;
            return;
        }

        container.innerHTML = "";
        robots.forEach(r => {
            const isSelected = r.id === activeRobotId;
            const isConn = r.connected;
            const alarmsCount = r.activeAlarmsCount || 0;

            const card = document.createElement("div");
            card.className = "robot-card";
            if (isSelected) {
                card.style.borderColor = "var(--fanuc-yellow)";
                card.style.boxShadow = "var(--shadow-yellow)";
            }
            card.onclick = (e) => {
                if (e.target.closest("button")) return;
                onGlobalRobotChange(r.id);
            };

            card.innerHTML = `
                <div class="robot-card-header">
                    <div class="robot-card-title">
                        <i class="fa-solid fa-robot" style="color: ${isSelected ? "var(--fanuc-yellow)" : "var(--text-secondary)"};"></i>
                        <div>
                            <h3>${escapeHtml(r.name || r.id)}</h3>
                            <span style="font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">${escapeHtml(r.ip)}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="val-pill ${isConn ? "badge-resolved" : "badge-active"}">
                            ${isConn ? "● Connected" : "○ Disconnected"}
                        </span>
                    </div>
                </div>

                <div class="robot-card-body">
                    <div class="robot-data-row">
                        <span class="robot-data-label">Program:</span>
                        <span class="robot-data-value">${escapeHtml(r.program || "--")}</span>
                    </div>

                    <div class="robot-data-row">
                        <span class="robot-data-label">Speed / Override:</span>
                        <span class="robot-data-value">${escapeHtml(String(r.speed !== undefined && r.speed !== null ? r.speed : "--"))}</span>
                    </div>

                    <div class="robot-data-row">
                        <span class="robot-data-label">Mode (ModeState):</span>
                        <span class="robot-data-value">${escapeHtml(r.mode || "--")}</span>
                    </div>

                    <div class="robot-data-row">
                        <span class="robot-data-label">Active Alarms:</span>
                        ${alarmsCount > 0 
                            ? `<span class="val-pill badge-active">🔴 ${alarmsCount} Active</span>` 
                            : `<span class="val-pill badge-resolved">0 Active</span>`}
                    </div>
                </div>

                <div class="robot-card-actions">
                    <button class="btn-sm ${isSelected ? "btn-warn" : ""}" onclick="selectAndOpenRobot('${r.id}', 'programs')">
                        <i class="fa-solid fa-code"></i> Monitor
                    </button>
                    <button class="btn-sm ${isConn ? "btn-danger" : "btn-primary"}" onclick="toggleRobotConnectionById('${r.id}')">
                        <i class="fa-solid ${isConn ? "fa-plug-circle-xmark" : "fa-plug"}"></i> ${isConn ? "Disconnect" : "Connect"}
                    </button>
                    <button class="btn-sm btn-info" onclick="triggerRobotBackupById('${r.id}')" title="Backup Controller via FTP">
                        <i class="fa-solid fa-download"></i> Backup
                    </button>
                </div>
            `;

            container.appendChild(card);
        });

    } catch (err) {
        console.error("Error loading multi-robot summary:", err);
    }
}

function selectAndOpenRobot(robotId, targetPage = "programs") {
    onGlobalRobotChange(robotId);
    showPage(targetPage);
}

async function toggleRobotConnectionById(robotId) {
    const isConn = connectedRobots.has(robotId);
    const robot = configuredRobots.find(r => r.id === robotId);
    if (!robot) return;

    if (isConn) {
        try {
            const res = await fetch("/api/disconnect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ robotId })
            });
            const data = await res.json();
            if (data.success) {
                connectedRobots.delete(robotId);
                addLog(`Disconnected from ${robot.name || robotId}`);
            }
        } catch (err) {
            alert(`Disconnect error for ${robotId}: ` + err.message);
        }
    } else {
        try {
            const res = await fetch("/api/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    robotId: robot.id,
                    ip: robot.ip,
                    port: robot.port,
                    endpoint: robot.endpoint
                })
            });
            const data = await res.json();
            if (data.success) {
                connectedRobots.add(robotId);
                addLog(`Connected successfully to ${robot.name || robotId} (${robot.ip})`);
            } else {
                alert(data.message || `Could not connect to ${robot.name || robotId}`);
            }
        } catch (err) {
            alert(`Connection error for ${robotId}: ` + err.message);
        }
    }

    if (robotId === activeRobotId) {
        connected = connectedRobots.has(activeRobotId);
        updateTopbarConnectionStatus();
    }
    setupGlobalRobotSelector();
    await loadAllRobotsSummary();
}

//==================================================
// ROBOT MANAGER CRUD TABLE & MODAL
//==================================================

async function loadRobotManagerTable() {
    await fetchRobots();
    await checkConnectedRobots();
    
    const tbody = document.getElementById("robotManagerTableBody");
    if (!tbody) return;

    if (configuredRobots.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No robots configured. Click "Add New Robot" above.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    configuredRobots.forEach(r => {
        const isConn = connectedRobots.has(r.id);
        const row = document.createElement("tr");

        row.innerHTML = `
            <td><b>${escapeHtml(r.id)}</b></td>
            <td>${escapeHtml(r.name || r.id)}</td>
            <td><code>${escapeHtml(r.ip)}</code></td>
            <td>${r.port || 4880}</td>
            <td>${r.ftpPort || 21}</td>
            <td>
                <span class="badge-${isConn ? "on" : "off"}" style="font-size: 11px;">
                    ${isConn ? "ONLINE" : "OFFLINE"}
                </span>
            </td>
            <td>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-sm ${isConn ? "btn-danger" : "btn-primary"}" onclick="toggleRobotConnectionById('${r.id}')">
                        <i class="fa-solid ${isConn ? "fa-plug-circle-xmark" : "fa-plug"}"></i> ${isConn ? "Disconnect" : "Connect"}
                    </button>
                    <button class="btn-sm" onclick="showEditRobotModal('${r.id}')">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    <button class="btn-sm btn-danger" onclick="deleteRobotProfile('${r.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(row);
    });
}

function showAddRobotModal() {
    const modal = document.getElementById("robotModal");
    const title = document.getElementById("modalTitle");
    const form = document.getElementById("robotForm");

    if (!modal) return;
    title.innerHTML = `<i class="fa-solid fa-robot" style="color: var(--fanuc-yellow);"></i> Add FANUC Robot`;
    form.reset();
    document.getElementById("formRobotId").disabled = false;
    document.getElementById("formRobotId").value = `Robot_${configuredRobots.length + 1}`;
    document.getElementById("formPort").value = 4880;
    document.getElementById("formEndpoint").value = "/FANUC/NanoUaServer";
    document.getElementById("formFtpPort").value = 21;
    document.getElementById("formFtpUser").value = "anonymous";

    modal.style.display = "flex";
}

function showEditRobotModal(robotId) {
    const robot = configuredRobots.find(r => r.id === robotId);
    if (!robot) return;

    const modal = document.getElementById("robotModal");
    const title = document.getElementById("modalTitle");

    title.innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: var(--fanuc-yellow);"></i> Edit Robot: ${escapeHtml(robot.id)}`;
    
    document.getElementById("formRobotId").value = robot.id;
    document.getElementById("formRobotId").disabled = true;
    document.getElementById("formRobotName").value = robot.name || "";
    document.getElementById("formIp").value = robot.ip || "";
    document.getElementById("formPort").value = robot.port || 4880;
    document.getElementById("formEndpoint").value = robot.endpoint || "/FANUC/NanoUaServer";
    document.getElementById("formFtpIp").value = robot.ftpIp || "";
    document.getElementById("formFtpPort").value = robot.ftpPort || 21;
    document.getElementById("formFtpUser").value = robot.ftpUser || "anonymous";
    document.getElementById("formFtpPassword").value = "";

    modal.style.display = "flex";
}

function closeRobotModal() {
    const modal = document.getElementById("robotModal");
    if (modal) modal.style.display = "none";
}

async function handleRobotFormSubmit(event) {
    event.preventDefault();
    const idInput = document.getElementById("formRobotId");
    const isEdit = idInput.disabled;
    const robotId = idInput.value.trim();

    const payload = {
        id: robotId,
        name: document.getElementById("formRobotName").value.trim(),
        ip: document.getElementById("formIp").value.trim(),
        port: parseInt(document.getElementById("formPort").value, 10) || 4880,
        endpoint: document.getElementById("formEndpoint").value.trim(),
        ftpIp: document.getElementById("formFtpIp").value.trim() || document.getElementById("formIp").value.trim(),
        ftpPort: parseInt(document.getElementById("formFtpPort").value, 10) || 21,
        ftpUser: document.getElementById("formFtpUser").value.trim(),
        ftpPassword: document.getElementById("formFtpPassword").value
    };

    try {
        let res;
        if (isEdit) {
            res = await fetch(`/api/robots/${robotId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch("/api/robots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }

        const data = await res.json();
        if (data.success) {
            closeRobotModal();
            await fetchRobots();
            setupGlobalRobotSelector();
            await loadRobotManagerTable();
            await loadAllRobotsSummary();
        } else {
            alert(data.message || "Failed to save robot configuration.");
        }
    } catch (err) {
        alert("Error saving robot: " + err.message);
    }
}

async function deleteRobotProfile(robotId) {
    if (!confirm(`Are you sure you want to delete profile "${robotId}"?`)) return;

    try {
        const res = await fetch(`/api/robots/${robotId}`, { method: "DELETE" });
        const data = await res.json();
        if (data.success) {
            connectedRobots.delete(robotId);
            await fetchRobots();
            setupGlobalRobotSelector();
            await loadRobotManagerTable();
            await loadAllRobotsSummary();
        } else {
            alert(data.message || "Failed to delete robot.");
        }
    } catch (err) {
        alert("Error deleting robot: " + err.message);
    }
}

//==================================================
// BACKUP MANAGER (FTP CONTROLLER BACKUP)
//==================================================

async function loadBackupsList() {
    updateActiveRobotDisplay();
    try {
        // 1. Load Stored Local ZIP Files
        const res = await fetch("/api/backup/list");
        if (res.ok) {
            const data = await res.json();
            const backups = data.backups || [];
            const tbody = document.getElementById("backupListTableBody");
            if (tbody) {
                if (backups.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No local backup archives created yet.</td></tr>`;
                } else {
                    tbody.innerHTML = "";
                    backups.forEach(b => {
                        const dateStr = b.createdAt ? new Date(b.createdAt).toLocaleString() : "--";
                        const row = document.createElement("tr");

                        row.innerHTML = `
                            <td><span class="val-pill" style="font-size: 11px;">${escapeHtml(b.robotId)}</span></td>
                            <td><b>${escapeHtml(b.filename)}</b></td>
                            <td>${b.sizeMB} MB</td>
                            <td>${dateStr}</td>
                            <td>
                                <div style="display: flex; gap: 6px;">
                                    <button class="btn-sm btn-primary" onclick="downloadBackupFile('${escapeHtml(b.filename)}')" title="Download ZIP Archive to Local PC">
                                        <i class="fa-solid fa-download"></i> Download ZIP
                                    </button>
                                    <button class="btn-sm btn-danger" onclick="deleteBackupArchive('${escapeHtml(b.filename)}')">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        `;
                        tbody.appendChild(row);
                    });
                }
            }
        }

        // 2. Load Persistent SQLite Execution History
        const histRes = await fetch("/api/backup/history");
        if (histRes.ok) {
            const histData = await histRes.json();
            const history = histData.history || [];
            const histTbody = document.getElementById("backupHistoryTableBody");
            if (histTbody) {
                if (history.length === 0) {
                    histTbody.innerHTML = `<tr><td colspan="9" class="empty-state">No backup executions recorded in SQLite yet.</td></tr>`;
                } else {
                    histTbody.innerHTML = "";
                    history.forEach(h => {
                        const isSuccess = h.status === "SUCCESS";
                        const filesFound = h.files_found !== undefined ? h.files_found : (h.file_count || 0);
                        const filesDownloaded = h.files_downloaded !== undefined ? h.files_downloaded : (h.file_count || 0);
                        const filesFailed = h.files_failed !== undefined ? h.files_failed : 0;
                        const row = document.createElement("tr");
                        row.innerHTML = `
                            <td>${h.timestamp ? new Date(h.timestamp).toLocaleString() : "--"}</td>
                            <td>
                                <b>${escapeHtml(h.robot_id)}</b>
                                ${h.robot_ip ? `<br><small style="color:var(--text-muted);">${escapeHtml(h.robot_ip)}</small>` : ''}
                            </td>
                            <td>${escapeHtml(h.backup_type || "Application Backup")}</td>
                            <td style="font-weight: 600;">${filesFound}</td>
                            <td style="font-weight: 700; color: var(--status-success);">${filesDownloaded}</td>
                            <td style="font-weight: 600; color: ${filesFailed > 0 ? 'var(--fanuc-red)' : 'var(--text-muted)'};">${filesFailed}</td>
                            <td>${h.size_mb || "0.00"} MB</td>
                            <td>
                                <span class="val-pill ${isSuccess ? "badge-resolved" : "badge-active"}" style="font-size: 10px; padding: 2px 6px;">
                                    ${isSuccess ? "VERIFIED SUCCESS" : "FAILED"}
                                </span>
                            </td>
                            <td>
                                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                                    <code style="font-size: 11px; color: ${isSuccess ? 'var(--text-primary)' : 'var(--fanuc-red)'}; word-break: break-all;">
                                        ${escapeHtml(h.filename || h.error_message || "--")}
                                    </code>
                                    ${isSuccess ? `<button class="btn-sm btn-primary" style="padding: 3px 8px; font-size: 11px;" onclick="downloadBackupFile('${escapeHtml(h.filename)}')"><i class="fa-solid fa-download"></i></button>` : ''}
                                </div>
                            </td>
                        `;
                        histTbody.appendChild(row);
                    });
                }
            }
        }

    } catch (err) {
        console.error("Error loading backups list:", err);
    }
}

function downloadBackupFile(filename) {
    if (!filename) return;
    const downloadUrl = `/api/backup/download/${encodeURIComponent(filename)}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    addLog(`Initiated download of backup ZIP: ${filename}`);
}

function appendBackupConsoleLog(msg) {
    const card = document.getElementById("backupConsoleCard");
    const area = document.getElementById("backupConsoleLog");
    if (card) card.style.display = "block";
    if (area) {
        area.value += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
        area.scrollTop = area.scrollHeight;
    }
}

async function runFtpConnectionTest() {
    const select = document.getElementById("backupTargetRobotSelect");
    const targetRobotId = (select && select.value && select.value !== "active") ? select.value : activeRobotId;

    if (!targetRobotId) {
        alert("No robot selected for FTP diagnostic test.");
        return;
    }

    const card = document.getElementById("ftpTestResultsCard");
    const badge = document.getElementById("ftpTestStatusBadge");
    const stagesList = document.getElementById("ftpTestStagesList");
    const summaryMsg = document.getElementById("ftpTestSummaryMessage");
    const robotTitle = document.getElementById("ftpTestRobotTitle");

    if (card) card.style.display = "block";
    if (robotTitle) robotTitle.innerText = targetRobotId;
    if (badge) {
        badge.innerText = "Running Diagnostics...";
        badge.className = "val-pill";
        badge.style.color = "var(--fanuc-yellow)";
        badge.style.background = "var(--status-warning-bg)";
    }
    if (stagesList) {
        stagesList.innerHTML = `<div style="grid-column: 1 / -1; padding: 12px; text-align: center; color: var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Contacting controller FTP server at Port 21...</div>`;
    }
    if (summaryMsg) summaryMsg.innerText = "";

    try {
        const res = await fetch(`/api/backup/test-ftp/${targetRobotId}`);
        const data = await res.json();

        if (badge) {
            if (data.success) {
                badge.innerText = "FTP READY";
                badge.className = "val-pill badge-resolved";
            } else {
                badge.innerText = "DIAGNOSTIC FAILED";
                badge.className = "val-pill badge-active";
            }
        }

        if (stagesList && Array.isArray(data.stages)) {
            stagesList.innerHTML = data.stages.map(st => {
                const isPass = st.status === "SUCCESS";
                const isWarn = st.status === "WARNING";
                const icon = isPass 
                    ? '<i class="fa-solid fa-circle-check" style="color: var(--status-success);"></i>'
                    : isWarn 
                        ? '<i class="fa-solid fa-triangle-exclamation" style="color: var(--fanuc-yellow);"></i>'
                        : '<i class="fa-solid fa-circle-xmark" style="color: var(--fanuc-red);"></i>';
                const statusColor = isPass ? "var(--status-success)" : isWarn ? "var(--fanuc-yellow)" : "var(--fanuc-red)";
                
                return `
                    <div style="background: var(--bg-card-alt); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary);">${st.label}</span>
                            ${icon}
                        </div>
                        <div style="font-size: 12px; font-weight: 600; color: ${statusColor};">${st.detail}</div>
                    </div>
                `;
            }).join("");
        }

        if (summaryMsg) {
            summaryMsg.innerHTML = `<b>Summary:</b> ${data.message}`;
            summaryMsg.style.color = data.success ? "var(--status-success)" : "var(--fanuc-red)";
        }

    } catch (err) {
        if (badge) {
            badge.innerText = "ERROR";
            badge.className = "val-pill badge-active";
        }
        if (summaryMsg) {
            summaryMsg.innerText = "Diagnostic request failed: " + err.message;
            summaryMsg.style.color = "var(--fanuc-red)";
        }
    }
}

async function triggerSelectedRobotBackup() {
    const select = document.getElementById("backupTargetRobotSelect");
    const targetRobotId = (select && select.value) ? select.value : activeRobotId;
    await executeRobotBackup(targetRobotId);
}

async function triggerActiveRobotBackup() {
    await executeRobotBackup(activeRobotId);
}

async function triggerRobotBackupById(robotId) {
    await executeRobotBackup(robotId);
}

async function executeRobotBackup(targetRobotId) {
    if (!targetRobotId) {
        alert("No robot selected for backup.");
        return;
    }

    const consoleCard = document.getElementById("backupConsoleCard");
    if (consoleCard) consoleCard.style.display = "block";

    const badge = document.getElementById("backupProgressBadge");
    if (badge) {
        badge.innerText = `Backing up ${targetRobotId}...`;
        badge.className = "val-pill badge-active";
    }

    // Reset diagnostic dashboard KPIs
    setValue("diagFtpConnected", '<span style="color:var(--fanuc-yellow);">Connecting...</span>');
    setValue("diagAuthStatus", '<span style="color:var(--text-muted);">Pending</span>');
    setValue("diagMdbStatus", '<span style="color:var(--text-muted);">Pending</span>');
    setValue("diagFilesFound", "0");
    setValue("diagFilesDownloaded", "0");
    setValue("diagFilesFailed", "0");
    setValue("diagTotalSize", "0.00 MB");
    setValue("diagZipVerified", '<span style="color:var(--text-muted);">Pending</span>');
    setValue("diagFileListCount", "0");
    const fileListContainer = document.getElementById("diagDownloadedFilesList");
    if (fileListContainer) fileListContainer.innerHTML = `<span style="color:var(--text-muted); font-style:italic;">Downloading files...</span>`;

    const consoleArea = document.getElementById("backupConsoleLog");
    if (consoleArea) consoleArea.value = "";
    appendBackupConsoleLog(`[START] Initiating FANUC Application Backup for ${targetRobotId} (FTP Port 21 -> MDB:*.*)...`);

    try {
        appendBackupConsoleLog(`[FTP] Connecting to controller socket and authenticating...`);
        const res = await fetch(`/api/backup/${targetRobotId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        const data = await res.json();
        
        if (data.success) {
            appendBackupConsoleLog(`[DOWNLOAD] Successfully downloaded ${data.filesDownloaded} files from MDB: (${data.sizeMB} MB)`);
            appendBackupConsoleLog(`[ZIP] Created archive ${data.filename}`);
            appendBackupConsoleLog(`[VERIFY] Verified ${data.zipEntriesCount || data.filesDownloaded} entries inside ZIP archive [PASS]`);
            appendBackupConsoleLog(`[COMPLETE] Backup marked VERIFIED SUCCESS in SQLite.`);

            // Update Diagnostic Dashboard KPIs
            setValue("diagFtpConnected", '<span class="val-pill badge-resolved" style="font-size:11px;">Connected</span>');
            setValue("diagAuthStatus", '<span class="val-pill badge-resolved" style="font-size:11px;">Verified</span>');
            setValue("diagMdbStatus", '<span class="val-pill badge-resolved" style="font-size:11px;">Accessed</span>');
            setValue("diagFilesFound", String(data.filesFound || data.filesDownloaded));
            setValue("diagFilesDownloaded", String(data.filesDownloaded));
            setValue("diagFilesFailed", String(data.filesFailed || 0));
            setValue("diagTotalSize", `${data.sizeMB} MB`);
            setValue("diagZipVerified", `<span class="val-pill badge-resolved" style="font-size:11px;"><i class="fa-solid fa-check"></i> ${data.zipEntriesCount || data.filesDownloaded} files</span>`);
            setValue("diagFileListCount", String(data.filesDownloaded));

            // Populate File Inventory List
            if (fileListContainer && data.details?.downloadedFiles) {
                fileListContainer.innerHTML = "";
                data.details.downloadedFiles.forEach(f => {
                    const item = document.createElement("div");
                    item.style.cssText = "padding: 3px 6px; background: var(--bg-card); border-radius: 4px; border: 1px solid var(--border-subtle); display: flex; justify-content: space-between;";
                    item.innerHTML = `<span><i class="fa-solid fa-file" style="color:var(--fanuc-yellow);"></i> ${escapeHtml(f.name)}</span><span style="color:var(--text-muted); font-size:10px;">${f.size} B</span>`;
                    fileListContainer.appendChild(item);
                });
            }

            if (badge) {
                badge.innerText = `Backup Verified (${data.filesDownloaded} files, ${data.sizeMB} MB)`;
                badge.className = "val-pill badge-resolved";
            }
            await loadBackupsList();
            
            // Automatically trigger local ZIP download to user's PC
            downloadBackupFile(data.filename);

            alert(`FANUC Controller Backup VERIFIED & COMPLETED!\n\nArchive: ${data.filename}\nDownloaded Files: ${data.filesDownloaded} files\nZIP Verification: PASS (${data.zipEntriesCount || data.filesDownloaded} verified entries)\nArchive Size: ${data.sizeMB} MB\n\nYour browser download has started automatically.`);
        } else {
            appendBackupConsoleLog(`[FAILED] ${data.message || "FTP backup failed or returned 0 files."}`);
            setValue("diagFtpConnected", '<span class="val-pill badge-active" style="font-size:11px;">Failed</span>');
            setValue("diagZipVerified", '<span class="val-pill badge-active" style="font-size:11px;">Unverified / 0 files</span>');
            if (badge) {
                badge.innerText = `Backup Failed`;
                badge.className = "val-pill badge-active";
            }
            await loadBackupsList();
            alert(`FANUC FTP Backup Failed:\n\n${data.message || "FTP backup failed or returned 0 files."}`);
        }
    } catch (err) {
        appendBackupConsoleLog(`[ERROR] ${err.message}`);
        setValue("diagFtpConnected", '<span class="val-pill badge-active" style="font-size:11px;">Error</span>');
        setValue("diagZipVerified", '<span class="val-pill badge-active" style="font-size:11px;">Failed</span>');
        if (badge) {
            badge.innerText = `Backup Failed`;
            badge.className = "val-pill badge-active";
        }
        await loadBackupsList();
        alert("FANUC FTP Backup Error:\n\n" + err.message);
    }
}

async function triggerBackupAllRobots() {
    if (!confirm(`Are you sure you want to backup all ${configuredRobots.length} configured robots?`)) return;

    try {
        addLog("Starting batch backup for all configured robots...");
        const res = await fetch("/api/backup/all", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        const data = await res.json();
        if (data.success) {
            await loadBackupsList();
            alert(`Batch backup finished for ${data.count} robots.\nYou can download any of the generated ZIP archives from the table below.`);
        } else {
            alert(data.message || "Batch backup failed.");
        }
    } catch (err) {
        alert("Batch backup error: " + err.message);
    }
}

async function deleteBackupArchive(filename) {
    if (!confirm(`Are you sure you want to delete backup file "${filename}"?`)) return;

    try {
        const res = await fetch(`/api/backup/${encodeURIComponent(filename)}`, { method: "DELETE" });
        const data = await res.json();
        if (data.success) {
            addLog(`Deleted backup archive: ${filename}`);
            await loadBackupsList();
        } else {
            alert(data.message || "Failed to delete backup.");
        }
    } catch (err) {
        alert("Delete backup error: " + err.message);
    }
}

//==================================================
// ACTIVE ROBOT STATUS & PROGRAM TELEMETRY
//==================================================

async function loadStatus() {
    if (!connected || !activeRobotId) return;

    try {
        const res = await fetch(`/api/status/${activeRobotId}`);
        if (!res.ok) return;

        const data = await res.json();
        setValue("model", data.model || "--");
        setValue("program", data.program || "--");
        setValue("speed", data.speed !== undefined && data.speed !== null ? data.speed : "--");
        setValue("mode", data.mode || "--");

        // Technical details page
        setValue("mModel", data.model || "--");
        setValue("mProgram", data.program || "--");
        setValue("mMode", data.mode || "--");
    } catch {}
}

async function loadPrograms() {
    if (!connected || !activeRobotId) return;

    try {
        const res = await fetch(`/api/programs/${activeRobotId}`);
        if (!res.ok) return;

        const data = await res.json();
        const p = data.program || {};

        setValue("progName", p.currentProgram || "--");
        setValue("progSpeed", p.speed !== undefined && p.speed !== null ? p.speed : "--");
        setValue("progMode", p.mode || "--");
        setValue("progStatus", p.programStatus || "--");

        setValue("pmProg", p.currentProgram || "--");
        setValue("pmSpeed", p.speed !== undefined && p.speed !== null ? p.speed : "--");
        setValue("pmMode", p.mode || "--");
        setValue("pmStatus", p.programStatus || "--");
    } catch {}
}

//==================================================
// DYNAMIC I/O & REGISTER MANAGEMENT (1-BASED INDEXING)
//==================================================

function parseRangeInput(str) {
    if (!str || typeof str !== "string") return [];
    const points = new Set();
    const parts = str.split(",");

    for (let part of parts) {
        part = part.trim();
        if (part.includes("-")) {
            const [s, e] = part.split("-").map(n => parseInt(n.trim(), 10));
            if (!isNaN(s) && !isNaN(e)) {
                const start = Math.max(1, Math.min(s, e));
                const end = Math.max(1, Math.max(s, e));
                for (let i = start; i <= end; i++) {
                    if (i <= 16384) points.add(i);
                }
            }
        } else {
            const n = parseInt(part, 10);
            if (!isNaN(n) && n >= 1 && n <= 16384) points.add(n);
        }
    }
    return Array.from(points).sort((a, b) => a - b);
}

function addDIRange() {
    const input = document.getElementById("diRangeInput");
    const prefixInput = document.getElementById("diNamePrefix");
    const val = input.value.trim();
    if (!val) return;

    const ranges = getActiveRanges();
    const parsed = parseRangeInput(val);
    if (parsed.length === 0) {
        alert("Please enter a valid 1-based range (e.g. 1-100 or 1-20,25,30-40).");
        return;
    }

    const parts = val.split(",");
    for (let p of parts) {
        p = p.trim();
        if (p.includes("-")) {
            const [s, e] = p.split("-").map(Number);
            if (!isNaN(s) && !isNaN(e)) {
                ranges.di.push({ start: Math.max(1, Math.min(s, e)), end: Math.max(1, Math.max(s, e)), namePrefix: prefixInput.value.trim() || "DI" });
            }
        } else {
            const n = Number(p);
            if (!isNaN(n) && n >= 1) {
                ranges.di.push({ start: n, end: n, namePrefix: prefixInput.value.trim() || "DI" });
            }
        }
    }
    saveRanges();
    input.value = "";
    renderRangeTags();
    loadIO();
}

function clearAllDI() {
    const ranges = getActiveRanges();
    ranges.di = [];
    saveRanges();
    renderRangeTags();
    loadIO();
}

function addDORange() {
    const input = document.getElementById("doRangeInput");
    const prefixInput = document.getElementById("doNamePrefix");
    const val = input.value.trim();
    if (!val) return;

    const ranges = getActiveRanges();
    const parsed = parseRangeInput(val);
    if (parsed.length === 0) {
        alert("Please enter a valid 1-based range (e.g. 1-50 or 1-16).");
        return;
    }

    const parts = val.split(",");
    for (let p of parts) {
        p = p.trim();
        if (p.includes("-")) {
            const [s, e] = p.split("-").map(Number);
            if (!isNaN(s) && !isNaN(e)) {
                ranges.do.push({ start: Math.max(1, Math.min(s, e)), end: Math.max(1, Math.max(s, e)), namePrefix: prefixInput.value.trim() || "DO" });
            }
        } else {
            const n = Number(p);
            if (!isNaN(n) && n >= 1) {
                ranges.do.push({ start: n, end: n, namePrefix: prefixInput.value.trim() || "DO" });
            }
        }
    }
    saveRanges();
    input.value = "";
    renderRangeTags();
    loadIO();
}

function clearAllDO() {
    const ranges = getActiveRanges();
    ranges.do = [];
    saveRanges();
    renderRangeTags();
    loadIO();
}

function addIRRange() {
    const input = document.getElementById("irRangeInput");
    const prefixInput = document.getElementById("irNamePrefix");
    const val = input.value.trim();
    if (!val) return;

    const ranges = getActiveRanges();
    const parsed = parseRangeInput(val);
    if (parsed.length === 0) {
        alert("Please enter a valid 1-based range (e.g. 1-100 or 1-50).");
        return;
    }

    const parts = val.split(",");
    for (let p of parts) {
        p = p.trim();
        if (p.includes("-")) {
            const [s, e] = p.split("-").map(Number);
            if (!isNaN(s) && !isNaN(e)) {
                ranges.ir.push({ start: Math.max(1, Math.min(s, e)), end: Math.max(1, Math.max(s, e)), namePrefix: prefixInput.value.trim() || "IR" });
            }
        } else {
            const n = Number(p);
            if (!isNaN(n) && n >= 1) {
                ranges.ir.push({ start: n, end: n, namePrefix: prefixInput.value.trim() || "IR" });
            }
        }
    }
    saveRanges();
    input.value = "";
    renderRangeTags();
    loadIO();
}

function clearAllIR() {
    const ranges = getActiveRanges();
    ranges.ir = [];
    saveRanges();
    renderRangeTags();
    loadIO();
}

function addDRRange() {
    const input = document.getElementById("drRangeInput");
    const prefixInput = document.getElementById("drNamePrefix");
    const val = input.value.trim();
    if (!val) return;

    const ranges = getActiveRanges();
    const parsed = parseRangeInput(val);
    if (parsed.length === 0) {
        alert("Please enter a valid 1-based range (e.g. 1-100 or 1-20,25,30-50).");
        return;
    }

    const parts = val.split(",");
    for (let p of parts) {
        p = p.trim();
        if (p.includes("-")) {
            const [s, e] = p.split("-").map(Number);
            if (!isNaN(s) && !isNaN(e)) {
                ranges.dr.push({ start: Math.max(1, Math.min(s, e)), end: Math.max(1, Math.max(s, e)), namePrefix: prefixInput.value.trim() || "DR" });
            }
        } else {
            const n = Number(p);
            if (!isNaN(n) && n >= 1) {
                ranges.dr.push({ start: n, end: n, namePrefix: prefixInput.value.trim() || "DR" });
            }
        }
    }
    saveRanges();
    input.value = "";
    renderRangeTags();
    loadIO();
}

function clearAllDR() {
    const ranges = getActiveRanges();
    ranges.dr = [];
    saveRanges();
    renderRangeTags();
    loadIO();
}

function removeRangeItem(type, index) {
    const ranges = getActiveRanges();
    if (ranges[type]) {
        ranges[type].splice(index, 1);
        saveRanges();
        renderRangeTags();
        loadIO();
    }
}

function renderRangeTags() {
    const ranges = getActiveRanges();
    
    const diList = document.getElementById("diRangesList");
    if (diList) {
        diList.innerHTML = ranges.di.map((r, i) => `
            <span class="range-tag">
                ${r.namePrefix || "DI"}: ${r.start}${r.start !== r.end ? `-${r.end}` : ""}
                <button onclick="removeRangeItem('di', ${i})" title="Remove">&times;</button>
            </span>
        `).join("");
    }

    const doList = document.getElementById("doRangesList");
    if (doList) {
        doList.innerHTML = ranges.do.map((r, i) => `
            <span class="range-tag">
                ${r.namePrefix || "DO"}: ${r.start}${r.start !== r.end ? `-${r.end}` : ""}
                <button onclick="removeRangeItem('do', ${i})" title="Remove">&times;</button>
            </span>
        `).join("");
    }

    const irList = document.getElementById("irRangesList");
    if (irList) {
        irList.innerHTML = ranges.ir.map((r, i) => `
            <span class="range-tag">
                ${r.namePrefix || "IR"}: ${r.start}${r.start !== r.end ? `-${r.end}` : ""}
                <button onclick="removeRangeItem('ir', ${i})" title="Remove">&times;</button>
            </span>
        `).join("");
    }

    const drList = document.getElementById("drRangesList");
    if (drList) {
        drList.innerHTML = ranges.dr.map((r, i) => `
            <span class="range-tag">
                ${r.namePrefix || "DR"}: ${r.start}${r.start !== r.end ? `-${r.end}` : ""}
                <button onclick="removeRangeItem('dr', ${i})" title="Remove">&times;</button>
            </span>
        `).join("");
    }
}

//==================================================
// LOAD I/O & REGISTERS (NON-DESTRUCTIVE UPDATES)
//==================================================

async function loadIO() {
    if (!connected || !activeRobotId) return;

    try {
        const ranges = getActiveRanges();
        const res = await fetch(`/api/modbus/${activeRobotId}?diCount=1000&doCount=1000&irCount=1000&hrCount=1000`);
        if (!res.ok) return;

        const data = await res.json();
        
        // =====================================
        // RENDER DIGITAL INPUTS (DI - 1-BASED)
        // =====================================
        const diContainer = document.getElementById("diTableContainer");
        if (diContainer) {
            const diPoints = [];
            ranges.di.forEach(r => {
                for (let i = Math.max(1, r.start); i <= r.end; i++) diPoints.push({ index: i, prefix: r.namePrefix || "DI" });
            });
            setValue("diRangeBadge", `Configured Points: ${diPoints.length}`);

            if (diPoints.length === 0) {
                diContainer.innerHTML = `<p class="empty-state">No Digital Inputs configured. Enter a range (e.g. 1-100) above.</p>`;
                diContainer.dataset.signature = "";
            } else {
                const currentSig = diPoints.map(p => p.index).join(",");
                if (diContainer.dataset.signature !== currentSig) {
                    let html = `<table class="custom-table">
                        <thead>
                            <tr>
                                <th style="width:120px;">Register</th>
                                <th>Friendly Name</th>
                                <th style="width:140px;">State</th>
                                <th style="width:80px;">Action</th>
                            </tr>
                        </thead>
                        <tbody>`;
                    diPoints.forEach(p => {
                        const val = data.digitalInputs?.[p.index - 1] ?? false;
                        html += `
                            <tr id="diRow_${p.index}">
                                <td><b>DI[${p.index}]</b></td>
                                <td>${escapeHtml(p.prefix)}[${p.index}]</td>
                                <td><span id="diVal_${p.index}" class="badge-${val ? "on" : "off"}">${val ? "ON" : "OFF"}</span></td>
                                <td>
                                    <button class="btn-sm btn-danger" onclick="removeSingleIOPoint('di', ${p.index})" title="Remove Point">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                    });
                    html += `</tbody></table>`;
                    diContainer.innerHTML = html;
                    diContainer.dataset.signature = currentSig;
                } else {
                    diPoints.forEach(p => {
                        const val = data.digitalInputs?.[p.index - 1] ?? false;
                        const el = document.getElementById(`diVal_${p.index}`);
                        if (el) {
                            el.className = `badge-${val ? "on" : "off"}`;
                            el.innerText = val ? "ON" : "OFF";
                        }
                    });
                }
            }
        }

        // =====================================
        // RENDER DIGITAL OUTPUTS (DO - 1-BASED)
        // =====================================
        const doContainer = document.getElementById("doTableContainer");
        if (doContainer) {
            const doPoints = [];
            ranges.do.forEach(r => {
                for (let i = Math.max(1, r.start); i <= r.end; i++) doPoints.push({ index: i, prefix: r.namePrefix || "DO" });
            });
            setValue("doRangeBadge", `Configured Points: ${doPoints.length}`);

            if (doPoints.length === 0) {
                doContainer.innerHTML = `<p class="empty-state">No Digital Outputs configured. Enter a range (e.g. 1-50) above.</p>`;
                doContainer.dataset.signature = "";
            } else {
                const currentSig = doPoints.map(p => p.index).join(",");
                if (doContainer.dataset.signature !== currentSig) {
                    let html = `<table class="custom-table">
                        <thead>
                            <tr>
                                <th style="width:120px;">Register</th>
                                <th>Friendly Name</th>
                                <th style="width:140px;">State</th>
                                <th style="width:130px;">Control</th>
                                <th style="width:80px;">Action</th>
                            </tr>
                        </thead>
                        <tbody>`;
                    doPoints.forEach(p => {
                        const val = data.digitalOutputs?.[p.index - 1] ?? false;
                        html += `
                            <tr id="doRow_${p.index}">
                                <td><b>DO[${p.index}]</b></td>
                                <td>${escapeHtml(p.prefix)}[${p.index}]</td>
                                <td><span id="doVal_${p.index}" class="badge-${val ? "on" : "off"}">${val ? "ON" : "OFF"}</span></td>
                                <td>
                                    <button id="doBtn_${p.index}" class="btn-sm ${val ? "btn-danger" : "btn-primary"}" onclick="toggleDigitalOutput(${p.index}, ${!val})">
                                        Turn ${val ? "OFF" : "ON"}
                                    </button>
                                </td>
                                <td>
                                    <button class="btn-sm btn-danger" onclick="removeSingleIOPoint('do', ${p.index})" title="Remove Point">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                    });
                    html += `</tbody></table>`;
                    doContainer.innerHTML = html;
                    doContainer.dataset.signature = currentSig;
                } else {
                    doPoints.forEach(p => {
                        const val = data.digitalOutputs?.[p.index - 1] ?? false;
                        const el = document.getElementById(`doVal_${p.index}`);
                        const btn = document.getElementById(`doBtn_${p.index}`);
                        if (el) {
                            el.className = `badge-${val ? "on" : "off"}`;
                            el.innerText = val ? "ON" : "OFF";
                        }
                        if (btn) {
                            btn.className = `btn-sm ${val ? "btn-danger" : "btn-primary"}`;
                            btn.innerText = `Turn ${val ? "OFF" : "ON"}`;
                            btn.onclick = () => toggleDigitalOutput(p.index, !val);
                        }
                    });
                }
            }
        }

        // =====================================
        // RENDER INPUT REGISTERS (IR - 1-BASED)
        // =====================================
        const irContainer = document.getElementById("irTableContainer");
        if (irContainer) {
            const irPoints = [];
            ranges.ir.forEach(r => {
                for (let i = Math.max(1, r.start); i <= r.end; i++) irPoints.push({ index: i, prefix: r.namePrefix || "IR" });
            });
            setValue("irRangeBadge", `Configured Registers: ${irPoints.length}`);

            if (irPoints.length === 0) {
                irContainer.innerHTML = `<p class="empty-state">No Input Registers configured. Enter a range (e.g. 1-100) above.</p>`;
                irContainer.dataset.signature = "";
            } else {
                const currentSig = irPoints.map(p => p.index).join(",");
                if (irContainer.dataset.signature !== currentSig) {
                    let html = `<table class="custom-table">
                        <thead>
                            <tr>
                                <th style="width:120px;">Register</th>
                                <th>Friendly Name</th>
                                <th style="width:180px;">Current Value</th>
                                <th style="width:80px;">Action</th>
                            </tr>
                        </thead>
                        <tbody>`;
                    irPoints.forEach(p => {
                        const val = data.inputRegisters?.[p.index - 1] ?? 0;
                        html += `
                            <tr id="irRow_${p.index}">
                                <td><b>IR[${p.index}]</b></td>
                                <td>${escapeHtml(p.prefix)}[${p.index}]</td>
                                <td><code id="irVal_${p.index}">${val}</code></td>
                                <td>
                                    <button class="btn-sm btn-danger" onclick="removeSingleIOPoint('ir', ${p.index})" title="Remove Register">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                    });
                    html += `</tbody></table>`;
                    irContainer.innerHTML = html;
                    irContainer.dataset.signature = currentSig;
                } else {
                    irPoints.forEach(p => {
                        const val = data.inputRegisters?.[p.index - 1] ?? 0;
                        const el = document.getElementById(`irVal_${p.index}`);
                        if (el) el.innerText = val;
                    });
                }
            }
        }

        // =====================================
        // RENDER DATA REGISTERS (DR - 1-BASED)
        // =====================================
        const drContainer = document.getElementById("drTableContainer");
        if (drContainer) {
            const drPoints = [];
            ranges.dr.forEach(r => {
                for (let i = Math.max(1, r.start); i <= r.end; i++) drPoints.push({ index: i, prefix: r.namePrefix || "DR" });
            });
            setValue("drRangeBadge", `Configured Registers: ${drPoints.length}`);

            if (drPoints.length === 0) {
                drContainer.innerHTML = `<p class="empty-state">No Data Registers configured for monitoring. Enter a range (e.g. 1-100) above.</p>`;
                drContainer.dataset.signature = "";
            } else {
                const currentSig = drPoints.map(p => p.index).join(",");
                
                if (drContainer.dataset.signature !== currentSig) {
                    let html = `<table class="custom-table">
                        <thead>
                            <tr>
                                <th style="width:120px;">REGISTER</th>
                                <th>FRIENDLY NAME</th>
                                <th style="width:140px;">CURRENT VALUE</th>
                                <th style="width:240px;">WRITE NEW VALUE</th>
                                <th style="width:80px;">ACTION</th>
                            </tr>
                        </thead>
                        <tbody>`;
                    
                    drPoints.forEach(p => {
                        const val = data.holdingRegisters?.[p.index - 1] ?? 0;

                        html += `
                            <tr id="drRow_${p.index}">
                                <td><b>DR[${p.index}]</b></td>
                                <td>${escapeHtml(p.prefix)}[${p.index}]</td>
                                <td><span id="drVal_${p.index}" class="val-pill" style="font-size: 12px; padding: 3px 8px;">${val}</span></td>
                                <td>
                                    <div style="display: flex; gap: 8px; align-items: center;">
                                        <input 
                                            type="number" 
                                            id="inlineDr_${p.index}" 
                                            class="table-inline-input" 
                                            placeholder="New Val" 
                                            step="any"
                                            onkeydown="if(event.key==='Enter') writeInlineDR(${p.index})">
                                        <button id="inlineDrBtn_${p.index}" class="btn-sm btn-primary" onclick="writeInlineDR(${p.index})">
                                            Write
                                        </button>
                                    </div>
                                </td>
                                <td>
                                    <button class="btn-sm btn-danger" onclick="removeSingleIOPoint('dr', ${p.index})" title="Remove Register">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                    });
                    
                    html += `</tbody></table>`;
                    drContainer.innerHTML = html;
                    drContainer.dataset.signature = currentSig;
                } else {
                    drPoints.forEach(p => {
                        const val = data.holdingRegisters?.[p.index - 1] ?? 0;
                        const valEl = document.getElementById(`drVal_${p.index}`);
                        if (valEl) {
                            valEl.innerText = val;
                        }
                    });
                }
            }
        }

    } catch (err) {
        console.error("Error loading I/O:", err);
    }
}

function removeSingleIOPoint(type, targetIndex) {
    const ranges = getActiveRanges();
    if (!ranges[type]) return;

    const newRanges = [];
    ranges[type].forEach(r => {
        if (targetIndex < r.start || targetIndex > r.end) {
            newRanges.push(r);
        } else if (r.start === r.end && r.start === targetIndex) {
            // removed
        } else if (targetIndex === r.start) {
            newRanges.push({ start: r.start + 1, end: r.end, namePrefix: r.namePrefix });
        } else if (targetIndex === r.end) {
            newRanges.push({ start: r.start, end: r.end - 1, namePrefix: r.namePrefix });
        } else {
            newRanges.push({ start: r.start, end: targetIndex - 1, namePrefix: r.namePrefix });
            newRanges.push({ start: targetIndex + 1, end: r.end, namePrefix: r.namePrefix });
        }
    });

    ranges[type] = newRanges;
    saveRanges();
    renderRangeTags();
    loadIO();
}

async function toggleDigitalOutput(oneBasedIndex, nextVal) {
    if (!connected || !activeRobotId) return;

    try {
        const res = await fetch("/api/io/write-output", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                robotId: activeRobotId,
                index: oneBasedIndex,
                value: nextVal
            })
        });
        const data = await res.json();
        if (data.success) {
            addLog(`Wrote DO[${oneBasedIndex}] = ${nextVal ? "ON" : "OFF"}`);
            await loadIO();
        } else {
            alert(data.message || "Write failed");
        }
    } catch (err) {
        alert("Write error: " + err.message);
    }
}

async function writeCustomDRDirect() {
    const idxInput = document.getElementById("writeDrIndex");
    const valInput = document.getElementById("writeDrValue");
    const regNum = parseInt(idxInput.value, 10);
    const val = parseFloat(valInput.value);

    if (isNaN(regNum) || regNum < 1 || isNaN(val)) {
        alert("Please enter a valid 1-based Register Number (>=1) and numeric Value.");
        return;
    }

    try {
        const res = await fetch("/api/registers/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                robotId: activeRobotId,
                index: regNum,
                value: val
            })
        });
        const data = await res.json();
        if (data.success) {
            addLog(`Successfully wrote DR[${regNum}] = ${val}`);
            alert(`DR[${regNum}] written to ${val} successfully.`);
            valInput.value = "";
            await loadIO();
        } else {
            alert(data.message || "Failed to write Data Register.");
        }
    } catch (err) {
        alert("Write DR error: " + err.message);
    }
}

async function writeInlineDR(regIndex) {
    const input = document.getElementById(`inlineDr_${regIndex}`);
    const btn = document.getElementById(`inlineDrBtn_${regIndex}`);
    if (!input) return;

    const val = parseFloat(input.value);
    if (isNaN(val)) {
        alert("Please type a numeric value into the box before clicking Write.");
        input.focus();
        return;
    }

    const originalBtnText = btn ? btn.innerHTML : "Write";

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
        }

        const res = await fetch("/api/registers/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                robotId: activeRobotId,
                index: regIndex,
                value: val
            })
        });
        const data = await res.json();
        if (data.success) {
            addLog(`Wrote DR[${regIndex}] = ${val}`);
            const valEl = document.getElementById(`drVal_${regIndex}`);
            if (valEl) {
                valEl.innerText = val;
            }
            if (btn) {
                btn.className = "btn-sm btn-primary";
                btn.innerHTML = `<i class="fa-solid fa-check"></i> OK`;
                setTimeout(() => {
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = "Write";
                    }
                }, 1500);
            }
            input.value = "";
        } else {
            alert(data.message || "Write failed");
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalBtnText;
            }
        }
    } catch (err) {
        alert("Write error: " + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
        }
    }
}

//==================================================
// ALARM MONITOR & SQLITE HISTORY
//==================================================

function filterAlarmsDebounced() {
    if (alarmSearchDebounceTimer) clearTimeout(alarmSearchDebounceTimer);
    alarmSearchDebounceTimer = setTimeout(() => {
        loadAlarms();
    }, 300);
}

async function loadAlarms() {
    try {
        const robotFilter = document.getElementById("alarmRobotFilter");
        const limitSelect = document.getElementById("alarmLimitSelect");
        const statusFilter = document.getElementById("alarmStatusFilter");
        const searchInput = document.getElementById("alarmSearchInput");

        const targetRobot = robotFilter ? robotFilter.value : "all";
        const queryRobotId = targetRobot === "all" ? "all" : targetRobot;
        const limit = limitSelect ? limitSelect.value : "100";
        const status = statusFilter ? statusFilter.value : "all";
        const search = searchInput ? searchInput.value.trim() : "";

        // If target is specific robot, query that robot's active alarms and history
        // If target is "all", query /api/alarms/all to fetch complete fleet history
        const fetchUrl = `/api/alarms/${encodeURIComponent(queryRobotId)}?limit=${encodeURIComponent(limit)}&status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`;
        
        const res = await fetch(fetchUrl);
        if (!res.ok) return;

        const result = await res.json();
        currentAlarmHistoryCache = result.history || [];

        const badge = document.getElementById("alarmStatusBadge");
        const activeContainer = document.getElementById("activeAlarmsContainer");

        // Render Active Alarms for active robot
        const activeAlarms = result.activeAlarms || [];

        if (activeAlarms.length > 0) {
            if (badge) {
                badge.className = "badge-off";
                badge.innerText = `🔴 ${activeAlarms.length} ACTIVE ALARM${activeAlarms.length > 1 ? "S" : ""}`;
            }

            if (activeContainer) {
                let html = `<table class="custom-table">
                    <thead>
                        <tr>
                            <th style="width: 140px;">Alarm Code</th>
                            <th>Description</th>
                            <th style="width: 120px;">Robot</th>
                            <th style="width: 180px;">Detected Time</th>
                            <th style="width: 100px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>`;
                
                activeAlarms.forEach(a => {
                    html += `
                        <tr>
                            <td><span class="val-pill" style="font-size: 11px; background: var(--status-danger-bg); color: var(--fanuc-red); border-color: var(--fanuc-red);">${escapeHtml(a.code || "ALARM")}</span></td>
                            <td><b style="color: var(--text-primary);">${escapeHtml(a.description)}</b></td>
                            <td>${escapeHtml(result.robotName || activeRobotId)}</td>
                            <td>${a.timestamp ? new Date(a.timestamp).toLocaleString() : new Date().toLocaleString()}</td>
                            <td><span class="badge-off" style="font-size: 10px; padding: 2px 6px;">Active</span></td>
                        </tr>
                    `;
                });

                html += `</tbody></table>`;
                activeContainer.innerHTML = html;
            }
        } else {
            if (badge) {
                badge.className = "badge-on";
                badge.innerText = "🟢 NO ACTIVE ALARMS";
            }
            if (activeContainer) {
                activeContainer.innerHTML = `<p class="empty-state">No Active Alarms currently detected on this robot controller.</p>`;
            }
        }

        renderAlarmHistory(currentAlarmHistoryCache);

    } catch (err) {
        console.error("Alarm error:", err);
    }
}

function renderAlarmHistory(history) {
    const container = document.getElementById("alarmHistory");
    if (!container) return;

    const valid = Array.isArray(history) ? history.filter(a => {
        if (!a || !a.description) return false;
        const d = String(a.description).trim().toLowerCase();
        return d !== "" && d !== "null" && d !== "undefined" && d !== "[]";
    }) : [];

    if (valid.length === 0) {
        container.innerHTML = `<tr><td colspan="6" class="empty-state">No alarm records found matching criteria in SQLite database.</td></tr>`;
        return;
    }

    container.innerHTML = valid.map(a => {
        const isAct = a.status === "Active";
        const firstSeenStr = a.first_seen ? new Date(a.first_seen).toLocaleString() : "--";
        const resolvedStr = a.resolved_at ? new Date(a.resolved_at).toLocaleString() : (isAct ? '<span style="color: var(--fanuc-red);">Active</span>' : '--');
        const robotLabel = a.robot_name ? `${a.robot_name} (${a.robot_id})` : a.robot_id;

        return `
            <tr>
                <td>${firstSeenStr}</td>
                <td>${resolvedStr}</td>
                <td><span class="val-pill" style="font-size: 11px;">${escapeHtml(robotLabel)}</span></td>
                <td><code style="color: ${isAct ? "var(--fanuc-red)" : "var(--text-secondary)"}; font-weight: 700;">${escapeHtml(a.alarm_code || "ALARM")}</code></td>
                <td><b>${escapeHtml(String(a.description).replace(/^\["|"\]$/g, '').replace(/^\[|\]$/g, '').trim())}</b></td>
                <td>
                    <span class="badge-${isAct ? "off" : "on"}" style="font-size: 10px; padding: 2px 6px;">
                        ${escapeHtml(a.status || "Active")}
                    </span>
                </td>
            </tr>
        `;
    }).join("");
}

function exportAlarmHistoryCsv() {
    if (!currentAlarmHistoryCache || currentAlarmHistoryCache.length === 0) {
        alert("No alarm history records to export.");
        return;
    }

    const headers = ["ID", "First Seen", "Resolved At", "Robot ID", "Robot Name", "Robot IP", "Alarm Code", "Description", "Status"];
    const rows = currentAlarmHistoryCache.map(a => [
        a.id || "",
        a.first_seen || "",
        a.resolved_at || "",
        a.robot_id || "",
        `"${(a.robot_name || "").replace(/"/g, '""')}"`,
        a.robot_ip || "",
        a.alarm_code || "",
        `"${(a.description || "").replace(/"/g, '""')}"`,
        a.status || ""
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `FANUC_Alarm_History_${activeRobotId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog("Exported alarm history CSV.");
}

async function clearAlarmHistory() {
    const filter = document.getElementById("alarmRobotFilter");
    const target = filter ? filter.value : activeRobotId;
    const promptMsg = target === "all"
        ? "Are you sure you want to permanently delete ALL alarm history for all robots?"
        : `Are you sure you want to permanently delete alarm history for "${target}"?`;

    if (!confirm(promptMsg)) return;

    try {
        const res = await fetch("/api/alarms/clear", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ robotId: target })
        });
        const data = await res.json();
        if (data.success) {
            addLog(`Cleared alarm history for ${target}.`);
            await loadAlarms();
        } else {
            alert(data.message || "Failed to clear alarms.");
        }
    } catch (err) {
        alert("Clear alarms error: " + err.message);
    }
}

//==================================================
// APPLICATION LOGS (VIEWER & EXPORT)
//==================================================

function filterLogsDebounced() {
    if (logSearchDebounceTimer) clearTimeout(logSearchDebounceTimer);
    logSearchDebounceTimer = setTimeout(() => {
        loadAppLogs();
    }, 300);
}

async function loadAppLogs() {
    try {
        const robotFilter = document.getElementById("logRobotFilter");
        const levelFilter = document.getElementById("logLevelFilter");
        const searchInput = document.getElementById("logSearchInput");

        const robotId = robotFilter ? robotFilter.value : "all";
        const level = levelFilter ? levelFilter.value : "all";
        const search = searchInput ? searchInput.value.trim() : "";

        const res = await fetch(`/api/logs?robotId=${encodeURIComponent(robotId)}&level=${encodeURIComponent(level)}&search=${encodeURIComponent(search)}&limit=500`);
        if (!res.ok) return;

        const data = await res.json();
        const logs = data.logs || [];
        currentAppLogsCache = logs;

        const tbody = document.getElementById("appLogsTableBody");
        if (!tbody) return;

        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No application log records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.map(l => {
            let levelBadgeClass = "badge-pill";
            if (l.level === "ERROR") levelBadgeClass = "badge-off";
            else if (l.level === "WARN") levelBadgeClass = "badge-mode t1";
            else if (l.level === "INFO") levelBadgeClass = "badge-on";

            return `
                <tr>
                    <td style="font-size: 11px;">${l.timestamp ? new Date(l.timestamp).toLocaleString() : "--"}</td>
                    <td><span class="val-pill" style="font-size: 10px;">${escapeHtml(l.robot_id || "System")}</span></td>
                    <td><span class="${levelBadgeClass}" style="font-size: 10px; padding: 2px 6px;">${escapeHtml(l.level)}</span></td>
                    <td><code>${escapeHtml(l.module || "System")}</code></td>
                    <td style="font-family: 'JetBrains Mono', monospace; font-size: 11px;">${escapeHtml(l.message)}</td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        console.error("Error loading application logs:", err);
    }
}

function exportLogsCsv() {
    if (!currentAppLogsCache || currentAppLogsCache.length === 0) {
        alert("No log records to export.");
        return;
    }

    const headers = ["ID", "Timestamp", "Robot ID", "Level", "Module", "Message"];
    const rows = currentAppLogsCache.map(l => [
        l.id || "",
        l.timestamp || "",
        l.robot_id || "",
        l.level || "",
        `"${(l.module || "").replace(/"/g, '""')}"`,
        `"${(l.message || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `FANUC_Application_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog("Exported application logs CSV.");
}

async function clearAppLogs() {
    if (!confirm("Are you sure you want to permanently clear all application logs?")) return;

    try {
        const res = await fetch("/api/logs/clear", { method: "POST" });
        const data = await res.json();
        if (data.success) {
            addLog("Cleared application logs.");
            await loadAppLogs();
        } else {
            alert(data.message || "Failed to clear logs.");
        }
    } catch (err) {
        alert("Clear logs error: " + err.message);
    }
}

//==================================================
// OPC UA BROWSER & NAMESPACE NAVIGATOR
//==================================================

let browserHistory = ["ObjectsFolder"];
let browserHistoryIndex = 0;
let currentBrowsedNodeId = "ObjectsFolder";
let currentChildrenData = [];
let treeHierarchyData = [];
let selectedNodeDetails = null;

function initBrowserPage() {
    const activeLabel = document.getElementById("browserActiveRobotName");
    if (activeLabel) activeLabel.innerText = activeRobotId;

    const statusBadge = document.getElementById("browserCurrentStatusBadge");
    if (statusBadge) {
        if (connectedRobots.has(activeRobotId)) {
            statusBadge.className = "val-pill badge-resolved";
            statusBadge.innerText = `Connected (${activeRobotId})`;
        } else {
            statusBadge.className = "val-pill badge-active";
            statusBadge.innerText = `Disconnected (${activeRobotId})`;
        }
    }

    if (connectedRobots.has(activeRobotId) && currentChildrenData.length === 0) {
        browseNamespaceRoot();
    }
}

async function browseNamespaceRoot() {
    browserHistory = ["ObjectsFolder"];
    browserHistoryIndex = 0;
    await navigateToNodeId("ObjectsFolder", false);
    await loadNamespaceTree();
}

async function navigateToNodeId(nodeId, pushHistory = true) {
    if (!nodeId) nodeId = "ObjectsFolder";
    currentBrowsedNodeId = nodeId;

    const input = document.getElementById("browserCurrentNodeInput");
    if (input) input.value = nodeId;

    const titleSpan = document.getElementById("navPanelCurrentTitle");
    if (titleSpan) titleSpan.innerText = nodeId;

    if (pushHistory) {
        browserHistory = browserHistory.slice(0, browserHistoryIndex + 1);
        browserHistory.push(nodeId);
        browserHistoryIndex = browserHistory.length - 1;
    }

    updateBrowserNavButtonStates();

    const tbody = document.getElementById("childrenNavTableBody");
    const countBadge = document.getElementById("navPanelCountBadge");

    if (!connectedRobots.has(activeRobotId)) {
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state" style="color: var(--fanuc-yellow); padding: 30px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 24px; margin-bottom: 8px;"></i><br>
                        Robot <b>${escapeHtml(activeRobotId)}</b> is currently disconnected.<br>
                        <button class="btn-sm btn-primary" style="margin-top: 10px;" onclick="toggleActiveRobotConnection()">
                            <i class="fa-solid fa-plug"></i> Connect to ${escapeHtml(activeRobotId)}
                        </button>
                    </td>
                </tr>
            `;
        }
        if (countBadge) countBadge.innerText = "0 Children";
        return;
    }

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <i class="fa-solid fa-spinner fa-spin"></i> Browsing child nodes for <b>${escapeHtml(nodeId)}</b>...
                </td>
            </tr>
        `;
    }

    try {
        const res = await fetch(`/api/browse-children/${activeRobotId}?nodeId=${encodeURIComponent(nodeId)}`);
        const data = await res.json();

        if (data.success && Array.isArray(data.nodes)) {
            currentChildrenData = data.nodes;
            if (countBadge) countBadge.innerText = `${data.count || data.nodes.length} Children`;
            renderChildrenNavigatorTable(data.nodes);

            // Also inspect current node details
            await selectNodeForInspection(nodeId);
        } else {
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="empty-state" style="color: var(--fanuc-red);">
                            <i class="fa-solid fa-circle-exclamation"></i> Browse error: ${escapeHtml(data.message || "Failed to retrieve children")}
                        </td>
                    </tr>
                `;
            }
            if (countBadge) countBadge.innerText = "Error";
        }
    } catch (err) {
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state" style="color: var(--fanuc-red);">
                        <i class="fa-solid fa-circle-exclamation"></i> Request failed: ${escapeHtml(err.message)}
                    </td>
                </tr>
            `;
        }
    }
}

function updateBrowserNavButtonStates() {
    const backBtn = document.getElementById("browserBackBtn");
    const forwardBtn = document.getElementById("browserForwardBtn");
    const upBtn = document.getElementById("browserUpBtn");

    if (backBtn) backBtn.disabled = browserHistoryIndex <= 0;
    if (forwardBtn) forwardBtn.disabled = browserHistoryIndex >= browserHistory.length - 1;
    if (upBtn) upBtn.disabled = currentBrowsedNodeId === "RootFolder" || currentBrowsedNodeId === "i=84";
}

function browserGoBack() {
    if (browserHistoryIndex > 0) {
        browserHistoryIndex--;
        navigateToNodeId(browserHistory[browserHistoryIndex], false);
    }
}

function browserGoForward() {
    if (browserHistoryIndex < browserHistory.length - 1) {
        browserHistoryIndex++;
        navigateToNodeId(browserHistory[browserHistoryIndex], false);
    }
}

function browserGoUp() {
    if (currentBrowsedNodeId === "ObjectsFolder") {
        navigateToNodeId("RootFolder");
        return;
    }
    if (currentBrowsedNodeId.includes(".") || currentBrowsedNodeId.includes("/")) {
        const parts = currentBrowsedNodeId.split(/[\.\/]/);
        parts.pop();
        const parentId = parts.join(".");
        navigateToNodeId(parentId || "ObjectsFolder");
    } else {
        navigateToNodeId("ObjectsFolder");
    }
}

function refreshCurrentNodeBrowse() {
    navigateToNodeId(currentBrowsedNodeId, false);
}

function refreshBrowser() {
    browseNamespaceRoot();
}

function renderChildrenNavigatorTable(nodes) {
    const tbody = document.getElementById("childrenNavTableBody");
    if (!tbody) return;

    if (!nodes || nodes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <i class="fa-solid fa-folder-open" style="font-size: 20px; color: var(--text-muted); margin-bottom: 6px;"></i><br>
                    No child nodes present in this node.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = "";
    nodes.forEach(node => {
        const tr = document.createElement("tr");
        tr.className = "nav-row-clickable";
        tr.id = `navRow_${node.nodeId.replace(/[^a-zA-Z0-9]/g, "_")}`;

        const isObject = node.nodeClass === "Object" || node.nodeClass === "Folder" || node.nodeClass === "ObjectType";
        const isVariable = node.nodeClass === "Variable";
        const isMethod = node.nodeClass === "Method";

        let iconHtml = '<i class="fa-solid fa-folder" style="color: var(--fanuc-yellow);"></i>';
        if (isVariable) iconHtml = '<i class="fa-solid fa-tag" style="color: var(--industrial-blue);"></i>';
        else if (isMethod) iconHtml = '<i class="fa-solid fa-bolt" style="color: #A855F7;"></i>';

        let actionBtnHtml = isObject 
            ? `<button class="btn-sm btn-primary" onclick="event.stopPropagation(); navigateToNodeId('${escapeJs(node.nodeId)}')"><i class="fa-solid fa-folder-open"></i> Open</button>`
            : `<button class="btn-sm" onclick="event.stopPropagation(); selectNodeForInspection('${escapeJs(node.nodeId)}')"><i class="fa-solid fa-circle-info"></i> Inspect</button>`;

        tr.onclick = () => {
            document.querySelectorAll("#childrenNavTableBody tr").forEach(r => r.classList.remove("nav-row-selected"));
            tr.classList.add("nav-row-selected");
            selectNodeForInspection(node.nodeId);
        };

        tr.ondblclick = () => {
            if (isObject) {
                navigateToNodeId(node.nodeId);
            }
        };

        tr.innerHTML = `
            <td style="text-align: center;">${iconHtml}</td>
            <td><strong>${escapeHtml(node.displayName || node.browseName)}</strong></td>
            <td><code style="color: var(--text-secondary);">${escapeHtml(node.browseName)}</code></td>
            <td><code style="color: var(--fanuc-yellow);">${escapeHtml(node.nodeId)}</code></td>
            <td><span class="val-pill" style="font-size: 10px;">${escapeHtml(node.nodeClass)}</span></td>
            <td><span class="val-pill badge-na" style="font-size: 10px;">${escapeHtml(node.dataType || "--")}</span></td>
            <td style="font-family: 'JetBrains Mono', monospace; font-size: 11px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(String(node.value !== undefined ? node.value : "--"))}
            </td>
            <td style="text-align: center;">${actionBtnHtml}</td>
        `;

        tbody.appendChild(tr);
    });
}

async function selectNodeForInspection(nodeId) {
    if (!nodeId) return;

    try {
        const res = await fetch(`/api/node-details/${activeRobotId}?nodeId=${encodeURIComponent(nodeId)}`);
        const data = await res.json();

        if (data.success && data.details) {
            const d = data.details;
            selectedNodeDetails = d;

            setValue("selectedNodeId", d.nodeId || "--");
            setValue("selectedDisplayName", d.displayName || "--");
            setValue("selectedBrowseName", d.browseName || "--");
            setValue("selectedDescription", d.description || "--");
            setValue("selectedNodeClass", d.nodeClass || "--");
            setValue("selectedDatatype", d.dataType || "--");
            setValue("selectedAccess", d.accessLevel || "--");
            setValue("selectedStatusCode", d.statusCode || "Good");
            setValue("selectedValue", d.formattedValue || "--");
            setValue("selectedValueTimestamp", d.sourceTimestamp !== "--" ? `Timestamp: ${d.sourceTimestamp}` : "");
        }
    } catch {}
}

async function loadNamespaceTree() {
    const treeContainer = document.getElementById("nodeTree");
    if (!treeContainer) return;

    treeContainer.innerHTML = `<p class="placeholder"><i class="fa-solid fa-spinner fa-spin"></i> Loading namespace tree...</p>`;

    try {
        const res = await fetch(`/api/browse-tree/${activeRobotId}`);
        const data = await res.json();

        if (data.success && Array.isArray(data.nodes)) {
            treeHierarchyData = data.nodes;
            renderNamespaceTree(data.nodes, treeContainer);
        } else {
            treeContainer.innerHTML = `<p class="empty-state">${escapeHtml(data.message || "Failed to load hierarchy")}</p>`;
        }
    } catch (err) {
        treeContainer.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    }
}

function renderNamespaceTree(nodes, container) {
    if (!container) return;
    if (!nodes || nodes.length === 0) {
        container.innerHTML = `<p class="placeholder" style="padding: 10px;">No nodes discovered.</p>`;
        return;
    }

    container.innerHTML = "";
    const rootUl = document.createElement("ul");

    function createSubTree(nodeList, parentUl) {
        nodeList.forEach(node => {
            const li = document.createElement("li");
            const hasKids = Array.isArray(node.children) && node.children.length > 0;
            const isObj = node.nodeClass === "Object" || node.nodeClass === "Folder" || node.nodeClass === "ObjectType";

            const itemDiv = document.createElement("div");
            itemDiv.className = `tree-item ${node.nodeId === currentBrowsedNodeId ? "selected" : ""}`;
            itemDiv.id = `treeItem_${node.nodeId.replace(/[^a-zA-Z0-9]/g, "_")}`;

            const toggleIcon = document.createElement("i");
            toggleIcon.className = hasKids ? "tree-toggle-icon fa-solid fa-chevron-down" : "tree-toggle-icon fa-solid fa-minus";

            const nodeIcon = document.createElement("i");
            nodeIcon.className = isObj 
                ? "tree-node-icon fa-solid fa-folder" 
                : "tree-node-icon fa-solid fa-tag";
            nodeIcon.style.color = isObj ? "var(--fanuc-yellow)" : "var(--industrial-blue)";

            const textSpan = document.createElement("span");
            textSpan.innerHTML = `<b>${escapeHtml(node.displayName || node.browseName)}</b> <small style="color:var(--text-muted);">(${escapeHtml(node.nodeId)})</small>`;

            itemDiv.appendChild(toggleIcon);
            itemDiv.appendChild(nodeIcon);
            itemDiv.appendChild(textSpan);

            itemDiv.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll(".tree-item").forEach(el => el.classList.remove("selected"));
                itemDiv.classList.add("selected");
                navigateToNodeId(node.nodeId);
            };

            li.appendChild(itemDiv);

            if (hasKids) {
                const subUl = document.createElement("ul");
                createSubTree(node.children, subUl);
                li.appendChild(subUl);

                toggleIcon.onclick = (e) => {
                    e.stopPropagation();
                    const isCollapsed = subUl.style.display === "none";
                    subUl.style.display = isCollapsed ? "block" : "none";
                    toggleIcon.className = isCollapsed 
                        ? "tree-toggle-icon fa-solid fa-chevron-down" 
                        : "tree-toggle-icon fa-solid fa-chevron-right";
                };
            }

            parentUl.appendChild(li);
        });
    }

    createSubTree(nodes, rootUl);
    container.appendChild(rootUl);
}

function expandAllNodes() {
    document.querySelectorAll("#nodeTree ul").forEach(ul => ul.style.display = "block");
    document.querySelectorAll("#nodeTree .tree-toggle-icon").forEach(icon => {
        if (icon.classList.contains("fa-chevron-right")) {
            icon.className = "tree-toggle-icon fa-solid fa-chevron-down";
        }
    });
}

function collapseAllNodes() {
    document.querySelectorAll("#nodeTree > ul > li > ul").forEach(ul => ul.style.display = "none");
    document.querySelectorAll("#nodeTree .tree-toggle-icon").forEach(icon => {
        if (icon.classList.contains("fa-chevron-down")) {
            icon.className = "tree-toggle-icon fa-solid fa-chevron-right";
        }
    });
}

function searchNodes() {
    const q = document.getElementById("nodeSearch")?.value.toLowerCase().trim() || "";
    if (!q) {
        renderNamespaceTree(treeHierarchyData, document.getElementById("nodeTree"));
        return;
    }

    function filterRecursive(nodeList) {
        const result = [];
        for (const n of nodeList) {
            const matches = (n.displayName || n.browseName || n.nodeId || "").toLowerCase().includes(q);
            const filteredChildren = n.children ? filterRecursive(n.children) : [];
            if (matches || filteredChildren.length > 0) {
                result.push({
                    ...n,
                    children: filteredChildren
                });
            }
        }
        return result;
    }

    const filtered = filterRecursive(treeHierarchyData);
    renderNamespaceTree(filtered, document.getElementById("nodeTree"));
    expandAllNodes();
}

function copySelectedNodeId() {
    const id = document.getElementById("selectedNodeId")?.innerText;
    if (!id || id === "--") {
        alert("No node selected to copy.");
        return;
    }
    navigator.clipboard.writeText(id).then(() => {
        alert(`Copied Node ID to clipboard:\n${id}`);
    }).catch(() => {
        alert(`Node ID: ${id}`);
    });
}

function sendSelectedNodeToRead() {
    const id = document.getElementById("selectedNodeId")?.innerText;
    if (!id || id === "--") {
        alert("No node selected.");
        return;
    }
    showPage("read");
    const input = document.getElementById("readNodeId");
    if (input) {
        input.value = id;
        readNode();
    }
}

async function readNode() {
    const id = document.getElementById("readNodeId")?.value.trim();
    if (!id) {
        alert("Enter a Node ID to read.");
        return;
    }
    if (!connected) {
        alert("Connect to a robot first.");
        return;
    }

    try {
        const res = await fetch("/api/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ robotId: activeRobotId, nodeId: id })
        });
        const data = await res.json();
        const area = document.getElementById("readValue");
        if (area) {
            area.value = JSON.stringify(data, null, 2);
        }
    } catch (err) {
        alert("Read node error: " + err.message);
    }
}

function clearReadBox() {
    const id = document.getElementById("readNodeId");
    const area = document.getElementById("readValue");
    if (id) id.value = "";
    if (area) area.value = "";
}

//==================================================
// BACKGROUND POLLING LOOP
//==================================================

function startPollingLoop() {
    if (pollTimer) clearInterval(pollTimer);

    pollTimer = setInterval(async () => {
        await checkConnectedRobots();

        if (activePageId === "dashboard") {
            await loadAllRobotsSummary();
            if (connected) await loadStatus();
        } else if (connected) {
            if (activePageId === "io" || activePageId === "registers") {
                await loadIO();
            } else if (activePageId === "programs") {
                await loadPrograms();
            } else if (activePageId === "alarms") {
                await loadAlarms();
            } else if (activePageId === "robot") {
                await loadStatus();
            }
        }
    }, 2000);
}

//==================================================
// UTILITY FUNCTIONS
//==================================================

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val !== undefined && val !== null ? val : "--";
}

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function addLog(msg) {
    const area = document.getElementById("logArea");
    if (area) {
        area.value += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
    }
}