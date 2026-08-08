import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Electron app path before DB client import
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/horizon_test_userdata"),
  },
}));

// Mock trash package before service import
vi.mock("trash", () => ({
  default: vi.fn(),
}));

// Mock DB client
vi.mock("../db/client", () => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };
  return { db: mockDb };
});

import { db } from "../db/client";
import trash from "trash";
import { processTrashCleanup } from "./cleanup";

describe("cleanup service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty result if no fileIds provided", async () => {
    const res = await processTrashCleanup([]);
    expect(res.trashedCount).toBe(0);
    expect(res.results).toHaveLength(0);
  });

  it("handles empty database lookup results", async () => {
    const mockSelect = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    };
    vi.mocked(db.select).mockReturnValue(mockSelect as any);

    const res = await processTrashCleanup([101, 102]);
    expect(res.trashedCount).toBe(0);
    expect(res.failedCount).toBe(2);
  });

  it("validates paths, trashes approved files, updates DB, and inserts audit log", async () => {
    const mockFiles = [
      {
        id: 1,
        path: "/Users/testuser/Downloads/sample1.png",
        sizeBytes: 1024,
        removedAt: null,
      },
      {
        id: 2,
        path: "/System/Library/CoreServices/test.bundle",
        sizeBytes: 2048,
        removedAt: null,
      },
    ];

    const mockSelect = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockFiles),
      }),
    };
    vi.mocked(db.select).mockReturnValue(mockSelect as any);

    vi.mocked(trash).mockResolvedValue(undefined);

    const mockUpdate = {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    };
    vi.mocked(db.update).mockReturnValue(mockUpdate as any);

    const mockInsert = {
      values: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(db.insert).mockReturnValue(mockInsert as any);

    const res = await processTrashCleanup([1, 2]);

    expect(res.trashedCount).toBe(1);
    expect(res.blockedCount).toBe(1);
    expect(res.freedBytes).toBe(1024);

    // Verify DB soft-delete update was called for file 1
    expect(db.update).toHaveBeenCalledTimes(1);

    // Verify cleanup_actions audit log record was inserted
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(mockInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "trash",
        bytesFreed: 1024,
      })
    );
  });
});
