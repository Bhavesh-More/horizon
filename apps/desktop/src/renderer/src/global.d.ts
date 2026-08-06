import { GetLatestScanResponse, ScanProgressEvent } from "@horizon/shared-types";

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
    };
  }
}

