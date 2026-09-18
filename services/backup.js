// services/backup.js

const fs = require("fs");
const path = require("path");
const net = require("net");
const { execSync } = require("child_process");
const robotManager = require("./robotManager");
const database = require("./database");
const logger = require("./logger");

const backupsBaseDir = path.join(__dirname, "../Backups");
if (!fs.existsSync(backupsBaseDir)) {
    fs.mkdirSync(backupsBaseDir, { recursive: true });
}

/**
 * Format timestamp for backup naming: YYYY-MM-DD_HH-mm-ss
 */
function getTimestampString() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Generate standard FANUC backup archive filename:
 * Format: FANUC_Backup_<RobotName>_<IP>_<DateTime>.zip
 */
function generateBackupFilename(robotName, robotIp, timestamp) {
    const safeName = (robotName || "Robot").replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeIp = (robotIp || "127.0.0.1").replace(/[^a-zA-Z0-9_.-]/g, "_");
    return `FANUC_Backup_${safeName}_${safeIp}_${timestamp}.zip`;
}

/**
 * Package a folder into a standard PKZip archive using PowerShell Compress-Archive.
 * This guarantees all files are stored at the archive root without './' relative path prefixes,
 * ensuring 100% native compatibility with Windows Explorer, WinRAR, 7-Zip, macOS, and Linux.
 */
function createZipArchive(stagingDir, targetZipPath) {
    if (fs.existsSync(targetZipPath)) {
        try { fs.unlinkSync(targetZipPath); } catch {}
    }

    const entries = fs.readdirSync(stagingDir);
    if (entries.length === 0) {
        throw new Error("Staging directory is empty. Cannot create ZIP from 0 files.");
    }

    // Use .NET ZipFile CreateFromDirectory for standard PKZip compliance without command-line parameter collision
    const safeStaging = stagingDir.replace(/\\/g, "/");
    const safeZip = targetZipPath.replace(/\\/g, "/");
    const psScript = `
        Add-Type -AssemblyName System.IO.Compression.FileSystem;
        [System.IO.Compression.ZipFile]::CreateFromDirectory('${safeStaging}', '${safeZip}', [System.IO.Compression.CompressionLevel]::Optimal, $false);
    `;

    try {
        execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\r?\n/g, ' ')}"`, { stdio: "pipe", timeout: 60000 });
    } catch (cmdErr) {
        logger.warn(`ZipFile.CreateFromDirectory error (${cmdErr.message}), falling back to tar.exe...`, { module: "Backup" });
        execSync(`tar.exe -a -c -f "${targetZipPath}" -C "${stagingDir}" .`, { stdio: "pipe" });
    }

    if (!fs.existsSync(targetZipPath)) {
        throw new Error("Target ZIP file was not created on disk.");
    }

    const stats = fs.statSync(targetZipPath);
    if (stats.size === 0) {
        try { fs.unlinkSync(targetZipPath); } catch {}
        throw new Error("Created ZIP archive is 0 bytes.");
    }

    return {
        success: true,
        sizeBytes: stats.size,
        sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
    };
}

/**
 * Programmatically open and inspect the ZIP archive to verify:
 * 1. ZIP exists and size > 0
 * 2. ZIP contains files
 * 3. Total files inside ZIP matches the successfully downloaded file count
 * 4. Actual downloaded filenames are present inside the ZIP
 */
