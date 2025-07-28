// main.js
const { app, BrowserWindow } = require("electron");
const path = require("path");
const express = require("express");

let mainWindow;
let staticServer;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (app.isPackaged) {
    // In production, spin up a tiny Express server:
    const serverApp = express();

    // 1) Serve /public/* directly from your public folder
    serverApp.use(
      "/public",
      express.static(path.join(__dirname, "public"))
    );

    // 2) Serve everything else from build/
    serverApp.use(express.static(path.join(__dirname, "build")));

    // 3) Always return index.html for HTML5 history
    serverApp.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "build", "index.html"));
    });

    // Pick any free port (8765 here)
    staticServer = serverApp.listen(8765, () => {
      mainWindow.loadURL("http://localhost:8765");
    });

  } else {
    // In development, just point at React's dev server:
    mainWindow.loadURL("http://localhost:3000");
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createMainWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (staticServer) staticServer.close();
    app.quit();
  }
});
