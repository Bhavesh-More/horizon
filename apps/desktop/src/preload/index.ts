import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import {
  AppPingRequestSchema,
  AppPingResponseSchema,
  ScanStartRequest,
  ScanProgressEvent,
  CleanupTrashRequestSchema,
  DuplicateDetectionProgressSchema,
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
        if (data && typeof data === "object" && "event" in (data as any)) {
          callback(data as ScanProgressEvent);
        }
      };
      ipcRenderer.on("scan:progress", listener);
      return () => {
        ipcRenderer.removeListener("scan:progress", listener);
      };
    },
  },
  cleanup: {
    trash: async (fileIds: number[]) => {
      const payload = CleanupTrashRequestSchema.parse({ fileIds });
      return await ipcRenderer.invoke("cleanup:trash", payload);
    },
  },
  duplicates: {
    list: async (scanRunId?: number, hashType?: string) => {
      const cleanType = !hashType || hashType === "all" ? undefined : hashType;
      return await ipcRenderer.invoke("duplicates:list", { scanRunId, hashType: cleanType });
    },
    start: async (scanRunId?: number) => {
      return await ipcRenderer.invoke("duplicates:start", scanRunId);
    },
    isRunning: async () => {
      return await ipcRenderer.invoke("duplicates:isRunning");
    },
    onProgress: (callback: (event: any) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => {
        if (data && typeof data === "object" && "event" in (data as any)) {
          callback(data);
        }
      };
      ipcRenderer.on("duplicates:progress", listener);
      return () => {
        ipcRenderer.removeListener("duplicates:progress", listener);
      };
    },
  },
  unusedFiles: {
    list: async (thresholdDays: number = 180, category?: string, scanRunId?: number) => {
      const cleanCategory = !category || category === "all" ? undefined : category;
      return await ipcRenderer.invoke("unused-files:list", { thresholdDays, category: cleanCategory, scanRunId });
    },
  },
  largeFiles: {
    list: async (options?: {
      minSizeBytes?: number;
      category?: string;
      sortBy?: "size" | "date" | "name";
      sortOrder?: "asc" | "desc";
      limit?: number;
      scanRunId?: number;
    }) => {
      const cleanCategory =
        !options?.category || options.category === "all" ? undefined : options.category;
      return await ipcRenderer.invoke("large-files:list", {
        ...options,
        category: cleanCategory,
      });
    },
  },
  system: {
    showInFolder: async (path: string) => {
      return await ipcRenderer.invoke("system:showInFolder", { path });
    },
  },
  aiProvider: {
    getStatus: async () => {
      return await ipcRenderer.invoke("ai-provider:getStatus");
    },
    listOllamaModels: async () => {
      return await ipcRenderer.invoke("ai-provider:listOllamaModels");
    },
    configure: async (payload: unknown) => {
      return await ipcRenderer.invoke("ai-provider:configure", payload);
    },
    select: async (provider: string) => {
      return await ipcRenderer.invoke("ai-provider:select", { provider });
    },
    test: async (payload: unknown) => {
      return await ipcRenderer.invoke("ai-provider:test", payload);
    },
  },
  forecast: {
    get: async (category?: string) => {
      return await ipcRenderer.invoke("forecast:get", { category });
    },
    whatIf: async (adjustments: Array<{ category: string; bytesToRemove: number }>) => {
      return await ipcRenderer.invoke("forecast:whatIf", { adjustments });
    },
  },
});



