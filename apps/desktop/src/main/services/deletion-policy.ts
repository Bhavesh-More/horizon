import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type SafetyTier = "safe" | "check" | "blocked";

export interface PathEvaluation {
  originalPath: string;
  resolvedPath: string;
  tier: SafetyTier;
  reason?: string;
}

export interface DeletionPolicyResult {
  approved: PathEvaluation[];
  blocked: PathEvaluation[];
}

const SYSTEM_BLOCKLISTS: Record<string, string[]> = {
  darwin: [
    "/System",
    "/Library",
    "/usr",
    "/bin",
    "/sbin",
    "/private",
    "/cores",
    "/etc",
    "/var",
    "/Applications/Utilities",
  ],
  win32: [
    "C:\\Windows",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    "C:\\ProgramData",
    "C:\\Recovery",
  ],
  linux: [
    "/bin",
    "/boot",
    "/dev",
    "/etc",
    "/lib",
    "/lib64",
    "/proc",
    "/root",
    "/run",
    "/sbin",
    "/sys",
    "/usr",
  ],
};

const PROTECTED_EXTENSIONS = new Set([
  ".app",
  ".kext",
  ".sys",
  ".dll",
  ".so",
  ".dylib",
  ".exe",
  ".dmg",
  ".pkg",
]);

/**
 * Normalizes and resolves canonical path using fs.realpathSync to prevent symlink attacks.
 * Falls back to path.resolve if file cannot be realpath'd (e.g. deleted or doesn't exist).
 */
export function getCanonicalPath(filePath: string, platform = os.platform()): string {
  const pathModule = platform === "win32" ? path.win32 : path.posix;
  const absolutePath = pathModule.resolve(filePath);
  try {
    return fs.realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
}

/**
 * Checks if a given canonical path is inside a blocked system directory.
 * Includes path.sep boundary check to avoid partial folder name bypasses (e.g. /usr vs /usr_data).
 */
export function isSystemBlockedPath(
  canonicalPath: string,
  platform = os.platform()
): { isBlocked: boolean; blockedBy?: string } {
  const blocklist = SYSTEM_BLOCKLISTS[platform] || SYSTEM_BLOCKLISTS.linux;
  const pathModule = platform === "win32" ? path.win32 : path.posix;
  const sep = pathModule.sep;

  // Normalize separators in canonicalPath for Windows if evaluating win32 paths on posix
  const normalizedCanonical = platform === "win32"
    ? canonicalPath.replace(/\//g, "\\")
    : canonicalPath;

  for (const blockedDir of blocklist) {
    const normalizedBlocked = pathModule.resolve(blockedDir);
    if (
      normalizedCanonical === normalizedBlocked ||
      normalizedCanonical.toLowerCase().startsWith(normalizedBlocked.toLowerCase() + sep)
    ) {
      return { isBlocked: true, blockedBy: normalizedBlocked };
    }
  }

  return { isBlocked: false };
}

/**
 * Evaluates a single file path against deletion safety policies.
 * Invariant I-2: Server-side blocklist check after IPC request.
 */
export function evaluateSinglePath(
  filePath: string,
  platform = os.platform()
): PathEvaluation {
  if (!filePath || typeof filePath !== "string") {
    return {
      originalPath: String(filePath),
      resolvedPath: "",
      tier: "blocked",
      reason: "Invalid file path provided",
    };
  }

  const canonicalPath = getCanonicalPath(filePath, platform);
  const pathModule = platform === "win32" ? path.win32 : path.posix;

  // 1. Check System Blocklist
  const { isBlocked, blockedBy } = isSystemBlockedPath(canonicalPath, platform);
  if (isBlocked) {
    return {
      originalPath: filePath,
      resolvedPath: canonicalPath,
      tier: "blocked",
      reason: `Path is inside protected system location: ${blockedBy}`,
    };
  }

  // 2. Check Protected System Extensions
  const ext = pathModule.extname(canonicalPath).toLowerCase();
  if (PROTECTED_EXTENSIONS.has(ext)) {
    return {
      originalPath: filePath,
      resolvedPath: canonicalPath,
      tier: "blocked",
      reason: `File extension '${ext}' is protected from deletion`,
    };
  }

  // 3. Check Home Root / Config / AppData vs Standard User Content
  const homeDir = os.homedir();
  const parentDir = pathModule.dirname(canonicalPath);

  // Files residing directly in the home root directory (e.g. ~/important.txt or ~/.zshrc) require verification
  if (parentDir === homeDir || canonicalPath.includes(`${pathModule.sep}.`)) {
    return {
      originalPath: filePath,
      resolvedPath: canonicalPath,
      tier: "check",
      reason: "File is located directly in home root or a hidden directory",
    };
  }

  return {
    originalPath: filePath,
    resolvedPath: canonicalPath,
    tier: "safe",
  };
}


/**
 * Validates a list of file paths against deletion safety rules.
 * Separates results into approved (safe/check) and blocked (blocked).
 */
export function validatePathsForDeletion(
  paths: string[],
  platform = os.platform()
): DeletionPolicyResult {
  const approved: PathEvaluation[] = [];
  const blocked: PathEvaluation[] = [];

  for (const fp of paths) {
    const evalResult = evaluateSinglePath(fp, platform);
    if (evalResult.tier === "blocked") {
      blocked.push(evalResult);
    } else {
      approved.push(evalResult);
    }
  }

  return { approved, blocked };
}
