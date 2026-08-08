import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Electron before imports
vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/horizon_test_userdata"),
  },
}));

// Mock DB client
vi.mock("../db/client", () => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    query: {
      scanRuns: {
        findFirst: vi.fn(),
      },
      duplicateGroups: {
        findMany: vi.fn(),
      },
    },
  };
  return { db: mockDb };
});

import { db } from "../db/client";
import { getDuplicateGroups } from "./hashing";

describe("hashing service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty duplicate groups list when no groups exist", async () => {
    const mockSelect = {
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([]),
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    };
    vi.mocked(db.select).mockReturnValue(mockSelect as any);

    const res = await getDuplicateGroups();
    expect(res.totalGroups).toBe(0);
    expect(res.groups).toHaveLength(0);
    expect(res.totalReclaimableBytes).toBe(0);
  });

  it("correctly queries and formats duplicate groups for exact matches across all file categories", async () => {
    const mockGroups = [
      {
        id: 1,
        hashType: "exact",
        representativeHash: "abc123sha256hash",
        totalSizeBytes: 2048,
        memberCount: 2,
        createdAt: "2026-08-07T12:00:00.000Z",
      },
    ];

    const mockMembers = [
      {
        groupId: 1,
        similarityScore: 1.0,
        fileId: 101,
        path: "/user/documents/report_copy1.pdf",
        sizeBytes: 1024,
        extension: ".pdf",
        category: "document",
        modifiedAt: "2026-08-01T10:00:00.000Z",
        removedAt: null,
      },
      {
        groupId: 1,
        similarityScore: 1.0,
        fileId: 102,
        path: "/user/downloads/report_copy2.pdf",
        sizeBytes: 1024,
        extension: ".pdf",
        category: "document",
        modifiedAt: "2026-08-05T10:00:00.000Z",
        removedAt: null,
      },
    ];

    let queryStep = 0;
    vi.mocked(db.select).mockImplementation((() => {
      queryStep++;
      if (queryStep === 1) {
        // Querying duplicateGroups
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(mockGroups),
            }),
            orderBy: vi.fn().mockResolvedValue(mockGroups),
          }),
        };
      } else {
        // Querying duplicateGroupMembers
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(mockMembers),
            }),
          }),
        };
      }
    }) as any);

    const res = await getDuplicateGroups(undefined, "exact");
    expect(res.totalGroups).toBe(1);
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].hashType).toBe("exact");
    expect(res.groups[0].members).toHaveLength(2);
    expect(res.groups[0].members[0].category).toBe("document");
    expect(res.groups[0].members[1].isRecommendedKeep).toBe(true); // newer file
    expect(res.totalReclaimableBytes).toBe(1024);
  });

  it("chunks member lookups so exact matches still load when many groups exist", async () => {
    const mockGroups = Array.from({ length: 1200 }, (_, index) => ({
      id: index + 1,
      hashType: "exact",
      representativeHash: `hash-${index + 1}`,
      totalSizeBytes: 2048,
      memberCount: 2,
      createdAt: "2026-08-07T12:00:00.000Z",
    }));

    let queryStep = 0;
    vi.mocked(db.select).mockImplementation((() => {
      queryStep++;
      if (queryStep === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(mockGroups),
            }),
            orderBy: vi.fn().mockResolvedValue(mockGroups),
          }),
        };
      }

      const chunkIndex = queryStep - 2;
      const startGroupId = chunkIndex * 500 + 1;
      const endGroupId = Math.min(startGroupId + 499, mockGroups.length);
      const members = [];

      for (let groupId = startGroupId; groupId <= endGroupId; groupId++) {
        members.push(
          {
            groupId,
            similarityScore: 1.0,
            fileId: groupId * 10 + 1,
            path: `/user/documents/report-${groupId}-a.txt`,
            sizeBytes: 1024,
            extension: ".txt",
            category: "document",
            modifiedAt: "2026-08-01T10:00:00.000Z",
            removedAt: null,
          },
          {
            groupId,
            similarityScore: 1.0,
            fileId: groupId * 10 + 2,
            path: `/user/downloads/report-${groupId}-b.txt`,
            sizeBytes: 1024,
            extension: ".txt",
            category: "document",
            modifiedAt: "2026-08-05T10:00:00.000Z",
            removedAt: null,
          }
        );
      }

      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(members),
          }),
        }),
      };
    }) as any);

    const res = await getDuplicateGroups(undefined, "exact");

    expect(res.totalGroups).toBe(1200);
    expect(res.groups[0].hashType).toBe("exact");
    expect(res.groups[0].members[0].category).toBe("document");
    expect(res.totalReclaimableBytes).toBe(1200 * 1024);
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(4);
  });
});
