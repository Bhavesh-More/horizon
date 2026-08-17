import {
  GetLatestScanResponse,
  ScanProgressEvent,
  CleanupTrashResponse,
  DuplicatesListResponse,
  DuplicateDetectionProgress,
  UnusedFilesListResponse,
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
    };
  }
}



