import { ipcMain } from "electron";
import { DuplicatesListRequestSchema } from "@horizon/shared-types";
import { getDuplicateGroups, runDuplicateDetection, isDetectionRunning } from "../services/hashing";
import { startScan } from "../services/scanner";

export function registerDuplicatesIpc() {
  ipcMain.handle("duplicates:list", async (_event, payload: unknown) => {
    try {
      const raw = payload && typeof payload === "object" ? { ...(payload as any) } : {};
      if (raw.hashType === "all") delete raw.hashType;
      const validated = DuplicatesListRequestSchema.parse(raw);
      const hashTypeFilter = validated.hashType === "all" ? undefined : validated.hashType;
      const data = await getDuplicateGroups(validated.scanRunId, hashTypeFilter);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "DUPLICATES_LIST_FAILED",
          message: err.message || "Failed to fetch duplicate groups",
        },
      };
    }
  });

  ipcMain.handle("duplicates:start", async (_event, scanRunId?: number) => {
    try {
      if (scanRunId) {
        const result = await runDuplicateDetection(scanRunId);
        return { ok: true, data: result };
      }

      // Re-scan disk scope first to ensure newly pasted or copied files are indexed into file_index
      // scanner.ts triggers duplicate detection after all rows are committed.
      await startScan([
        "Documents",
        "Desktop",
        "Downloads",
        "Pictures",
        "Movies",
        "Music",
      ]);
      return { ok: true, data: { groupsCount: 0 } };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "DUPLICATES_START_FAILED",
          message: err.message || "Failed to run duplicate detection",
        },
      };
    }
  });

  ipcMain.handle("duplicates:isRunning", () => {
    return { ok: true, data: isDetectionRunning() };
  });
}
