# FANUC OPC UA Dashboard

A web-based dashboard for monitoring FANUC robots through OPC UA.

The application connects to the FANUC robot controller using OPC UA and provides a browser-based interface for viewing robot information, status, program information, and register data.

---

# 1. Features

The dashboard provides access to FANUC robot data through OPC UA.

### Robot Information

- Robot connection status
- Robot model
- Robot serial number
- Robot speed
- Robot operating mode
- Emergency stop status
- Protective stop status
- Current program

### Register / I/O Data

- Digital Inputs (DI)
- Digital Outputs (DO)
- Input Registers (IR)
- Holding Registers (HR)

### OPC UA Functions

- Connect to FANUC OPC UA server
- Disconnect from robot
- Read individual OPC UA nodes
- Read multiple OPC UA nodes
- Browse OPC UA namespace
- Search discovered OPC UA nodes
- Monitor OPC UA nodes
- Subscribe to OPC UA nodes
- Write OPC UA nodes
- Write digital outputs
- Read Modbus-related data

---

# 2. System Architecture

The application follows this general communication flow:

    FANUC Robot
          |
          v
    FANUC Robot Controller
          |
          | OPC UA
          v
    Backend Application
          |
          | HTTP / WebSocket
          v
    Web Dashboard
          |
          v
    User Browser

The backend application handles communication with the FANUC controller.

The browser is used to display the robot data and dashboard interface.

---

# 3. System Requirements

The computer running the application should have:

- Windows 10 or Windows 11
- Node.js LTS
- npm
- Visual Studio Code (recommended)
- Google Chrome or Microsoft Edge
- Network access to the FANUC robot controller

---

# 4. Network Requirements

The computer running the backend must be able to communicate with the FANUC robot controller.

Example:

    Computer running Dashboard
    IP: 192.168.1.100

            |
            | Ethernet
            |
            v

    FANUC Robot Controller
    IP: 192.168.1.10

The exact IP addresses will depend on the customer's network configuration.

Make sure the computer and FANUC controller can communicate with each other.

---

# 5. Install Node.js

Node.js is required to run the backend application.

Download and install the **LTS version of Node.js**.

Use this link if required : https://nodejs.org/dist/v24.19.0/node-v24.19.0-x64.msi

After installation, open Command Prompt or PowerShell and check the installation.

Run:

