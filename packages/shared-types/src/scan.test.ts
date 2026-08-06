import { describe, it, expect } from "vitest";
import {
  ScanStartRequest,
  ScanProgressEvent,
  FileItemSchema,
  GetLatestScanResponseSchema,
} from "./scan";

describe("Scan Zod Schemas", () => {
  it("validates ScanStartRequest correctly", () => {
    const valid = ScanStartRequest.parse({ scope: ["/Users/test/Documents"] });
    expect(valid.scope).toEqual(["/Users/test/Documents"]);

    expect(() => ScanStartRequest.parse({ scope: "not-an-array" })).toThrow();
  });

  it("validates FileItemSchema correctly", () => {
    const validFile = FileItemSchema.parse({
      path: "/test/image.png",
      sizeBytes: 1024,
      category: "image",
      extension: ".png",
    });
    expect(validFile.category).toBe("image");
    expect(validFile.sizeBytes).toBe(1024);
  });

  it("validates ScanProgressEvent correctly", () => {
    const validProgress = ScanProgressEvent.parse({
      event: "started",
      scanRunId: 1,
    });
    expect(validProgress.event).toBe("started");
    expect(validProgress.scanRunId).toBe(1);
  });

  it("validates GetLatestScanResponseSchema correctly", () => {
    const response = GetLatestScanResponseSchema.parse({
      scanRun: {
        id: 1,
        startedAt: "2026-08-07T00:00:00Z",
        completedAt: "2026-08-07T00:01:00Z",
        status: "complete",
        totalFiles: 10,
        totalBytes: 5000,
      },
      recentFiles: [
        {
          path: "/test/file.txt",
          sizeBytes: 500,
          category: "document",
        },
      ],
      categories: {
        document: { files: 1, bytes: 500 },
      },
    });
    expect(response.scanRun?.id).toBe(1);
    expect(response.recentFiles.length).toBe(1);
  });
});
