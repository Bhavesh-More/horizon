import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Electron app path before DB client import
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/horizon_test_userdata"),
  },
}));

// Mock DB client
vi.mock("../db/client", () => {
  const mockDb = {
    select: vi.fn(),
  };
  return { db: mockDb };
});

import { db } from "../db/client";
import { getUnusedFiles } from "./staleness";

describe("staleness service (getUnusedFiles)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty groups when no matching files exist", async () => {
    const mockSelect = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    };
    vi.mocked(db.select).mockReturnValue(mockSelect as any);

    const res = await getUnusedFiles(180);
    expect(res.totalFiles).toBe(0);
    expect(res.totalReclaimableBytes).toBe(0);
    expect(res.groups).toHaveLength(0);
  });

  it("groups files by category and marks usedFallback correctly when accessedAt is null", async () => {
    const mockRows = [
      {
        id: 1,
        path: "/Users/test/Downloads/old_video.mp4",
        sizeBytes: 50000000,
        extension: "mp4",
        category: "video",
        createdAt: "2023-01-01T00:00:00.000Z",
        modifiedAt: "2023-02-01T00:00:00.000Z",
        accessedAt: "2023-03-01T00:00:00.000Z",
      },
      {
        id: 2,
        path: "/Users/test/Documents/old_report.pdf",
        sizeBytes: 2000000,
        extension: "pdf",
        category: "document",
        createdAt: "2022-01-01T00:00:00.000Z",
        modifiedAt: "2022-05-01T00:00:00.000Z",
        accessedAt: null, // noatime fallback case
      },
      {
        id: 3,
        path: "/Users/test/Documents/archive_data.docx",
        sizeBytes: 3000000,
        extension: "docx",
        category: "document",
        createdAt: "2021-01-01T00:00:00.000Z",
        modifiedAt: "2021-06-01T00:00:00.000Z",
        accessedAt: "2021-07-01T00:00:00.000Z",
      },
    ];

    const mockSelect = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(mockRows),
        }),
      }),
    };
    vi.mocked(db.select).mockReturnValue(mockSelect as any);

    const res = await getUnusedFiles(180);

    expect(res.totalFiles).toBe(3);
    expect(res.totalReclaimableBytes).toBe(55000000);
    expect(res.groups).toHaveLength(2);

    // Group 1: video (50MB) should come before document (5MB) due to totalSizeBytes desc sorting
    expect(res.groups[0].category).toBe("video");
    expect(res.groups[0].fileCount).toBe(1);
    expect(res.groups[0].totalSizeBytes).toBe(50000000);
    expect(res.groups[0].files[0].usedFallback).toBe(false);

    // Group 2: document
    expect(res.groups[1].category).toBe("document");
    expect(res.groups[1].fileCount).toBe(2);
    expect(res.groups[1].totalSizeBytes).toBe(5000000);

    // File 2 in document group should have usedFallback = true because accessedAt was null
    const file2 = res.groups[1].files.find((f) => f.fileId === 2);
    expect(file2?.usedFallback).toBe(true);
    expect(file2?.lastActivity).toBe("2022-05-01T00:00:00.000Z");

    // File 3 should have usedFallback = false
    const file3 = res.groups[1].files.find((f) => f.fileId === 3);
    expect(file3?.usedFallback).toBe(false);
  });
});
