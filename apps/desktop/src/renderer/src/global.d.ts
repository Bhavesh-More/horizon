import {
  GetLatestScanResponse,
  ScanProgressEvent,
  CleanupTrashResponse,
  DuplicatesListResponse,
  DuplicateDetectionProgress,
  UnusedFilesListResponse,
  AiProviderStatusResponse,
  AiProviderConfigureRequest,
  AiProviderTestResponse,
  AiProviderListOllamaModelsResponse,
  ForecastGetResponse,
  ForecastWhatIfResponse,
} from "@horizon/shared-types";

export {};
declare global {
  interface Window {
    horizon: {
      ping: () => Promise<"pong">;
      scan: {
        start: (scope: string[]) => Promise<{ ok: boolean; data?: { scanRunId: number }; error?: any }>;
        getLatest: () => Promise<{ ok: boolean; data?: GetLatestScanResponse; error?: any }>;
        onProgress: (callback: (event: ScanProgressEvent) => void) => () => void;
      };
      cleanup: {
        trash: (fileIds: number[]) => Promise<{ ok: boolean; data?: CleanupTrashResponse; error?: any }>;
      };
      duplicates: {
        list: (scanRunId?: number, hashType?: string) => Promise<{ ok: boolean; data?: DuplicatesListResponse; error?: any }>;
        start: (scanRunId?: number) => Promise<{ ok: boolean; data?: { groupsCount: number }; error?: any }>;
        isRunning: () => Promise<{ ok: boolean; data?: boolean }>;
        onProgress: (callback: (event: DuplicateDetectionProgress) => void) => () => void;
      };
      unusedFiles: {
        list: (thresholdDays?: number, category?: string, scanRunId?: number) => Promise<{ ok: boolean; data?: UnusedFilesListResponse; error?: any }>;
      };
      largeFiles: {
        list: (options?: {
          minSizeBytes?: number;
          category?: string;
          sortBy?: "size" | "date" | "name";
          sortOrder?: "asc" | "desc";
          limit?: number;
          scanRunId?: number;
        }) => Promise<{ ok: boolean; data?: LargeFilesListResponse; error?: any }>;
      };
      system: {
        showInFolder: (path: string) => Promise<{ ok: boolean; data?: { success: boolean }; error?: any }>;
      };
      aiProvider: {
        getStatus: () => Promise<{ ok: boolean; data?: AiProviderStatusResponse; error?: any }>;
        listOllamaModels: () => Promise<{ ok: boolean; data?: AiProviderListOllamaModelsResponse; error?: any }>;
        configure: (payload: AiProviderConfigureRequest) => Promise<{ ok: boolean; data?: { success: boolean; message?: string }; error?: any }>;
        select: (provider: string) => Promise<{ ok: boolean; data?: { success: boolean }; error?: any }>;
        test: (payload: { provider: string; model: string; apiKey?: string; baseUrl?: string }) => Promise<{ ok: boolean; data?: AiProviderTestResponse; error?: any }>;
      };
      forecast: {
        get: (category?: string) => Promise<{ ok: boolean; data?: ForecastGetResponse; error?: any }>;
        whatIf: (adjustments: Array<{ category: string; bytesToRemove: number }>) => Promise<{ ok: boolean; data?: ForecastWhatIfResponse; error?: any }>;
      };
    };
  }
}



