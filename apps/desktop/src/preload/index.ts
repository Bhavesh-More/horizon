import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import {
  AppPingRequestSchema,
  AppPingResponseSchema,
  ScanStartRequest,
  ScanProgressEvent,
  CleanupTrashRequestSchema,
  DuplicateDetectionProgressSchema,
  RecommendationGenerationEventSchema,
  AssistantChatRequestSchema,
  AssistantStreamEventSchema,
  ArchiveContentsRequestSchema,
  ArchiveCreateRequestSchema,
  ArchiveListRequestSchema,
  ArchiveRestoreRequestSchema,
  RecommendationsDismissRequestSchema,
  RecommendationsGetActiveRequestSchema,
  RecommendationsGetByIdRequestSchema,
  RecommendationsRegenerateRequestSchema,
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
  recommendations: {
    getActive: async (scanRunId?: number) => {
      const payload = RecommendationsGetActiveRequestSchema.parse(
        scanRunId ? { scanRunId } : {}
      );
      return await ipcRenderer.invoke("recommendations:getActive", payload);
    },
    regenerate: async (scanRunId?: number) => {
      const payload = RecommendationsRegenerateRequestSchema.parse(
        scanRunId ? { scanRunId } : {}
      );
      return await ipcRenderer.invoke("recommendations:regenerate", payload);
    },
    dismiss: async (recommendationId: number) => {
      const payload = RecommendationsDismissRequestSchema.parse({ recommendationId });
      return await ipcRenderer.invoke("recommendations:dismiss", payload);
    },
    getById: async (recommendationId: number) => {
      const payload = RecommendationsGetByIdRequestSchema.parse({ recommendationId });
      return await ipcRenderer.invoke("recommendations:getById", payload);
    },
    onGenerationEvent: (
      callback: (event: unknown) => void
    ) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => {
        const parsed = RecommendationGenerationEventSchema.safeParse(data);
        if (parsed.success) callback(parsed.data);
      };
      ipcRenderer.on("recommendations:generation", listener);
      return () => {
        ipcRenderer.removeListener("recommendations:generation", listener);
      };
    },
  },
  assistant: {
    chat: async (message: string, scanRunId?: number) => {
      const payload = AssistantChatRequestSchema.parse(
        scanRunId ? { message, scanRunId } : { message }
      );
      return await ipcRenderer.invoke("assistant:chat", payload);
    },
    onStream: (callback: (event: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => {
        const parsed = AssistantStreamEventSchema.safeParse(data);
        if (parsed.success) callback(parsed.data);
      };
      ipcRenderer.on("assistant:stream", listener);
      return () => {
        ipcRenderer.removeListener("assistant:stream", listener);
      };
    },
  },
  archive: {
    create: async (fileIds: number[], destinationDir?: string) => {
      const payload = ArchiveCreateRequestSchema.parse(
        destinationDir ? { fileIds, destinationDir } : { fileIds }
      );
      return await ipcRenderer.invoke("archive:create", payload);
    },
    list: async () => {
      const payload = ArchiveListRequestSchema.parse({});
      return await ipcRenderer.invoke("archive:list", payload);
    },
    contents: async (archiveId: number) => {
      const payload = ArchiveContentsRequestSchema.parse({ archiveId });
      return await ipcRenderer.invoke("archive:contents", payload);
    },
    restore: async (archiveId: number, restoreRoot?: string) => {
      const payload = ArchiveRestoreRequestSchema.parse(
        restoreRoot ? { archiveId, restoreRoot } : { archiveId }
      );
      return await ipcRenderer.invoke("archive:restore", payload);
    },
  },
});
