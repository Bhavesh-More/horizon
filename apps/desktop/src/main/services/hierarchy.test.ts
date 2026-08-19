import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { listAvailableDrives, scanDirectoryHierarchy } from "./hierarchy";

describe("hierarchy service", () => {
  const testDir = path.join(os.tmpdir(), `horizon-hierarchy-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });

    // Create subfolders
    const folderA = path.join(testDir, "FolderA");
    const folderB = path.join(testDir, "FolderB");
    const hiddenFolder = path.join(testDir, ".hiddenFolder");

    fs.mkdirSync(folderA, { recursive: true });
    fs.mkdirSync(folderB, { recursive: true });
    fs.mkdirSync(hiddenFolder, { recursive: true });

    // Create files with different sizes
    fs.writeFileSync(path.join(folderA, "large.dat"), Buffer.alloc(1024 * 10)); // 10 KB
    fs.writeFileSync(path.join(folderB, "small.dat"), Buffer.alloc(1024 * 2)); // 2 KB
    fs.writeFileSync(path.join(hiddenFolder, "secret.dat"), Buffer.alloc(1024 * 5)); // 5 KB
    fs.writeFileSync(path.join(testDir, ".root-hidden.txt"), "hello");
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it("lists available drives with non-empty defaultPath", async () => {
    const res = await listAvailableDrives();
    expect(res.drives.length).toBeGreaterThan(0);
    expect(res.defaultPath).toBeTruthy();
  });

  it("scans directory tree and orders child folders by size descending", async () => {
    const res = await scanDirectoryHierarchy({
      path: testDir,
      showHidden: false,
      depth: 2,
    });

    expect(res.root.isDirectory).toBe(true);
    expect(res.root.children).toBeDefined();

    // With showHidden: false, .hiddenFolder and .root-hidden.txt should be excluded
    const childNames = res.root.children!.map((c) => c.name);
    expect(childNames).toContain("FolderA");
    expect(childNames).toContain("FolderB");
    expect(childNames).not.toContain(".hiddenFolder");
    expect(childNames).not.toContain(".root-hidden.txt");

    // FolderA (10 KB) should come before FolderB (2 KB)
    expect(childNames[0]).toBe("FolderA");
    expect(childNames[1]).toBe("FolderB");

    // FolderA should have 1 child
    const folderA = res.root.children!.find((c) => c.name === "FolderA")!;
    expect(folderA.sizeBytes).toBeGreaterThanOrEqual(10240);
    expect(folderA.fileCount).toBe(1);
    expect(folderA.percentOfParent).toBeGreaterThan(0);
  });

  it("includes hidden folders and files when showHidden is true", async () => {
    const res = await scanDirectoryHierarchy({
      path: testDir,
      showHidden: true,
      depth: 2,
    });

    const childNames = res.root.children!.map((c) => c.name);
    expect(childNames).toContain(".hiddenFolder");
    expect(childNames).toContain(".root-hidden.txt");
  });
});
