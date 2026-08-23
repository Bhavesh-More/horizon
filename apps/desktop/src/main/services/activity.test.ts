import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  shell: {
    openTrash: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(""),
  },
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/horizon_test_userdata"),
  },
}));

vi.mock("../db/client", () => {
  const mockDb = {
    select: vi.fn(),
  };
  return { db: mockDb };
});

import { shell } from "electron";
import { db } from "../db/client";
import { getActivityList, openOsTrash } from "./activity";

describe("activity service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("merges scans and cleanup actions in reverse-chronological order", async () => {
    const mockScans = [
      {
        id: 1,
        startedAt: "2026-08-19T09:00:00.000Z",
        completedAt: "2026-08-19T09:05:00.000Z",
        scopePaths: JSON.stringify(["/Users/example/Downloads"]),
        status: "complete",
        totalFiles: 150,
        totalBytes: 52428800,
      },
    ];

    const mockActions = [
      {
        id: 10,
        actionType: "trash",
        filePathsJson: JSON.stringify([
          "/Users/example/Downloads/temp1.dmg",
          "/Users/example/Downloads/temp2.dmg",
        ]),
        bytesFreed: 20971520,
        performedAt: "2026-08-19T10:00:00.000Z",
        relatedArchiveId: null,
      },
      {
        id: 11,
        actionType: "archive",
        filePathsJson: JSON.stringify(["/Users/example/Documents/project.zip"]),
        bytesFreed: 10485760,
        performedAt: "2026-08-19T08:00:00.000Z",
        relatedArchiveId: 2,
      },
    ];

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++;
      return {
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              if (selectCallCount === 1) return Promise.resolve(mockScans);
              return Promise.resolve(mockActions);
            }),
          }),
        }),
      } as any;
    });

    const result = await getActivityList(10);

    expect(result.totalItems).toBe(3);
    expect(result.totalScans).toBe(1);
    expect(result.totalActions).toBe(2);
    expect(result.totalBytesAffected).toBe(52428800 + 20971520 + 10485760);

    // Items should be ordered by timestamp descending:
    // 1. cleanup-10 (10:00)
    // 2. scan-1 (09:05)
    // 3. cleanup-11 (08:00)
    expect(result.items[0].id).toBe("cleanup-10");
    expect(result.items[0].type).toBe("trash");
    expect(result.items[0].undoAvailable).toBe(true);
    expect(result.items[0].undoLabel).toBe("Open Trash");

    expect(result.items[1].id).toBe("scan-1");
    expect(result.items[1].type).toBe("scan");
    expect(result.items[1].fileCount).toBe(150);

    expect(result.items[2].id).toBe("cleanup-11");
    expect(result.items[2].type).toBe("archive");
    expect(result.items[2].relatedArchiveId).toBe(2);
  });

  it("handles empty scans and cleanups gracefully", async () => {
    vi.mocked(db.select).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) as any);

    const result = await getActivityList();

    expect(result.totalItems).toBe(0);
    expect(result.totalScans).toBe(0);
    expect(result.totalActions).toBe(0);
    expect(result.totalBytesAffected).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("calls shell.openTrash or shell.openPath when openOsTrash is invoked", async () => {
    const success = await openOsTrash();
    expect(success).toBe(true);
    expect((shell as any).openTrash).toHaveBeenCalled();
  });
});
