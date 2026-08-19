import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/horizon_test_userdata"),
  },
}));

vi.mock("../db/client", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  return { db: mockDb };
});

vi.mock("./trash", () => ({
  trashFiles: vi.fn(),
}));

import { db } from "../db/client";
import { trashFiles } from "./trash";
import {
  createArchiveFromFileIds,
  readZipListing,
  verifyZipArchive,
  writeZipArchive,
} from "./archiver";

const testRoot = path.join(
  process.cwd(),
  "tmp",
  `archiver-test-${process.pid}`
);

async function resetTestRoot() {
  await fs.promises.rm(testRoot, { recursive: true, force: true });
  await fs.promises.mkdir(testRoot, { recursive: true });
}

function mockFileSelect(rows: any[]) {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(rows),
    }),
  } as any);
}

function mockArchiveInsert(row: any) {
  vi.mocked(db.insert).mockReturnValueOnce({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(row),
      }),
    }),
  } as any);
  vi.mocked(db.insert).mockReturnValueOnce({
    values: vi.fn().mockReturnValue({
      run: vi.fn(),
    }),
  } as any);
}

function mockUpdate() {
  vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        run: vi.fn(),
      }),
    }),
  } as any);
}

describe("archiver service", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await resetTestRoot();
  });

  it("writes and verifies a zip archive listing", async () => {
    const sourcePath = path.join(testRoot, "source.txt");
    const bundlePath = path.join(testRoot, "bundle.zip");
    await fs.promises.writeFile(sourcePath, "hello archive");

    await writeZipArchive(bundlePath, [
      { entryPath: "files/1/source.txt", sourcePath },
    ]);

    const listing = readZipListing(await fs.promises.readFile(bundlePath));
    expect(listing).toHaveLength(1);
    expect(listing[0].entryPath).toBe("files/1/source.txt");

    await expect(
      verifyZipArchive(bundlePath, [
        {
          fileId: 1,
          originalPath: sourcePath,
          entryPath: "files/1/source.txt",
          sizeBytes: "hello archive".length,
          category: "document",
        },
      ])
    ).resolves.toBeUndefined();
  });

  it("rejects verification when expected entries do not match", async () => {
    const sourcePath = path.join(testRoot, "source.txt");
    const bundlePath = path.join(testRoot, "bundle.zip");
    await fs.promises.writeFile(sourcePath, "hello archive");

    await writeZipArchive(bundlePath, [
      { entryPath: "files/1/source.txt", sourcePath },
    ]);

    await expect(
      verifyZipArchive(bundlePath, [
        {
          fileId: 1,
          originalPath: sourcePath,
          entryPath: "files/1/source.txt",
          sizeBytes: 999,
          category: "document",
        },
      ])
    ).rejects.toThrow("size mismatch");
  });

  it("creates an archive, trashes originals, and writes audit rows", async () => {
    const sourcePath = path.join(testRoot, "large.mov");
    const destinationDir = path.join(testRoot, "archives");
    await fs.promises.writeFile(sourcePath, "video bytes");

    mockFileSelect([
      {
        id: 1,
        path: sourcePath,
        sizeBytes: "video bytes".length,
        category: "video",
        modifiedAt: "2026-08-19T00:00:00.000Z",
        removedAt: null,
      },
    ]);
    mockArchiveInsert({
      id: 7,
      bundlePath: path.join(destinationDir, "bundle.zip"),
      destinationDir,
      contentsJson: JSON.stringify([
        {
          fileId: 1,
          originalPath: sourcePath,
          entryPath: "files/1/large.mov",
          sizeBytes: "video bytes".length,
          category: "video",
          modifiedAt: "2026-08-19T00:00:00.000Z",
        },
      ]),
      originalFileCount: 1,
      originalBytes: "video bytes".length,
      archiveSizeBytes: 1,
      status: "active",
      createdAt: "2026-08-19T00:00:00.000Z",
      restoredAt: null,
    });
    mockUpdate();
    vi.mocked(trashFiles).mockResolvedValue({
      trashedCount: 1,
      failedCount: 0,
      results: [{ path: sourcePath, ok: true }],
    });

    const result = await createArchiveFromFileIds({
      fileIds: [1],
      destinationDir,
    });

    expect(result.archivedCount).toBe(1);
    expect(result.archive?.id).toBe(7);
    expect(trashFiles).toHaveBeenCalledWith([sourcePath]);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("does not call trash when compression fails", async () => {
    const missingPath = path.join(testRoot, "missing.txt");
    mockFileSelect([
      {
        id: 1,
        path: missingPath,
        sizeBytes: 10,
        category: "document",
        modifiedAt: null,
        removedAt: null,
      },
    ]);

    await expect(
      createArchiveFromFileIds({
        fileIds: [1],
        destinationDir: path.join(testRoot, "archives"),
      })
    ).rejects.toThrow();

    expect(trashFiles).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