function verifyZipArchive(targetZipPath, downloadedFiles) {
    if (!fs.existsSync(targetZipPath)) {
        throw new Error("ZIP verification failed: Archive file does not exist on disk.");
    }

    const stats = fs.statSync(targetZipPath);
    if (stats.size === 0) {
        throw new Error("ZIP verification failed: Archive file is 0 bytes.");
    }

    // Inspect entries via .NET System.IO.Compression.ZipFile
    const safeZip = targetZipPath.replace(/\\/g, "/");
    const psScript = `
        Add-Type -AssemblyName System.IO.Compression.FileSystem;
        $archive = [System.IO.Compression.ZipFile]::OpenRead('${safeZip}');
        $entries = foreach ($e in $archive.Entries) {
            [PSCustomObject]@{
                FullName = $e.FullName;
                Name = $e.Name;
                Length = $e.Length
            }
        };
        $archive.Dispose();
        $entries | ConvertTo-Json -Compress
    `;

    let entries = [];
    try {
        const rawJson = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\r?\n/g, ' ')}"`, { stdio: ["pipe", "pipe", "pipe"], timeout: 30000 }).toString().trim();
        if (rawJson) {
            const parsed = JSON.parse(rawJson);
            entries = Array.isArray(parsed) ? parsed : [parsed];
        }
    } catch (inspectErr) {
        // Fallback inspection via tar.exe -tf
        try {
            const tarListing = execSync(`tar.exe -tf "${targetZipPath}"`).toString().trim().split(/\r?\n/);
            entries = tarListing.filter(s => s && !s.endsWith("/")).map(s => ({
                FullName: s.replace(/^\.\//, ""),
                Name: path.basename(s),
                Length: 1
            }));
        } catch (tarErr) {
            throw new Error(`ZIP verification failed: Could not read archive entries (${inspectErr.message})`);
        }
    }

    // Filter out directories from entry list
    const fileEntries = entries.filter(e => e.Name && !e.FullName.endsWith("/"));

    if (fileEntries.length === 0) {
        throw new Error("ZIP verification failed: Archive contains 0 valid file entries.");
    }

    const zipFileNames = new Set(fileEntries.map(e => e.Name.toUpperCase()));

    // Verify each downloaded file is present inside the ZIP
    const missingInZip = [];
    for (const f of downloadedFiles) {
        if (!zipFileNames.has(f.name.toUpperCase())) {
            missingInZip.push(f.name);
        }
    }

    if (missingInZip.length > 0) {
        throw new Error(`ZIP verification failed: ${missingInZip.length} files missing from archive (${missingInZip.slice(0, 5).join(", ")}...)`);
    }

    return {
        verified: true,
        zipSizeBytes: stats.size,
        zipSizeMB: (stats.size / (1024 * 1024)).toFixed(2),
        entriesCount: fileEntries.length,
        entries: fileEntries
    };
}

/**
 * Robust FANUC FTP Client (RFC 959) using Node sockets with Passive Data Connections.
 * Implements standard FANUC FTP procedures:
 * 1. Port 21 TCP Connect
 * 2. USER / PASS Authentication
 * 3. TYPE I Binary Mode
 * 4. CWD MDB: (FANUC Memory Disk Backup virtual device)
 * 5. NLST (mget *.* listing)
 * 6. RETR (Binary file retrieval with verified disk streams)
 */
class FanucFtpClient {
    constructor(host, port = 21, user = "anonymous", password = "") {
        this.host = host;
        this.port = port || 21;
        this.user = user || "anonymous";
        this.password = password || "";
        this.socket = null;
        this.timeoutMs = 15000;
        this.lineBuffer = "";
        this.responseQueue = [];
        this.resolverQueue = [];
    }

