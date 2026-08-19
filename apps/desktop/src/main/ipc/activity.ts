import { ipcMain } from "electron";
import {
  ActivityListRequestSchema,
  ActivityOpenTrashRequestSchema,
} from "@horizon/shared-types";
import { getActivityList, openOsTrash } from "../services/activity";

export function registerActivityIpc() {
  ipcMain.handle("activity:list", async (_event, payload: unknown) => {
    try {
      const validated = ActivityListRequestSchema.parse(payload);
      const data = await getActivityList(validated?.limit);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "ACTIVITY_LIST_FAILED",
          message: err.message || "Failed to load activity list",
        },
      };
    }
  });

  ipcMain.handle("activity:openTrash", async (_event, payload: unknown) => {
    try {
      ActivityOpenTrashRequestSchema.parse(payload ?? {});
      const success = await openOsTrash();
      return { ok: true, data: { success } };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "ACTIVITY_OPEN_TRASH_FAILED",
          message: err.message || "Failed to open OS trash",
        },
      };
    }
  });
}
