import { parentPort } from "node:worker_threads";
import fs from "node:fs/promises";
import path from "node:path";
import { FileCategory, FileItem } from "@horizon/shared-types";

interface StartMessage {
  action: "start";
  scanRunId: number;
  scope: string[];
}

const EXCLUDED_DIRS = new Set([
  ".git",
  ".svn",
  ".hg",
  ".Trash",
  ".Trashes",
  "System Volume Information",
  "$RECYCLE.BIN",
  ".Spotlight-V100",
  ".fseventsd",
  ".cache",
  "node_modules",
  ".venv",
  "__pycache__",
  ".next",
  ".turbo",
  ".cargo",
  ".rustup",
  ".gradle",
  "vendor",
  "dist",
  "build",
  ".npm",
  ".yarn",
  ".pnpm-store",
  "Library/Caches",
]);

function categorizeFile(filePath: string, ext: string): FileCategory {
  const normalizedPath = filePath.toLowerCase();
  const normalizedExt = ext.toLowerCase();

  // Dev artifacts check (by directory path or extension)
  if (
    normalizedPath.includes("/node_modules/") ||
    normalizedPath.includes("\\node_modules\\") ||
    normalizedPath.includes("/.venv/") ||
    normalizedPath.includes("\\.venv\\") ||
    normalizedPath.includes("/__pycache__/") ||
    normalizedPath.includes("\\__pycache__\\") ||
    normalizedPath.includes("/.target/") ||
    normalizedPath.includes("\\target\\") ||
    normalizedPath.includes("/.gradle/") ||
    normalizedPath.includes("/.next/") ||
    normalizedPath.includes("/.cache/")
  ) {
    return "dev_artifact";
  }

  // Images
  if (
    [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".svg",
      ".webp",
      ".bmp",
      ".tiff",
      ".ico",
      ".heic",
      ".raw",
    ].includes(normalizedExt)
  ) {
    return "image";
  }

  // Videos
  if (
    [
      ".mp4",
      ".mov",
      ".avi",
      ".mkv",
      ".webm",
      ".flv",
      ".wmv",
      ".m4v",
    ].includes(normalizedExt)
  ) {
    return "video";
  }

  // Audio
  if (
    [".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".wma"].includes(
      normalizedExt
    )
  ) {
    return "audio";
  }

  // Documents
  if (
    [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".txt",
      ".md",
      ".csv",
      ".rtf",
      ".json",
      ".xml",
      ".yaml",
      ".yml",
    ].includes(normalizedExt)
  ) {
    return "document";
  }

  // Archives
  if (
    [
      ".zip",
      ".tar",
      ".gz",
      ".7z",
      ".rar",
      ".bz2",
      ".xz",
      ".zst",
      ".tgz",
    ].includes(normalizedExt)
  ) {
    return "archive";
  }

  // Code / Dev files
  if (
    [
      ".js",
      ".ts",
      ".jsx",
      ".tsx",
      ".py",
      ".java",
      ".c",
      ".cpp",
      ".h",
      ".rs",
      ".go",
      ".rb",
      ".php",
      ".sh",
      ".sql",
    ].includes(normalizedExt)
  ) {
    return "dev_artifact";
  }

  return "other";
}

async function walkDirectoryConcurrent(
  dirPath: string,
  scanRunId: number,
  categoryStats: Record<string, { files: number; bytes: number }>,
  state: {
    totalFiles: number;
    totalBytes: number;
    fileBuffer: FileItem[];
    processedCount: number;
  },
  concurrencyLimit = 8
) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const subDirs: string[] = [];

    for (const entry of entries) {
      const entryName = entry.name;
      const fullPath = path.join(dirPath, entryName);

      // Fast early exclusion check
      if (EXCLUDED_DIRS.has(entryName)) {
        continue;
      }

      if (entry.isDirectory()) {
        subDirs.push(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          const ext = path.extname(entryName);
          const category = categorizeFile(fullPath, ext);

          state.totalFiles += 1;
          state.totalBytes += stat.size;
          state.processedCount += 1;

          if (!categoryStats[category]) {
            categoryStats[category] = { files: 0, bytes: 0 };
          }
          categoryStats[category].files += 1;
          categoryStats[category].bytes += stat.size;

          const fileItem: FileItem = {
            scanRunId,
            path: fullPath,
            sizeBytes: stat.size,
            extension: ext,
            category,
            createdAt: stat.birthtime ? stat.birthtime.toISOString() : undefined,
            modifiedAt: stat.mtime ? stat.mtime.toISOString() : undefined,
            accessedAt: stat.atime ? stat.atime.toISOString() : undefined,
          };

          state.fileBuffer.push(fileItem);

          // Flush worker buffer in batches of 200 to lower IPC / thread message overhead
          if (state.fileBuffer.length >= 200) {
            if (parentPort) {
              parentPort.postMessage({
                event: "batch",
                files: [...state.fileBuffer],
              });
            }
            state.fileBuffer.length = 0;
          }
        } catch {
          // Ignore unreadable individual file stats
        }
      }
    }

    // Process subdirectories concurrently in parallel chunks with cooperative yields
    for (let i = 0; i < subDirs.length; i += concurrencyLimit) {
      const chunk = subDirs.slice(i, i + concurrencyLimit);
      await Promise.all(
        chunk.map((subDir) =>
          walkDirectoryConcurrent(
            subDir,
            scanRunId,
            categoryStats,
            state,
            concurrencyLimit
          )
        )
      );
      await new Promise((resolve) => setImmediate(resolve));
    }
  } catch {
    // Ignore unreadable directory
  }
}

if (parentPort) {
  parentPort.on("message", async (msg: StartMessage) => {
    if (msg.action === "start") {
      const categoryStats: Record<string, { files: number; bytes: number }> = {};
      const state = {
        totalFiles: 0,
        totalBytes: 0,
        fileBuffer: [] as FileItem[],
        processedCount: 0,
      };

      for (const rootPath of msg.scope) {
        try {
          const stat = await fs.stat(rootPath);
          if (stat.isDirectory()) {
            await walkDirectoryConcurrent(
              rootPath,
              msg.scanRunId,
              categoryStats,
              state
            );
          }
        } catch {
          // Directory path not accessible
        }
      }

      // Flush remaining buffered items
      if (state.fileBuffer.length > 0 && parentPort) {
        parentPort.postMessage({
          event: "batch",
          files: [...state.fileBuffer],
        });
        state.fileBuffer.length = 0;
      }

      parentPort?.postMessage({
        event: "complete",
        summary: {
          totalFiles: state.totalFiles,
          totalBytes: state.totalBytes,
          categories: categoryStats,
        },
      });
    }
  });
}