```bash
node -v
````

Then:

```bash
npm -v
```

Both commands should return version numbers.

Example:

```text
v22.x.x
10.x.x
```

The exact version may be different depending on the installed Node.js LTS release.

---

# 6. Project Structure

The project should contain a structure similar to:

```text
fanuc-dashboard/
│
├── config/
│
├── controllers/
│
├── routes/
│
├── services/
│
├── server.js
│
├── package.json
│
├── package-lock.json
│
└── README.md
```

Additional folders or files may be present depending on the version of the project.

---

# 7. Open the Project

1. Extract the `fanuc-dashboard` project folder.
2. Open Visual Studio Code.
3. Select:

```text
File → Open Folder
```

4. Select the `fanuc-dashboard` folder.
5. Open the VS Code terminal:

```text
Terminal → New Terminal
```

Make sure the terminal is located inside the project folder.

Example:

```text
C:\Users\<Username>\fanuc-dashboard>
```

---

# 8. Install Dependencies

The project contains a `package.json` file that specifies the required Node.js dependencies.

From the project directory, run:

```bash
npm install
```

npm will automatically install the required packages.

The project also contains `package-lock.json`, which records the dependency versions used by npm.

Wait until the installation is complete.

---

# 9. FANUC OPC UA Configuration

The application requires access to the OPC UA server provided by the FANUC robot controller.

The robot connection requires the appropriate:

* Robot IP address
* OPC UA port
* OPC UA endpoint

The exact values depend on the FANUC controller configuration.

Example:

```text
Robot IP Address : 192.168.1.10
OPC UA Port      : 4840
OPC UA Endpoint  : <configured FANUC OPC UA endpoint>
```

Use the actual values configured on the FANUC controller.

---

# 10. OPC UA Node Configuration

The application uses configured OPC UA Node IDs to retrieve robot information.

Example node configuration:

```json
{
  "robot": {
    "model": "ns=3;i=30005",
    "serial": "ns=3;i=30007",
    "speed": "ns=3;i=30003",
    "mode": "ns=3;i=50003",
    "estop": "ns=3;i=50004",
    "pstop": "ns=3;i=50005",
    "program": "ns=3;i=40016"
  },

  "modbus": {
    "di": "ns=1;i=301",
    "do": "ns=1;i=302",
    "ir": "ns=1;i=303",
    "hr": "ns=1;i=304"
  }
}
```

These Node IDs correspond to the OPC UA nodes configured for the robot.

If the OPC UA server configuration or robot setup changes, the Node IDs may need to be updated.

---

# 11. Start the Application

After installing the dependencies, start the backend from the project directory.

Run:

```bash
npm start
```

The application will start using the `start` script defined in `package.json`.

If required, the server can also be started directly using:

```bash
node server.js
```

Wait for the server to start successfully.

---

# 12. Open the Dashboard

Once the backend is running, open Google Chrome or Microsoft Edge.

On the same computer running the backend, use:

```text
http://localhost:3000
```

If the application is configured to use another port, use the configured port instead.

Example:

```text
http://localhost:<PORT>
```

---

# 13. Connect to the FANUC Robot

After opening the dashboard:

1. Make sure the FANUC controller is powered.
2. Verify the network connection.
3. Verify the robot IP address.
4. Verify the OPC UA server configuration.
5. Start the dashboard backend.
6. Open the dashboard in the browser.
7. Connect to the robot from the dashboard.

Once the connection is successful, the dashboard can retrieve the configured robot information and data.

---

# 14. Robot Status Data

The dashboard can display information such as:

```text
Model
Serial Number
Program
Mode
Speed
Emergency Stop
Protective Stop
```

The backend reads the configured OPC UA nodes and returns the values to the dashboard.

---

# 15. Current Program

The current program is retrieved from the configured FANUC OPC UA Node ID.

Example:

```text
Node ID:
ns=3;i=40016
```

The returned value can be displayed as the current robot program.

Example:

```text
Program: PNS
```

---

# 16. Register Data

The application can retrieve register-related data through the configured nodes.

The current configuration contains:

```text
Digital Inputs (DI)
Digital Outputs (DO)
Input Registers (IR)
Holding Registers (HR)
```

Example configuration:

```text
DI → ns=1;i=301
DO → ns=1;i=302
IR → ns=1;i=303
HR → ns=1;i=304
```

The actual data available depends on the FANUC controller and OPC UA configuration.

---

# 17. OPC UA Namespace Browsing

The application provides functionality to browse the OPC UA namespace.

This can be used to discover available nodes exposed by the FANUC OPC UA server.

The discovered nodes can be searched using the application's node search functionality.

Example namespace structure:

```text
robo
│
├── RobotInformation
│
├── Model
├── SerialNumber
├── Version
├── ServoState
├── OperationState
├── ModeState
├── ProgramSpeed
├── Uptime
├── Torque
├── Position
└── Alarm
```

The exact namespace structure depends on the OPC UA server configuration.

---

# 18. Reading OPC UA Nodes

The application supports reading individual OPC UA nodes.

A Node ID can be supplied to the backend and the application can request its current value.

Example:

```text
ns=3;i=40016
```

A successful response can contain:

```text
success
nodeId
value
dataType
statusCode
sourceTimestamp
serverTimestamp
```

Example:

```text
success: true
nodeId: ns=3;i=40016
value: PNS
dataType: 12
statusCode: Good
```

---

# 19. Reading Multiple Nodes

The application can read multiple OPC UA nodes in one request.

For example:

```text
Model
Serial Number
Speed
Mode
Emergency Stop
Protective Stop
Program
```

This allows the dashboard to retrieve several robot status values together.

---

# 20. OPC UA Subscription / Monitoring

The application supports OPC UA subscriptions for monitoring nodes.

A subscription can be used when continuously monitoring a value is required instead of repeatedly requesting the value manually.

This can be useful for changing robot values and status information.

---

# 21. Writing OPC UA Data

The backend also contains functionality for writing values to OPC UA nodes.

Writing should only be performed on nodes where write access is permitted and where the operation is safe and intended.

Always verify the node, data type, and robot state before performing a write operation.

---

# 22. Digital Output Writing

The application includes functionality for writing digital output values.

This should be used carefully because changing robot I/O can affect the operation of an industrial robot cell.

Before using digital output write functionality:

* Verify the correct robot.
* Verify the correct output.
* Verify the required value.
* Ensure the robot cell is in a safe condition.
* Follow the customer's robot safety procedures.

---

# 23. Accessing the Dashboard from Another Computer

The dashboard can be accessed from another computer on the same network.

For example:

```text
Server PC IP:
192.168.1.100
```

If the application is running on port `3000`, another computer can open:

```text
http://192.168.1.100:3000
```

Do **not** use:

```text
http://localhost:3000
```

on the second computer.

`localhost` refers to the computer on which the browser is currently running.

---

# 24. Allow Network Access

If the dashboard works on the server computer but does not open from another computer, check:

1. Both computers are connected to the same network.
2. The server is running.
3. The server is listening on the required network interface.
4. Windows Firewall allows the application port.
5. The correct server computer IP address is being used.

Example:

```text
Server PC:
192.168.1.100