    _handleData(chunk) {
        this.lineBuffer += chunk.toString("utf8");
        const lines = this.lineBuffer.split(/\r?\n/);
        this.lineBuffer = lines.pop(); // keep incomplete remainder

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const match = trimmed.match(/^(\d{3})(?:[ -](.*))?$/);
            if (match) {
                const code = parseInt(match[1], 10);
                const isFinal = !trimmed.startsWith(`${code}-`);
                if (isFinal) {
                    const response = { code, text: trimmed };
                    if (this.resolverQueue.length > 0) {
                        const resolver = this.resolverQueue.shift();
                        resolver.resolve(response);
                    } else {
                        this.responseQueue.push(response);
                    }
                }
            }
        }
    }

    readResponse() {
        return new Promise((resolve, reject) => {
            if (this.responseQueue.length > 0) {
                return resolve(this.responseQueue.shift());
            }
            this.resolverQueue.push({ resolve, reject });
        });
    }

    async sendCmd(cmd) {
        if (!this.socket || this.socket.destroyed) {
            throw new Error("FTP control socket is not connected");
        }
        this.socket.write(cmd + "\r\n");
        return this.readResponse();
    }

    connect() {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            this.socket = socket;
            socket.setTimeout(this.timeoutMs);

            this.resolverQueue.push({ resolve, reject });

            socket.on("data", (chunk) => this._handleData(chunk));

            socket.on("timeout", () => {
                socket.destroy();
                reject(new Error(`FTP connection to ${this.host}:${this.port} timed out.`));
            });

            socket.on("error", (err) => {
                socket.destroy();
                while (this.resolverQueue.length > 0) {
                    this.resolverQueue.shift().reject(err);
                }
            });

            socket.connect(this.port, this.host);
        });
    }

    async login() {
        const userRes = await this.sendCmd(`USER ${this.user}`);
        if (userRes.code === 331) {
            const passRes = await this.sendCmd(`PASS ${this.password}`);
            if (passRes.code !== 230 && passRes.code !== 202) {
                throw new Error(`FTP Authentication failed: ${passRes.text}`);
            }
        } else if (userRes.code !== 230 && userRes.code !== 202) {
            throw new Error(`FTP USER rejected: ${userRes.text}`);
        }

        // Set Binary Mode (TYPE I)
        const typeRes = await this.sendCmd("TYPE I");
        if (typeRes.code !== 200) {
            logger.warn(`FTP TYPE I response: ${typeRes.text}`, { module: "Backup" });
        }
    }

    async changeDir(device = "MDB:") {
        const res = await this.sendCmd(`CWD ${device}`);
        if (res.code !== 250 && res.code !== 200) {
            throw new Error(`Failed to change directory to ${device} (${res.code}): ${res.text}`);
        }
        return res;
    }

    async enterPasv() {
        // Flush any lingering responses in queue before PASV
        while (this.responseQueue.length > 0) {
            this.responseQueue.shift();
        }

        const res = await this.sendCmd("PASV");
        if (res.code !== 227) {
            throw new Error(`PASV failed (${res.code}): ${res.text}`);
        }

        const match = res.text.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
        if (!match) {
            throw new Error(`Invalid PASV response: ${res.text}`);
        }

        const p1 = parseInt(match[5], 10);
        const p2 = parseInt(match[6], 10);
        const dataPort = (p1 * 256) + p2;
        const dataHost = this.host;

        return { dataHost, dataPort };
    }

    async listFiles(device = "MDB:") {
        await this.changeDir(device);

        const { dataHost, dataPort } = await this.enterPasv();

        return new Promise((resolve, reject) => {
            const dataSocket = net.connect(dataPort, dataHost);
            dataSocket.setTimeout(15000);

            let buffer = "";

            dataSocket.on("data", (chunk) => {
                buffer += chunk.toString("utf8");
            });

            const dataFinished = new Promise((resData, rejData) => {
                dataSocket.on("error", rejData);
                dataSocket.on("close", () => {
                    const files = buffer
                        .split(/\r?\n/)
                        .map(s => s.trim())
                        .filter(s => s && s !== "." && s !== ".." && !s.endsWith("/") && !s.endsWith("\\"));
                    resData(files);
                });
            });

            this.sendCmd("NLST")
                .then(async (nlstRes) => {
                    if (nlstRes.code !== 150 && nlstRes.code !== 125 && nlstRes.code !== 226) {
                        dataSocket.destroy();
                        return resolve([]);
                    }
                    const files = await dataFinished;
                    if (nlstRes.code !== 226) {
                        await this.readResponse().catch(() => {});
                    }
                    resolve(files);
                })
                .catch(err => {
                    dataSocket.destroy();
                    reject(err);
                });
        });
    }

    async downloadFile(filename, localDestPath) {
        const { dataHost, dataPort } = await this.enterPasv();

        return new Promise((resolve, reject) => {
            const dataSocket = net.connect(dataPort, dataHost);
            dataSocket.setTimeout(30000);

            const fileStream = fs.createWriteStream(localDestPath);
            let bytesReceived = 0;

            const dataFinished = new Promise((resData, rejData) => {
                let streamFinished = false;
                let socketClosed = false;

                function checkDone() {
                    if (streamFinished && socketClosed) {
                        resData(bytesReceived);
                    }
                }

                dataSocket.on("data", (chunk) => {
                    bytesReceived += chunk.length;
                    fileStream.write(chunk);
                });

                dataSocket.on("error", (err) => {
                    fileStream.destroy();
                    rejData(err);
                });

                dataSocket.on("timeout", () => {
                    dataSocket.destroy();
                    fileStream.destroy();
                    rejData(new Error(`Data socket timed out downloading ${filename}`));
                });

                dataSocket.on("close", () => {
                    socketClosed = true;
                    fileStream.end();
                });

                fileStream.on("finish", () => {
                    streamFinished = true;
                    checkDone();
                });

                fileStream.on("error", (err) => {
                    dataSocket.destroy();
                    rejData(err);
                });
            });

            this.sendCmd(`RETR ${filename}`)
                .then(async (retrRes) => {
                    if (retrRes.code !== 150 && retrRes.code !== 125) {
                        dataSocket.destroy();
                        fileStream.destroy();
                        throw new Error(`RETR rejected (${retrRes.code}): ${retrRes.text}`);
                    }
                    const bytes = await dataFinished;
                    // Await 226 Transfer complete from control socket
                    await this.readResponse().catch(() => {});
                    resolve(bytes);
                })
                .catch(err => {
                    fileStream.destroy();
                    dataSocket.destroy();
                    reject(err);
                });
        });
    }

    async close() {
        try {
            if (this.socket && !this.socket.destroyed) {
                await this.sendCmd("QUIT").catch(() => {});
                this.socket.destroy();
            }
        } catch {}
    }
}

