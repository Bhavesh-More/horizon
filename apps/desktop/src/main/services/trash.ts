import path from "node:path";
import trash from "trash";

export interface TrashFileResult {
  path: string;
  ok: boolean;
  error?: string;
}

export interface TrashBatchResult {
  trashedCount: number;
  failedCount: number;
  results: TrashFileResult[];
}

/**
 * Single authorized entry point for moving a file to OS Trash (Invariant I-1).
 * Never uses unrecoverable removal (fs.unlink / fs.rm). Uses the trash npm package.
 */
export async function trashFile(filePath: string): Promise<TrashFileResult> {
  const resolvedPath = path.resolve(filePath);
  try {
    await trash([resolvedPath], { glob: false });
    return { path: filePath, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { path: filePath, ok: false, error: msg };
  }
}

/**
 * Sequentially moves a batch of file paths to OS Trash.
 * Sequential processing avoids OS-level trash queue race conditions.
 */
export async function trashFiles(filePaths: string[]): Promise<TrashBatchResult> {
  const results: TrashFileResult[] = [];
  let trashedCount = 0;
  let failedCount = 0;

  for (const fp of filePaths) {
    const res = await trashFile(fp);
    results.push(res);
    if (res.ok) {
      trashedCount++;
    } else {
      failedCount++;
    }
  }

  return {
    trashedCount,
    failedCount,
    results,
  };
}
