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
import { getLargeFiles } from "./large-files";

describe("large-files service (getLargeFiles)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty result when no large files match criteria", async () => {
    const mockSelect = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
    vi.mocked(db.select).mockReturnValue(mockSelect as any);

    const res = await getLargeFiles({ minSizeBytes: 104857600 });
    expect(res.totalFiles).toBe(0);
    expect(res.totalSizeBytes).toBe(0);
    expect(res.files).toHaveLength(0);
  });

  it("maps query rows to LargeFileItems and calculates totalSizeBytes correctly", async () => {
    const mockRows = [
      {
        id: 101,
        path: "/Users/test/Downloads/archive.zip",
        sizeBytes: 500000000,
        extension: "zip",
        category: "archive",
        modifiedAt: "2024-01-01T00:00:00.000Z",
        accessedAt: "2024-02-01T00:00:00.000Z",
        createdAt: "2023-12-01T00:00:00.000Z",
      },
      {
        id: 102,
        path: "/Users/test/Movies/raw_footage.mp4",
        sizeBytes: 1500000000,
        extension: "mp4",
        category: "video",
        modifiedAt: "2024-01-15T00:00:00.000Z",
        accessedAt: "2024-02-10T00:00:00.000Z",
        createdAt: "2024-01-10T00:00:00.000Z",
      },
    ];

    const mockSelect = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockRows),
          }),
        }),
      }),
    };
    vi.mocked(db.select).mockReturnValue(mockSelect as any);

    const res = await getLargeFiles({
      minSizeBytes: 52428800,
      sortBy: "size",
      sortOrder: "desc",
    });

    expect(res.totalFiles).toBe(2);
    expect(res.totalSizeBytes).toBe(2000000000);
    expect(res.files[0].fileId).toBe(101);
    expect(res.files[0].path).toBe("/Users/test/Downloads/archive.zip");
    expect(res.files[1].category).toBe("video");
  });
});
