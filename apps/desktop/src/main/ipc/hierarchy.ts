/**
 * hierarchy.ts
 * Owns: IPC handlers for Disk Hierarchy scanning, drive discovery, and folder picking.
 * Upholds:
 * - Invariant I-8: typed IPC boundary.
 * - Invariant I-15: runtime Zod validation of all incoming payloads.
 */
import { dialog, ipcMain } from "electron";
import {
  HierarchyScanDirectoryRequestSchema,
} from "@horizon/shared-types";
import {
  listAvailableDrives,
  scanDirectoryHierarchy,
} from "../services/hierarchy";

export function registerHierarchyIpc() {
  ipcMain.handle("hierarchy:listDrives", async () => {
    try {
      const data = await listAvailableDrives();
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "HIERARCHY_LIST_DRIVES_FAILED",
          message: err.message || "Failed to list available drives",
        },
      };
    }
  });

  ipcMain.handle("hierarchy:scanDirectory", async (_event, payload: unknown) => {
    try {
      const validated = HierarchyScanDirectoryRequestSchema.parse(payload);
      const data = await scanDirectoryHierarchy(validated);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "HIERARCHY_SCAN_FAILED",
          message: err.message || "Failed to scan directory hierarchy",
        },
      };
    }
  });

  ipcMain.handle("hierarchy:pickDirectory", async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        title: "Select Folder to Analyze",
      });

      if (result.canceled || result.filePaths.length === 0) {
        return {
          ok: true,
          data: {
            canceled: true,
            selectedPath: null,
          },
        };
      }

      return {
        ok: true,
        data: {
          canceled: false,
          selectedPath: result.filePaths[0],
        },
      };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "HIERARCHY_PICK_DIRECTORY_FAILED",
          message: err.message || "Failed to open folder picker",
        },
      };
    }
  });
}
