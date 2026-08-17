import { ipcMain, shell } from "electron";
import { SystemShowInFolderRequestSchema } from "@horizon/shared-types";

export function registerSystemIpc() {
  ipcMain.handle("system:showInFolder", async (_event, payload: unknown) => {
    try {
      const validated = SystemShowInFolderRequestSchema.parse(payload);
      shell.showItemInFolder(validated.path);
      return { ok: true, data: { success: true } };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "SYSTEM_SHOW_FAILED",
          message: err.message || "Failed to reveal file in folder",
        },
      };
    }
  });
}
