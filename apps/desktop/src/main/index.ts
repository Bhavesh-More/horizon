import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import {
  AppPingRequestSchema,
  AppPingResponseSchema,
} from "@horizon/shared-types";
import { runMigrations } from "./db/migrate";
import { registerScanIpc } from "./ipc/scan";
import { registerCleanupIpc } from "./ipc/cleanup";
import { registerDuplicatesIpc } from "./ipc/duplicates";
import { registerUnusedFilesIpc } from "./ipc/unused-files";
import { registerLargeFilesIpc } from "./ipc/large-files";
import { registerSystemIpc } from "./ipc/system";
import { registerAiProviderIpc } from "./ipc/ai-provider";
import { registerForecastIpc } from "./ipc/forecast";
import { initSnapshotScheduler, bootstrapHistory } from "./services/scheduler";


function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 980,
    maxWidth: 980,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

ipcMain.handle("app:ping", (_event, payload: unknown) => {
  AppPingRequestSchema.parse(payload);
  return AppPingResponseSchema.parse("pong");
});

app.whenReady().then(() => {
  runMigrations();
  initSnapshotScheduler();
  bootstrapHistory();
  registerScanIpc();
  registerCleanupIpc();
  registerDuplicatesIpc();
  registerUnusedFilesIpc();
  registerLargeFilesIpc();
  registerSystemIpc();
  registerAiProviderIpc();
  registerForecastIpc();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