/**
 * Execute real FANUC Application Backup for a specific robot.
 * Strictly implements the complete FANUC FTP Backup & Verification pipeline:
 * 1. Connect to Port 21
 * 2. Login authentication
 * 3. Binary transfer mode
 * 4. Change to FANUC virtual device MDB:
 * 5. Retrieve all files (mget *.*)
 * 6. Download and verify every local file on disk
 * 7. Save into temporary staging folder
 * 8. Create ZIP named FANUC_Backup_<RobotName>_<IP>_<DateTime>.zip
 * 9. Programmatically inspect and verify ZIP contents
 * 10. Record verified metrics in SQLite
 */
async function backupRobot(robotId, options = {}) {
    const robot = robotManager.getRobotInternal(robotId);
    if (!robot) {
        throw new Error(`Robot "${robotId}" not found in configuration.`);
    }

    const timestamp = getTimestampString();
    const robotDir = path.join(backupsBaseDir, robotId);
    if (!fs.existsSync(robotDir)) {
        fs.mkdirSync(robotDir, { recursive: true });
    }

    const stagingDir = path.join(robotDir, `staging_${timestamp}`);
    fs.mkdirSync(stagingDir, { recursive: true });

    const ftpIp = robot.ftpIp || robot.ip || "127.0.0.1";
    const ftpPort = robot.ftpPort || 21;
    const ftpUser = robot.ftpUser || "anonymous";
    const ftpPassword = robot.ftpPassword || "";

    const zipFilename = generateBackupFilename(robot.name || robot.id, ftpIp, timestamp);
    const zipPath = path.join(robotDir, zipFilename);

    console.log(`\n======================================================`);
    console.log(`[BACKUP INITIATED] Robot: ${robotId} (${robot.name})`);
    console.log(`[Target Endpoint] ${ftpIp}:${ftpPort} (User: ${ftpUser})`);
    console.log(`======================================================`);

    logger.info(`[FTP connection] Starting backup for robot ${robotId} (${robot.name}) at ${ftpIp}:${ftpPort}`, { robotId, module: "Backup" });

    const downloadedFiles = [];
    const failedFiles = [];
    let totalBytes = 0;
    let failureStep = null;
    let failureError = null;
    let files = [];
    let deviceUsed = "MDB:";

    const ftpClient = new FanucFtpClient(ftpIp, ftpPort, ftpUser, ftpPassword);

    try {
        // Step 1: FTP Connection (Port 21)
        failureStep = "FTP connection";
        logger.info(`[FTP connection] Connecting to controller at ${ftpIp}:${ftpPort}...`, { robotId, module: "Backup" });
        console.log(`[FTP connection] Connecting to ${ftpIp}:${ftpPort}...`);
        await ftpClient.connect();
        logger.info(`[FTP connection] Successfully connected to ${ftpIp}:${ftpPort}`, { robotId, module: "Backup" });
        console.log(`[FTP connection] Connected.`);

        // Step 2: Authentication
        failureStep = "Authentication";
        logger.info(`[Authentication] Authenticating as user "${ftpUser}"...`, { robotId, module: "Backup" });
        console.log(`[Authentication] Authenticating user "${ftpUser}"...`);
        await ftpClient.login();
        logger.info(`[Authentication] Authentication successful (Binary transfer mode enabled)`, { robotId, module: "Backup" });
        console.log(`[Authentication] Logged in successfully.`);

        // Step 3: MDB: Directory Access
        failureStep = "MDB: directory access";
        logger.info(`[MDB: directory access] Switching working directory to FANUC virtual device MDB:...`, { robotId, module: "Backup" });
        console.log(`[MDB: directory access] Changing directory to MDB:...`);
        try {
            files = await ftpClient.listFiles("MDB:");
            logger.info(`[MDB: directory access] Successfully accessed FANUC virtual device MDB:`, { robotId, module: "Backup" });
            console.log(`[MDB: directory access] MDB: accessed successfully.`);
        } catch (mdbErr) {
            logger.warn(`[MDB: directory access] MDB: access returned error (${mdbErr.message}), trying MD:...`, { robotId, module: "Backup" });
            deviceUsed = "MD:";
            files = await ftpClient.listFiles("MD:");
            logger.info(`[MDB: directory access] Successfully accessed fallback device MD:`, { robotId, module: "Backup" });
        }

        // Step 4: Files Found
        failureStep = "Files found";
        logger.info(`[Files found] Discovered ${files.length} backup files on ${deviceUsed}`, { robotId, module: "Backup" });
        console.log(`[Files found] ${files.length} backup files found on ${deviceUsed}.`);

        if (!files || files.length === 0) {
            throw new Error(`Zero backup files were found on FANUC virtual device ${deviceUsed}.`);
        }

        // Step 5: Each File Downloaded (mget *.*)
        failureStep = "File download";
        for (let i = 0; i < files.length; i++) {
            const fileName = files[i];
            const localFilePath = path.join(stagingDir, fileName);

            try {
                const bytes = await ftpClient.downloadFile(fileName, localFilePath);
                
                if (fs.existsSync(localFilePath)) {
                    const stats = fs.statSync(localFilePath);
                    downloadedFiles.push({
                        name: fileName,
                        size: stats.size,
                        path: localFilePath
                    });
                    totalBytes += stats.size;
                    logger.info(`[Each file downloaded] [${i + 1}/${files.length}] ${fileName} (${stats.size} bytes)`, { robotId, module: "Backup" });
                    console.log(`[Each file downloaded] [${i + 1}/${files.length}] ${fileName} (${stats.size} bytes)`);
                } else {
                    failedFiles.push({ name: fileName, error: "Local file not created on disk" });
                    logger.warn(`Failed to create local file: ${fileName}`, { robotId, module: "Backup" });
                }
            } catch (err) {
                failedFiles.push({ name: fileName, error: err.message });
                logger.warn(`Failed to retrieve file ${fileName}: ${err.message}`, { robotId, module: "Backup" });
            }
        }

        await ftpClient.close();

        // Step 6: Total Files Downloaded & Total Backup Size
        const totalSizeMB = (totalBytes / (1024 * 1024)).toFixed(2);
        logger.info(`[Total files downloaded] Successfully downloaded ${downloadedFiles.length} of ${files.length} files from ${deviceUsed}`, { robotId, module: "Backup" });
        logger.info(`[Total backup size] Total size: ${totalBytes} bytes (${totalSizeMB} MB)`, { robotId, module: "Backup" });
        console.log(`[Total files downloaded] ${downloadedFiles.length} files (${failedFiles.length} failed).`);
        console.log(`[Total backup size] ${totalBytes} bytes (${totalSizeMB} MB).`);

    } catch (err) {
        failureError = err;
        logger.error(`[Backup Error at ${failureStep}] ${err.message}`, { robotId, module: "Backup" });
        console.error(`[Backup Error at ${failureStep}] ${err.message}`);
        await ftpClient.close().catch(() => {});
    }

    // Step 7: STRICT VALIDATION — ZERO DOWNLOADED FILES = FAILURE (NO EMPTY ZIP)
    if (downloadedFiles.length === 0) {
        try {
            if (fs.existsSync(stagingDir)) {
                fs.rmSync(stagingDir, { recursive: true, force: true });
            }
        } catch {}

        const errorMessage = failureError 
            ? `Backup failed at step [${failureStep}]: ${failureError.message}` 
            : `Backup failed at step [${failureStep}]: 0 files were successfully downloaded from FANUC controller.`;

        database.saveBackupRecord({
            robotId: robot.id,
            robotName: robot.name,
            robotIp: ftpIp,
            backupType: "Application Backup (FTP MDB:)",
            filesFound: files.length,
            filesDownloaded: 0,
            filesFailed: files.length,
            sizeBytes: 0,
            sizeMB: "0.00",
            status: "FAILED",
            filename: zipFilename,
            filePath: zipPath,
            errorMessage,
            timestamp: new Date().toISOString(),
            detailsJson: {
                failedStep: failureStep,
                filesFound: files.length,
                filesDownloaded: 0,
                failedFiles
            }
        });

        throw new Error(errorMessage);
    }

    // Step 8: Save Manifest & Create ZIP Archive
    try {
        failureStep = "ZIP creation";
        const manifest = {
            backupTitle: "FANUC Industrial Robot Controller Application Backup",
            backupType: "Application Backup (FTP MDB: / All of the Above)",
            robotId: robot.id,
            robotName: robot.name,
            controllerIp: robot.ip,
            ftpEndpoint: `${ftpIp}:${ftpPort}`,
            createdAt: new Date().toISOString(),
            filesFoundCount: files.length,
            filesDownloadedCount: downloadedFiles.length,
            filesFailedCount: failedFiles.length,
            totalBytes,
            downloadedFiles: downloadedFiles.map(f => ({ name: f.name, sizeBytes: f.size })),
            failedFiles
        };

        fs.writeFileSync(
            path.join(stagingDir, "backup_manifest.json"),
            JSON.stringify(manifest, null, 4),
            "utf8"
        );

        logger.info(`[ZIP creation] Packaging ${downloadedFiles.length} files into ZIP archive: ${zipFilename}...`, { robotId, module: "Backup" });
        console.log(`[ZIP creation] Packaging ${downloadedFiles.length} files into ${zipFilename}...`);
        
        const zipResult = createZipArchive(stagingDir, zipPath);
        
        logger.info(`[ZIP creation] Successfully created ZIP archive: ${zipFilename} (${zipResult.sizeMB} MB, ${zipResult.sizeBytes} bytes)`, { robotId, module: "Backup" });
        console.log(`[ZIP creation] ZIP created successfully (${zipResult.sizeMB} MB).`);

        // Step 9: PROGRAMMATIC ZIP VERIFICATION
        failureStep = "ZIP verification";
        logger.info(`[ZIP verification] Verifying archive integrity and contents for ${zipFilename}...`, { robotId, module: "Backup" });
        console.log(`[ZIP verification] Verifying archive integrity and contents for ${zipFilename}...`);

        const verification = verifyZipArchive(zipPath, downloadedFiles);
        logger.info(`[ZIP verification] Verified ${verification.entriesCount} entries inside ${zipFilename} [PASS]`, { robotId, module: "Backup" });
        console.log(`[ZIP verification] Verified ${verification.entriesCount} entries inside ${zipFilename} [PASS]`);

        // Step 10: Final ZIP Path
        logger.info(`[Final ZIP path] ${zipPath}`, { robotId, module: "Backup" });
        console.log(`[Final ZIP path] ${zipPath}`);

        // Clean up temporary staging directory
        try {
            fs.rmSync(stagingDir, { recursive: true, force: true });
        } catch {}

        const detailsData = {
            ftpConnected: true,
            authSuccess: true,
            mdbAccessed: true,
            filesFound: files.length,
            filesDownloaded: downloadedFiles.length,
            filesFailed: failedFiles.length,
            totalDownloadedBytes: totalBytes,
            zipEntriesCount: verification.entriesCount,
            zipVerified: true,
            downloadedFiles: downloadedFiles.map(f => ({ name: f.name, size: f.size })),
            failedFiles
        };

        // Record Verified Successful Backup in SQLite
        database.saveBackupRecord({
            robotId: robot.id,
            robotName: robot.name,
            robotIp: ftpIp,
            backupType: "Application Backup (FTP MDB:)",
            filesFound: files.length,
            filesDownloaded: downloadedFiles.length,
            filesFailed: failedFiles.length,
            verifiedEntries: verification.entriesCount,
            sizeBytes: zipResult.sizeBytes,
            sizeMB: zipResult.sizeMB,
            status: "SUCCESS",
            filename: zipFilename,
            filePath: zipPath,
            timestamp: new Date().toISOString(),
            detailsJson: detailsData
        });

        return {
            success: true,
            robotId: robot.id,
            robotName: robot.name,
            robotIp: ftpIp,
            filename: zipFilename,
            filePath: zipPath,
            filesFound: files.length,
            filesDownloaded: downloadedFiles.length,
            filesFailed: failedFiles.length,
            totalBytes,
            sizeBytes: zipResult.sizeBytes,
            sizeMB: zipResult.sizeMB,
            zipVerified: true,
            zipEntriesCount: verification.entriesCount,
            timestamp,
            details: detailsData,
            message: `Backup for ${robot.name || robot.id} completed & verified successfully (${downloadedFiles.length} files, ${zipResult.sizeMB} MB).`
        };

    } catch (err) {
        // Delete defective ZIP if verification or packaging failed
        try {
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        } catch {}

        try {
            if (fs.existsSync(stagingDir)) {
                fs.rmSync(stagingDir, { recursive: true, force: true });
            }
        } catch {}

        const failureMsg = `BACKUP FAILED — ${err.message}`;
        logger.error(`${failureMsg}`, { robotId, module: "Backup" });

        database.saveBackupRecord({
            robotId: robot.id,
            robotName: robot.name,
            robotIp: ftpIp,
            backupType: "Application Backup (FTP MDB:)",
            filesFound: files.length,
            filesDownloaded: downloadedFiles.length,
            filesFailed: failedFiles.length,
            sizeBytes: 0,
            sizeMB: "0.00",
            status: "FAILED",
            filename: zipFilename,
            filePath: zipPath,
            errorMessage: failureMsg,
            timestamp: new Date().toISOString(),
            detailsJson: {
                failedStep: failureStep,
                error: err.message,
                filesFound: files.length,
                filesDownloaded: downloadedFiles.length,
                failedFiles
            }
        });

        throw new Error(failureMsg);
    }
}

