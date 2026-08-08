import { parentPort } from "node:worker_threads";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import sharp from "sharp";
import { bmvbhash } from "blockhash-core";

interface HashExactRequest {
  action: "hashExact";
  files: Array<{ id: number; path: string; sizeBytes: number }>;
}

interface HashPerceptualRequest {
  action: "hashPerceptual";
  files: Array<{ id: number; path: string }>;
}

type WorkerMessage = HashExactRequest | HashPerceptualRequest;

process.on("uncaughtException", (err) => {
  console.error("[hash.worker] Uncaught Exception in worker thread:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[hash.worker] Unhandled Rejection in worker thread:", reason);
});

/** Safe streaming SHA-256 hash with explicit stream error handling */
function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });

      stream.on("error", (err) => {
        try { stream.destroy(); } catch {}
        reject(err);
      });

      hash.on("error", (err) => {
        try { stream.destroy(); } catch {}
        reject(err);
      });

      stream.on("end", () => {
        try {
          hash.end();
          resolve(hash.digest("hex"));
        } catch (err) {
          reject(err);
        }
      });

      stream.pipe(hash);
    } catch (err) {
      reject(err);
    }
  });
}

/** Perceptual blockhash (16-bit precision = 256 bits) */
async function computePerceptualHash(filePath: string): Promise<string | null> {
  try {
    const { data, info } = await sharp(filePath)
      .resize(16, 16, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return bmvbhash({ data: new Uint8Array(data), width: info.width, height: info.height }, 16);
  } catch (err) {
    console.warn(`[hash.worker] Perceptual hash skipped for file ${filePath}:`, err);
    return null;
  }
}

/**
 * Process a batch of async tasks with bounded concurrency.
 * Returns results in the same order as the input array.
 */
async function pLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

if (parentPort) {
  parentPort.on("message", async (msg: WorkerMessage) => {
    if (msg.action === "hashExact") {
      const files = msg.files;
      const total = files.length;
      let processed = 0;

      // SHA-256 is I/O-bound — 8 concurrent readers avoids file handle limits across large files
      const EXACT_CONCURRENCY = 8;
      console.log(`[hash.worker] Starting hashExact for ${total} candidates across all file formats.`);

      const reportCadence = total <= 20 ? 1 : 10;

      const results = await pLimit(files, EXACT_CONCURRENCY, async (file) => {
        try {
          const hash = await computeSha256(file.path);
          processed++;

          if (processed % reportCadence === 0 || processed === total) {
            parentPort?.postMessage({
              event: "progress",
              phase: "exact",
              processedFiles: processed,
              totalFiles: total,
            });
          }
          return { id: file.id, hash } as { id: number; hash: string } | null;
        } catch (err) {
          console.error(`[hash.worker] SHA-256 hashing failed for file ID ${file.id} at path "${file.path}":`, err);
          processed++;
          return null;
        }
      });

      const validResults = results.filter((r): r is { id: number; hash: string } => r !== null);
      console.log(`[hash.worker] Completed hashExact: ${validResults.length}/${total} hashes successfully generated.`);

      parentPort?.postMessage({
        event: "exactResult",
        results: validResults,
      });
    } else if (msg.action === "hashPerceptual") {
      const files = msg.files;
      const total = files.length;
      let processed = 0;

      // sharp is CPU+I/O — 4 concurrent keeps the CPU busy without thrashing memory
      const PERCEPTUAL_CONCURRENCY = 4;
      console.log(`[hash.worker] Starting hashPerceptual for ${total} image candidate files.`);

      const reportCadence = total <= 20 ? 1 : 20;

      const results = await pLimit(files, PERCEPTUAL_CONCURRENCY, async (file) => {
        try {
          const pHash = await computePerceptualHash(file.path);
          processed++;
          if (processed % reportCadence === 0 || processed === total) {
            parentPort?.postMessage({
              event: "progress",
              phase: "perceptual",
              processedFiles: processed,
              totalFiles: total,
            });
          }
          return pHash ? ({ id: file.id, hash: pHash } as { id: number; hash: string }) : null;
        } catch (err) {
          console.error(`[hash.worker] Perceptual hashing failed for file ID ${file.id} at path "${file.path}":`, err);
          processed++;
          return null;
        }
      });

      const validResults = results.filter((r): r is { id: number; hash: string } => r !== null);
      console.log(`[hash.worker] Completed hashPerceptual: ${validResults.length}/${total} hashes generated.`);

      parentPort?.postMessage({
        event: "perceptualResult",
        results: validResults,
      });
    }
  });
}
