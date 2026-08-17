import { ipcMain } from "electron";
import { UnusedFilesListRequestSchema } from "@horizon/shared-types";
import { getUnusedFiles } from "../services/staleness";

export function registerUnusedFilesIpc() {
  ipcMain.handle("unused-files:list", async (_event, payload: unknown) => {
    try {
      const raw = payload && typeof payload === "object" ? { ...(payload as any) } : {};
      if (raw.category === "all") delete raw.category;
      const validated = UnusedFilesListRequestSchema.parse(raw);
      const data = await getUnusedFiles(
        validated.thresholdDays,
        validated.category,
        validated.scanRunId
      );
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "UNUSED_FILES_LIST_FAILED",
          message: err.message || "Failed to fetch unused files",
        },
      };
    }
  });
}
