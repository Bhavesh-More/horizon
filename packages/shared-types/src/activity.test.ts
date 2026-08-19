import { describe, expect, it } from "vitest";
import {
  ActivityItemSchema,
  ActivityListRequestSchema,
  ActivityListResponseSchema,
  ActivityOpenTrashResponseSchema,
} from "./activity";

describe("Activity schemas", () => {
  it("validates list request with default limit", () => {
    const parsed = ActivityListRequestSchema.parse(undefined);
    expect(parsed).toBeUndefined();

    const withLimit = ActivityListRequestSchema.parse({ limit: 50 });
    expect(withLimit?.limit).toBe(50);
  });

  it("validates activity item schema", () => {
    const item = {
      id: "scan-1",
      type: "scan" as const,
      title: "Scope Scan",
      description: "Scanned 120 files (45 MB)",
      timestamp: "2026-08-19T10:00:00.000Z",
      status: "complete" as const,
      bytesAffected: 47185920,
      fileCount: 120,
      paths: ["/Users/example/Downloads"],
      relatedArchiveId: null,
      undoAvailable: false,
      undoLabel: null,
    };

    const parsed = ActivityItemSchema.parse(item);
    expect(parsed.id).toBe("scan-1");
    expect(parsed.type).toBe("scan");
    expect(parsed.bytesAffected).toBe(47185920);
  });

  it("validates trash activity item with undo affordance", () => {
    const item = {
      id: "cleanup-12",
      type: "trash" as const,
      title: "Files Moved to Trash",
      description: "3 files moved to OS Trash (12 MB)",
      timestamp: "2026-08-19T10:30:00.000Z",
      status: "complete" as const,
      bytesAffected: 12582912,
      fileCount: 3,
      paths: [
        "/Users/example/Downloads/a.zip",
        "/Users/example/Downloads/b.zip",
      ],
      relatedArchiveId: null,
      undoAvailable: true,
      undoLabel: "Open Trash",
    };

    const parsed = ActivityItemSchema.parse(item);
    expect(parsed.type).toBe("trash");
    expect(parsed.undoAvailable).toBe(true);
    expect(parsed.undoLabel).toBe("Open Trash");
  });

  it("validates list response structure", () => {
    const response = {
      items: [
        {
          id: "cleanup-1",
          type: "archive" as const,
          title: "Files Archived",
          description: "4 files compressed into archive bundle",
          timestamp: "2026-08-19T11:00:00.000Z",
          status: "complete" as const,
          bytesAffected: 1048576,
          fileCount: 4,
          paths: ["/Users/example/Documents/report.pdf"],
          relatedArchiveId: 1,
          undoAvailable: false,
          undoLabel: null,
        },
      ],
      totalItems: 1,
      totalScans: 0,
      totalActions: 1,
      totalBytesAffected: 1048576,
    };

    const parsed = ActivityListResponseSchema.parse(response);
    expect(parsed.totalItems).toBe(1);
    expect(parsed.totalActions).toBe(1);
  });

  it("validates open trash response", () => {
    const parsed = ActivityOpenTrashResponseSchema.parse({ success: true });
    expect(parsed.success).toBe(true);
  });
});
