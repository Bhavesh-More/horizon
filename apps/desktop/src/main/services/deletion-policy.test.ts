import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import {
  validatePathsForDeletion,
  evaluateSinglePath,
  isSystemBlockedPath,
  getCanonicalPath,
} from "./deletion-policy";

describe("deletion-policy service", () => {
  it("blocks paths under system blocklist for macOS (darwin)", () => {
    const sysPath = "/System/Library/CoreServices";
    const res = evaluateSinglePath(sysPath, "darwin");
    expect(res.tier).toBe("blocked");
    expect(res.reason).toContain("/System");
  });

  it("blocks paths under system blocklist for Windows (win32)", () => {
    const winPath = "C:\\Windows\\System32\\config";
    const res = evaluateSinglePath(winPath, "win32");
    expect(res.tier).toBe("blocked");
    expect(res.reason).toContain("C:\\Windows");
  });

  it("does not trigger blocklist prefix false positive (/usr vs /usr_data)", () => {
    const customPath = "/usr_data/my_file.txt";
    const check = isSystemBlockedPath(customPath, "darwin");
    expect(check.isBlocked).toBe(false);
  });

  it("blocks protected file extensions (.app, .sys, .exe)", () => {
    const appPath = path.join(os.homedir(), "Downloads", "TestApp.app");
    const res = evaluateSinglePath(appPath, "darwin");
    expect(res.tier).toBe("blocked");
    expect(res.reason).toContain(".app");
  });

  it("marks user content in Downloads as safe", () => {
    const filePath = path.join(os.homedir(), "Downloads", "duplicate_photo.jpg");
    const res = evaluateSinglePath(filePath, "darwin");
    expect(res.tier).toBe("safe");
  });

  it("marks hidden dotfiles as check", () => {
    const hiddenPath = path.join(os.homedir(), "Documents", ".secret_cache");
    const res = evaluateSinglePath(hiddenPath, "darwin");
    expect(res.tier).toBe("check");
  });

  it("correctly separates approved and blocked paths in validatePathsForDeletion", () => {
    const userFile = path.join(os.homedir(), "Downloads", "video.mp4");
    const sysFile = "/usr/bin/python3";

    const { approved, blocked } = validatePathsForDeletion([userFile, sysFile], "darwin");
    expect(approved).toHaveLength(1);
    expect(approved[0].originalPath).toBe(userFile);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].originalPath).toBe(sysFile);
  });

  it("handles non-existent paths gracefully using getCanonicalPath fallback", () => {
    const nonExistent = path.join(os.homedir(), "Downloads", "non_existent_12345.tmp");
    const canonical = getCanonicalPath(nonExistent);
    expect(canonical).toBe(path.resolve(nonExistent));
  });
});
