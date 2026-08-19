import { desc } from "drizzle-orm";
import { shell } from "electron";
import os from "node:os";
import path from "node:path";
import { db } from "../db/client";
import { cleanupActions, scanRuns } from "../db/schema";
import type {
  ActivityItem,
  ActivityListResponse,
  ActivityStatus,
  ActivityType,
} from "@horizon/shared-types";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function safeParseJsonArray(jsonStr: string | null | undefined): string[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed.map((p) => String(p));
    }
    return [String(parsed)];
  } catch {
    return [jsonStr];
  }
}

/**
 * Merges scan_runs and cleanup_actions into a unified reverse-chronological audit log.
 */
export async function getActivityList(limit = 100): Promise<ActivityListResponse> {
  const safeLimit = Math.max(1, Math.min(limit, 200));

  // Fetch scan runs and cleanup actions
  const [scans, actions] = await Promise.all([
    db
      .select()
      .from(scanRuns)
      .orderBy(desc(scanRuns.startedAt))
      .limit(safeLimit),
    db
      .select()
      .from(cleanupActions)
      .orderBy(desc(cleanupActions.performedAt))
      .limit(safeLimit),
  ]);

  const items: ActivityItem[] = [];
  let totalScans = 0;
  let totalActions = 0;
  let totalBytesAffected = 0;

  for (const scan of scans) {
    totalScans++;
    const paths = safeParseJsonArray(scan.scopePaths);
    const bytes = scan.totalBytes ?? 0;
    const fileCount = scan.totalFiles ?? 0;
    totalBytesAffected += bytes;

    const validStatus: ActivityStatus =
      scan.status === "running" ||
      scan.status === "complete" ||
      scan.status === "cancelled" ||
      scan.status === "failed"
        ? scan.status
        : "complete";

    const title =
      paths.length === 1
        ? `Scan: ${path.basename(paths[0]) || paths[0]}`
        : paths.length > 1
          ? `Scan: ${paths.length} locations`
          : "Storage Scan";

    const description = `${fileCount} files indexed (${formatBytes(bytes)})`;

    items.push({
      id: `scan-${scan.id}`,
      type: "scan",
      title,
      description,
      timestamp: scan.completedAt || scan.startedAt,
      status: validStatus,
      bytesAffected: bytes,
      fileCount,
      paths,
      relatedArchiveId: null,
      undoAvailable: false,
      undoLabel: null,
    });
  }

  for (const action of actions) {
    totalActions++;
    const paths = safeParseJsonArray(action.filePathsJson);
    const bytes = action.bytesFreed ?? 0;
    const fileCount = paths.length;
    totalBytesAffected += bytes;

    let type: ActivityType = "trash";
    let title = "Files Moved to Trash";
    let description = `${fileCount} file${fileCount === 1 ? "" : "s"} moved to OS Trash (${formatBytes(bytes)})`;
    let undoAvailable = false;
    let undoLabel: string | null = null;

    if (action.actionType === "archive") {
      type = "archive";
      title = "Files Archived";
      description = `${fileCount} file${fileCount === 1 ? "" : "s"} compressed and archived (${formatBytes(bytes)})`;
      undoAvailable = false;
      undoLabel = null;
    } else if (action.actionType === "restore") {
      type = "restore";
      title = "Archive Restored";
      description = `${fileCount} file${fileCount === 1 ? "" : "s"} restored to filesystem`;
      undoAvailable = false;
      undoLabel = null;
    } else {
      // Default: trash
      type = "trash";
      title = "Files Moved to Trash";
      description = `${fileCount} file${fileCount === 1 ? "" : "s"} moved to OS Trash (${formatBytes(bytes)})`;
      undoAvailable = true;
      undoLabel = "Open Trash";
    }

    items.push({
      id: `cleanup-${action.id}`,
      type,
      title,
      description,
      timestamp: action.performedAt,
      status: "complete",
      bytesAffected: bytes,
      fileCount,
      paths,
      relatedArchiveId: action.relatedArchiveId,
      undoAvailable,
      undoLabel,
    });
  }

  // Sort unified audit log in reverse-chronological order (newest first)
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const paginatedItems = items.slice(0, safeLimit);

  return {
    items: paginatedItems,
    totalItems: items.length,
    totalScans,
    totalActions,
    totalBytesAffected,
  };
}

/**
 * Opens the OS Trash / Recycle Bin to provide a safe Undo affordance.
 */
export async function openOsTrash(): Promise<boolean> {
  try {
    if (typeof (shell as any).openTrash === "function") {
      await (shell as any).openTrash();
      return true;
    }

    const platform = process.platform;
    if (platform === "darwin") {
      const trashPath = path.join(os.homedir(), ".Trash");
      const err = await shell.openPath(trashPath);
      return !err;
    }

    return false;
  } catch (err) {
    console.warn("Failed to open OS trash:", err);
    return false;
  }
}
