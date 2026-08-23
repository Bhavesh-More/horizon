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
import { registerRecommendationsIpc } from "./ipc/recommendations";
import { registerAssistantIpc } from "./ipc/assistant";
import { registerArchiveIpc } from "./ipc/archive";
import { registerActivityIpc } from "./ipc/activity";
import { registerSettingsIpc } from "./ipc/settings";
import { registerHierarchyIpc } from "./ipc/hierarchy";
import { initSnapshotScheduler, bootstrapHistory } from "./services/scheduler";


function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 840,
    minHeight: 560,
    show: false,
    backgroundColor: "#15161a",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
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
  registerRecommendationsIpc();
  registerAssistantIpc();
  registerArchiveIpc();
  registerActivityIpc();
  registerSettingsIpc();
  registerHierarchyIpc();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