Client PC:
192.168.1.101
```

The client should access:

```text
http://192.168.1.100:3000
```

---

# 25. Troubleshooting

## Problem: `node` is not recognized

Error:

```text
'node' is not recognized as an internal or external command
```

Solution:

1. Install Node.js LTS.
2. Close and reopen VS Code or Command Prompt.
3. Check:

```bash
node -v
```

---

## Problem: `npm` is not recognized

Error:

```text
'npm' is not recognized as an internal or external command
```

Solution:

Install Node.js LTS and restart the terminal.

Then run:

```bash
npm -v
```

---

## Problem: Dependencies are missing

If you see an error such as:

```text
Cannot find module ...
```

run:

```bash
npm install
```

Then start the application again:

```bash
npm start
```

---

## Problem: Dashboard does not open

First verify that the backend is running.

Run:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

If the configured port is different, use that port.

---

## Problem: Dashboard opens but robot does not connect

Check:

* FANUC controller power
* Ethernet connection
* Robot IP address
* PC IP address
* OPC UA server availability
* OPC UA endpoint
* OPC UA port
* Firewall
* Robot controller configuration

---

## Problem: Dashboard works on the server PC but not another PC

Check that the other PC is using the server computer's IP address.

Correct:

```text
http://192.168.1.100:3000
```

Incorrect:

```text
http://localhost:3000
```

Also check Windows Firewall and network connectivity.

---

# 26. Stopping the Application

To stop the running backend:

Press:

```text
Ctrl + C
```

in the terminal where the server is running.

---

# 27. Starting the Application After Initial Setup

After the first installation, you normally do not need to run `npm install` every time.

To start the dashboard:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

---

# 28. Basic Setup Summary

For a new computer:

```text
1. Install Node.js LTS
        ↓
2. Extract fanuc-dashboard
        ↓
3. Open project in VS Code
        ↓
4. Open Terminal
        ↓
5. Run: npm install
        ↓
6. Configure FANUC OPC UA connection
        ↓
7. Run: npm start
        ↓
8. Open browser
        ↓
9. Open: http://localhost:3000
        ↓
10. Connect to FANUC Robot
```

---

# 29. Project Dependencies

The project uses Node.js packages specified in:

```text
package.json
```

The exact installed dependency versions are recorded in:

```text
package-lock.json
```

Do not manually install individual packages unless required.

Use:

```bash
npm install
```

to install the project dependencies.

---

# 30. Safety Notice

This application interfaces with an industrial robot controller.

Any operation that can write data, change outputs, or otherwise affect the robot should be performed only by authorized personnel.

Before testing write operations:

* Ensure the robot cell is safe.
* Follow FANUC safety procedures.
* Verify the correct robot and Node ID.
* Verify the data type and value.
* Confirm that no unexpected machine movement or cell operation can occur.

The dashboard should be used in accordance with the safety procedures and access policies of the customer's facility.

---

# 31. Quick Start

For users who have already completed the installation:

```bash
cd fanuc-dashboard
npm start
```

Then open:

```text
http://localhost:3000
```

---

# 32. Application Overview

The FANUC OPC UA Dashboard provides a web-based interface between the user and the FANUC robot controller.

The main communication path is:

```text
FANUC Robot
     ↓
FANUC Robot Controller
     ↓
OPC UA Server
     ↓
Backend Application
     ↓
Web Dashboard
     ↓
User Browser
```

The backend manages the OPC UA communication, while the web dashboard provides the user interface for viewing and interacting with the available robot data.

---

# End of README

```

