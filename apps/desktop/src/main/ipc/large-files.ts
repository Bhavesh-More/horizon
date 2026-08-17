import { ipcMain } from "electron";
import { LargeFilesListRequestSchema } from "@horizon/shared-types";
import { getLargeFiles } from "../services/large-files";

export function registerLargeFilesIpc() {
  ipcMain.handle("large-files:list", async (_event, payload: unknown) => {
    try {
      const raw = payload && typeof payload === "object" ? { ...(payload as any) } : {};
      if (raw.category === "all") delete raw.category;
      const validated = LargeFilesListRequestSchema.parse(raw);
      const data = await getLargeFiles(validated);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "LARGE_FILES_LIST_FAILED",
          message: err.message || "Failed to fetch large files",
        },
      };
    }
  });
}
