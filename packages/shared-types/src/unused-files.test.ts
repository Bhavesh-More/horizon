import { describe, it, expect } from "vitest";
import {
  UnusedFilesListRequestSchema,
  UnusedFileItemSchema,
  UnusedFileGroupSchema,
  UnusedFilesListResponseSchema,
} from "./unused-files";

describe("Unused files schemas", () => {
  describe("UnusedFilesListRequestSchema", () => {
    it("accepts valid request with default threshold", () => {
      const parsed = UnusedFilesListRequestSchema.parse({});
      expect(parsed.thresholdDays).toBe(180);
      expect(parsed.category).toBeUndefined();
    });

    it("accepts valid custom threshold and category", () => {
      const parsed = UnusedFilesListRequestSchema.parse({
        thresholdDays: 365,
        category: "video",
        scanRunId: 12,
      });
      expect(parsed.thresholdDays).toBe(365);
      expect(parsed.category).toBe("video");
      expect(parsed.scanRunId).toBe(12);
    });

    it("rejects threshold below 30 days", () => {
      expect(() =>
        UnusedFilesListRequestSchema.parse({ thresholdDays: 10 })
      ).toThrow();
    });

    it("rejects threshold above 730 days", () => {
      expect(() =>
        UnusedFilesListRequestSchema.parse({ thresholdDays: 800 })
      ).toThrow();
    });

    it("rejects non-integer threshold", () => {
      expect(() =>
        UnusedFilesListRequestSchema.parse({ thresholdDays: 180.5 })
      ).toThrow();
    });
  });

  describe("UnusedFileItemSchema & UnusedFilesListResponseSchema", () => {
    it("validates full unused files response structure", () => {
      const response = {
        groups: [
          {
            category: "document" as const,
            fileCount: 1,
            totalSizeBytes: 1048576,
            files: [
              {
                fileId: 1,
                path: "/Users/test/Documents/report.pdf",
                sizeBytes: 1048576,
                extension: "pdf",
                category: "document" as const,
                lastActivity: "2023-01-01T00:00:00.000Z",
                usedFallback: false,
              },
            ],
          },
        ],
        totalFiles: 1,
        totalReclaimableBytes: 1048576,
      };

      const parsed = UnusedFilesListResponseSchema.parse(response);
      expect(parsed.groups).toHaveLength(1);
      expect(parsed.groups[0].files[0].usedFallback).toBe(false);
      expect(parsed.totalFiles).toBe(1);
    });
  });
});
