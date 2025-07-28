const { app, BrowserWindow } = require("electron");
const path = require("path");

let mainWindow;

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Allow require() in renderer
    },
  });

  // Load React app in development or production
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "build", "index.html")); // For production
  } else {
    mainWindow.loadURL("http://localhost:3000"); // For development
  }

  // Open DevTools (optional)
  mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

app.whenReady().then(createMainWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
