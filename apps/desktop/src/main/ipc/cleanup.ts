import { ipcMain } from "electron";
import { CleanupTrashRequestSchema } from "@horizon/shared-types";
import { processTrashCleanup } from "../services/cleanup";

export function registerCleanupIpc() {
  ipcMain.handle("cleanup:trash", async (_event, payload: unknown) => {
    try {
      const validated = CleanupTrashRequestSchema.parse(payload);
      const data = await processTrashCleanup(validated.fileIds);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "CLEANUP_TRASH_FAILED",
          message: err.message || "Failed to execute trash cleanup",
        },
      };
    }
  });
}