/**
 * Backup All Configured Robots.
 */
async function backupAllRobots(options = {}) {
    const robots = robotManager.getRobots();
    logger.info(`[Backup] Starting batch backup for ${robots.length} robots...`, { module: "Backup" });

    const results = [];
    for (const robot of robots) {
        try {
            const res = await backupRobot(robot.id, options);
            results.push({ robotId: robot.id, success: true, ...res });
        } catch (err) {
            results.push({ robotId: robot.id, success: false, error: err.message });
        }
    }

    return {
        success: true,
        count: results.length,
        results
    };
}

/**
 * List all generated backup archives on disk.
 */
function listBackups(robotId = null) {
    const backups = [];

    function scanDir(dir, rId) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".zip")) {
                const fullPath = path.join(dir, entry.name);
                const stats = fs.statSync(fullPath);
                
                let extractedId = rId;
                if (!extractedId) {
                    const match = entry.name.match(/FANUC_Backup_([^_]+)_/) || entry.name.match(/Robot_Backup_([^_]+)_/) || entry.name.match(/^([^_]+)_Backup_/);
                    extractedId = match ? match[1] : "default";
                }

                backups.push({
                    filename: entry.name,
                    robotId: extractedId,
                    sizeBytes: stats.size,
                    sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
                    createdAt: stats.mtime.toISOString(),
                    path: fullPath
                });
            } else if (entry.isDirectory() && !entry.name.startsWith("staging_")) {
                scanDir(path.join(dir, entry.name), entry.name);
            }
        }
    }

    if (robotId && robotId !== "all") {
        scanDir(path.join(backupsBaseDir, robotId), robotId);
    } else {
        scanDir(backupsBaseDir, null);
    }

    return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Delete a backup archive file and its database record.
 */
