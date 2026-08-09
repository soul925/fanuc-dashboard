const express = require("express");
const path = require("path");

const apiRoutes = require("./routes/api");

const app = express();

const PORT = process.env.PORT || 3000;
const overviewRoutes = require("./routes/overview");
const ioRoutes = require("./routes/io");
const registerRoutes = require("./routes/registers");
const programRoutes = require("./routes/programs");
const alarmRoutes = require("./routes/alarms");

/*=========================================
    MIDDLEWARE
=========================================*/

app.use(express.json({ limit: "20mb" }));

app.use(express.urlencoded({
    extended: true,
    limit: "20mb"
}));

/*=========================================
    STATIC FILES
=========================================*/

app.use(express.static(path.join(__dirname, "public")));

/*=========================================
    API ROUTES
=========================================*/

app.use("/api", apiRoutes);
app.use("/api/overview", overviewRoutes);
app.use("/api/io", ioRoutes);
app.use("/api/registers", registerRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/alarms", alarmRoutes);
/*=========================================
    HEALTH CHECK
=========================================*/

app.get("/health", (req, res) => {

    res.json({

        success: true,

        status: "Running",

        timestamp: new Date()

    });

});

/*=========================================
    HOME
=========================================*/

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );

});

/*=========================================
    ERROR HANDLER
=========================================*/

app.use((err, req, res, next) => {

    console.error(err);

    res.status(500).json({

        success: false,

        message: err.message

    });

});

/*=========================================
    404
=========================================*/

app.use((req, res) => {

    res.status(404).json({

        success: false,

        message: "Route Not Found"

    });

});

/*=========================================
    START SERVER
=========================================*/

app.listen(PORT, () => {

    console.clear();

    console.log("==========================================");
    console.log("      FANUC OPC UA WEB DASHBOARD");
    console.log("==========================================");
    console.log(` Server : http://localhost:${PORT}`);
    console.log(` Health : http://localhost:${PORT}/health`);
    console.log("==========================================");

});