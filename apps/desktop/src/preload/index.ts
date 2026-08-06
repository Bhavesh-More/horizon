import { contextBridge, ipcRenderer } from "electron";
import {
  AppPingRequestSchema,
  AppPingResponseSchema,
} from "@horizon/shared-types";

contextBridge.exposeInMainWorld("horizon", {
  ping: async () => {
    const response = await ipcRenderer.invoke(
      "app:ping",
      AppPingRequestSchema.parse({}),
    );

    return AppPingResponseSchema.parse(response);
  },
});
