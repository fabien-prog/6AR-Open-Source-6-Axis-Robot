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
    const serverApp = express();
    // Point at the external “public” folder:
    const resources = process.resourcesPath;

    serverApp.use(
      "/public",
      express.static(path.join(resources, "public"))
    );
    // Point at the external “build” folder:
    serverApp.use(express.static(path.join(resources, "build")));
    serverApp.get("*", (req, res) => {
      res.sendFile(path.join(resources, "build", "index.html"));
    });

    staticServer = serverApp.listen(8765, () => {
      mainWindow.loadURL("http://localhost:8765");
    });
  } else {
    // Dev mode
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