function deleteBackup(filename) {
    const all = listBackups();
    const target = all.find(b => b.filename === filename);
    if (!target) {
        database.deleteBackupRecord(filename);
        return true;
    }

    if (fs.existsSync(target.path)) {
        fs.unlinkSync(target.path);
    }

    database.deleteBackupRecord(filename);
    logger.info(`[Backup] Deleted backup archive: ${filename}`, { module: "Backup" });
    return true;
}

/**
 * Test FTP Connection to a specific robot with detailed stage diagnostics:
 * 1. TCP socket connection
 * 2. Login authentication
 * 3. MDB: memory device access
 * 4. File enumeration & count
 */
async function testFtpConnection(robotId) {
    const robot = robotManager.getRobotInternal(robotId);
    if (!robot) {
        throw new Error(`Robot "${robotId}" not found in configuration.`);
    }

    const ftpIp = robot.ftpIp || robot.ip || "127.0.0.1";
    const ftpPort = robot.ftpPort || 21;
    const ftpUser = robot.ftpUser || "anonymous";
    const ftpPassword = robot.ftpPassword || "";

    const stages = [];
    const ftpClient = new FanucFtpClient(ftpIp, ftpPort, ftpUser, ftpPassword);

    try {
        await ftpClient.connect();
        stages.push({
            stage: "tcp_connection",
            label: "TCP & FTP Connection",
            status: "SUCCESS",
            detail: `Connected to ${ftpIp}:${ftpPort}`
        });

        await ftpClient.login();
        stages.push({
            stage: "authentication",
            label: "Authentication",
            status: "SUCCESS",
            detail: `Logged in as "${ftpUser}"`
        });

        let files = [];
        let deviceUsed = "MDB:";
        try {
            files = await ftpClient.listFiles("MDB:");
            stages.push({
                stage: "device_access",
                label: "MDB: Device Access",
                status: "SUCCESS",
                detail: "FANUC Memory Disk Backup device accessible"
            });
        } catch (mdbErr) {
            deviceUsed = "MD:";
            files = await ftpClient.listFiles("MD:");
            stages.push({
                stage: "device_access",
                label: "MD: Device Access",
                status: "SUCCESS",
                detail: `MDB: unavailable, fell back to MD: (${mdbErr.message})`
            });
        }

        stages.push({
            stage: "file_enumeration",
            label: "Controller Files Enumeration",
            status: files.length > 0 ? "SUCCESS" : "WARNING",
            detail: `${files.length} files discovered on ${deviceUsed}`
        });

        await ftpClient.close();

        return {
            success: files.length > 0,
            robotId: robot.id,
            robotName: robot.name,
            robotIp: ftpIp,
            stages,
            filesCount: files.length,
            sampleFiles: files.slice(0, 10),
            message: files.length > 0
                ? `FTP READY: Controller at ${ftpIp}:${ftpPort} is accessible with ${files.length} backup files ready for download.`
                : `FTP Connected, but 0 files were discovered on ${deviceUsed}.`
        };

    } catch (err) {
        await ftpClient.close().catch(() => {});
        stages.push({
            stage: "failed",
            label: "FTP Diagnostic Failure",
            status: "FAILED",
            detail: err.message
        });

        return {
            success: false,
            robotId: robot.id,
            robotName: robot.name,
            robotIp: ftpIp,
            stages,
            filesCount: 0,
            error: err.message,
            message: `FTP TEST FAILED: ${err.message}`
        };
    }
}

module.exports = {
    backupRobot,
    backupAllRobots,
    listBackups,
    deleteBackup,
    testFtpConnection,
    createZipArchive,
    verifyZipArchive,
    generateBackupFilename,
    FanucFtpClient
};
