import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import {
  AppPingRequestSchema,
  AppPingResponseSchema,
  ScanStartRequest,
  ScanProgressEvent,
} from "@horizon/shared-types";

contextBridge.exposeInMainWorld("horizon", {
  ping: async () => {
    const response = await ipcRenderer.invoke(
      "app:ping",
      AppPingRequestSchema.parse({})
    );
    return AppPingResponseSchema.parse(response);
  },
  scan: {
    start: async (scope: string[]) => {
      const payload = ScanStartRequest.parse({ scope });
      return await ipcRenderer.invoke("scan:start", payload);
    },
    getLatest: async () => {
      return await ipcRenderer.invoke("scan:getLatest");
    },
    onProgress: (callback: (event: ScanProgressEvent) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => {
        const parsed = ScanProgressEvent.safeParse(data);
        if (parsed.success) {
          callback(parsed.data);
        }
      };
      ipcRenderer.on("scan:progress", listener);
      return () => {
        ipcRenderer.removeListener("scan:progress", listener);
      };
    },
  },
});

