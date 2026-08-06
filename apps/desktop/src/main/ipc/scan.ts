/**
 * ipc/scan.ts
 * IPC handlers for scan operations.
 * Responsibilities & Invariants:
 * - Validates incoming IPC payloads against Zod schemas from @horizon/shared-types (Invariant I-15).
 * - Delegates business logic to scanner service (services/scanner.ts).
 */

import { ipcMain } from "electron";
import { ScanStartRequest } from "@horizon/shared-types";
import { startScan, getLatestScan } from "../services/scanner";

export function registerScanIpc() {
  ipcMain.handle("scan:start", async (_event, payload) => {
    try {
      const validated = ScanStartRequest.parse(payload);
      const result = await startScan(validated.scope);
      return { ok: true, data: result };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "SCAN_START_FAILED",
          message: err.message || "Failed to start scan",
        },
      };
    }
  });

  ipcMain.handle("scan:getLatest", async () => {
    try {
      const data = await getLatestScan();
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "SCAN_GET_LATEST_FAILED",
          message: err.message || "Failed to fetch latest scan",
        },
      };
    }
  });
}
