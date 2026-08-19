/**
 * archiver.ts
 * Owns: archive bundle creation, verification, listing, contents preview, and restore.
 * Upholds:
 * - Invariant I-3: compress, verify, then move originals to Trash.
 * - Invariant I-14: audit rows are written only after completed archive or restore actions.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { archives, cleanupActions, fileIndex } from "../db/schema";
import { validatePathsForDeletion } from "./deletion-policy";
import { trashFiles } from "./trash";
import {
  ArchiveContentItem,
  ArchiveCreateResponse,
  ArchiveListResponse,
  ArchiveRecord,
  ArchiveRestoreResponse,
} from "@horizon/shared-types";

type ArchiveRow = typeof archives.$inferSelect;

interface ZipEntryInput {
  entryPath: string;
  sourcePath: string;
  modifiedAt?: string | null;
}

interface ZipEntryListing {
  entryPath: string;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  method: number;
  localHeaderOffset: number;
}

const ZIP_METHOD_DEFLATE = 8;
const ZIP_LOCAL_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;

const CRC32_TABLE = new Uint32Array(256).map((_value, index) => {
  let crc = index;
  for (let i = 0; i < 8; i++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(iso?: string | null): { date: number; time: number } {
  const date = iso ? new Date(iso) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = Math.max(1980, safeDate.getFullYear());
  return {
    time:
      (safeDate.getHours() << 11) |
      (safeDate.getMinutes() << 5) |
      Math.floor(safeDate.getSeconds() / 2),
    date:
      ((year - 1980) << 9) |
      ((safeDate.getMonth() + 1) << 5) |
      safeDate.getDate(),
  };
}

function writeUInt16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function safeEntryName(fileId: number, filePath: string): string {
  const baseName = path.basename(filePath).replace(/[\\/]/g, "_") || `file-${fileId}`;
  return `files/${fileId}/${baseName}`;
}

function sanitizeBundleName(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "").replace("T", "-").replace("Z", "");
}

export function getDefaultArchiveDestination(): string {
  return path.join(os.homedir(), "Horizon Archives");
}

export async function writeZipArchive(
  bundlePath: string,
  entries: ZipEntryInput[]
): Promise<void> {
  const chunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const source = await fs.promises.readFile(entry.sourcePath);
    const compressed = zlib.deflateRawSync(source);
    const entryName = Buffer.from(entry.entryPath, "utf8");
    const checksum = crc32(source);
    const { date, time } = dosDateTime(entry.modifiedAt);

    const localHeader = Buffer.concat([
      writeUInt32(ZIP_LOCAL_HEADER_SIGNATURE),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(ZIP_METHOD_DEFLATE),
      writeUInt16(time),
      writeUInt16(date),
      writeUInt32(checksum),
      writeUInt32(compressed.length),
      writeUInt32(source.length),
      writeUInt16(entryName.length),
      writeUInt16(0),
      entryName,
    ]);

    chunks.push(localHeader, compressed);

    const centralHeader = Buffer.concat([
      writeUInt32(ZIP_CENTRAL_HEADER_SIGNATURE),
      writeUInt16(20),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(ZIP_METHOD_DEFLATE),
      writeUInt16(time),
      writeUInt16(date),
      writeUInt32(checksum),
      writeUInt32(compressed.length),
      writeUInt32(source.length),
      writeUInt16(entryName.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(offset),
      entryName,
    ]);
    centralChunks.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const endOfCentralDirectory = Buffer.concat([
    writeUInt32(ZIP_EOCD_SIGNATURE),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(entries.length),
    writeUInt16(entries.length),
    writeUInt32(centralDirectory.length),
    writeUInt32(offset),
    writeUInt16(0),
  ]);

  await fs.promises.mkdir(path.dirname(bundlePath), { recursive: true });
  await fs.promises.writeFile(bundlePath, Buffer.concat([...chunks, centralDirectory, endOfCentralDirectory]));
}

export function readZipListing(buffer: Buffer): ZipEntryListing[] {
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i--) {
    if (buffer.readUInt32LE(i) === ZIP_EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Archive central directory not found");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntryListing[] = [];
  let cursor = centralOffset;

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_HEADER_SIGNATURE) {
      throw new Error("Invalid archive central directory");
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const entryPath = buffer.toString("utf8", nameStart, nameStart + nameLength);

    entries.push({
      entryPath,
      compressedSize,
      uncompressedSize,
      crc32: crc,
      method,
      localHeaderOffset,
    });

    cursor = nameStart + nameLength + extraLength + commentLength;
  }

  return entries;
}

export async function verifyZipArchive(
  bundlePath: string,
  expected: ArchiveContentItem[]
): Promise<void> {
  const buffer = await fs.promises.readFile(bundlePath);
  const listing = readZipListing(buffer);
  const listingMap = new Map(listing.map((entry) => [entry.entryPath, entry]));

  for (const item of expected) {
    const listed = listingMap.get(item.entryPath);
    if (!listed) throw new Error(`Archive entry missing: ${item.entryPath}`);
    if (listed.uncompressedSize !== item.sizeBytes) {
      throw new Error(`Archive entry size mismatch: ${item.entryPath}`);
    }
  }
}

function parseContents(raw: string): ArchiveContentItem[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toArchiveRecord(row: ArchiveRow): ArchiveRecord {
  return {
    id: row.id,
    bundlePath: row.bundlePath,
    destinationDir: row.destinationDir,
    contents: parseContents(row.contentsJson),
    originalFileCount: row.originalFileCount,
    originalBytes: row.originalBytes,
    archiveSizeBytes: row.archiveSizeBytes,
    status: row.status,
    createdAt: row.createdAt,
    restoredAt: row.restoredAt,
  };
}

function safeRestorePath(root: string, entryPath: string): string {
  if (entryPath.includes("..") || path.isAbsolute(entryPath)) {
    throw new Error(`Unsafe archive entry path: ${entryPath}`);
  }
  const target = path.resolve(root, entryPath);
  const safeRoot = path.resolve(root);
  if (target !== safeRoot && !target.startsWith(`${safeRoot}${path.sep}`)) {
    throw new Error(`Archive entry escapes restore root: ${entryPath}`);
  }
  return target;
}

async function extractZipEntry(
  archiveBuffer: Buffer,
  listing: ZipEntryListing,
  targetPath: string
): Promise<number> {
  const localOffset = listing.localHeaderOffset;
  if (archiveBuffer.readUInt32LE(localOffset) !== ZIP_LOCAL_HEADER_SIGNATURE) {
    throw new Error(`Invalid local archive header: ${listing.entryPath}`);
  }

  const nameLength = archiveBuffer.readUInt16LE(localOffset + 26);
  const extraLength = archiveBuffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLength + extraLength;
  const compressed = archiveBuffer.subarray(
    dataStart,
    dataStart + listing.compressedSize
  );
  const data =
    listing.method === ZIP_METHOD_DEFLATE
      ? zlib.inflateRawSync(compressed)
      : compressed;

  if (data.length !== listing.uncompressedSize || crc32(data) !== listing.crc32) {
    throw new Error(`Archive entry verification failed: ${listing.entryPath}`);
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, data);
  return data.length;
}

export async function createArchiveFromFileIds(params: {
  fileIds: number[];
  destinationDir?: string;
}): Promise<ArchiveCreateResponse> {
  const targetFiles = await db
    .select()
    .from(fileIndex)
    .where(and(inArray(fileIndex.id, params.fileIds), isNull(fileIndex.removedAt)));

  if (targetFiles.length === 0) {
    return {
      archive: null,
      archivedCount: 0,
      trashedCount: 0,
      blockedCount: 0,
      failedCount: params.fileIds.length,
      freedBytes: 0,
      results: params.fileIds.map((fileId) => ({
        fileId,
        path: "",
        sizeBytes: 0,
        status: "failed",
        reason: "File record not found or already removed",
      })),
    };
  }

  const pathToFileMap = new Map(targetFiles.map((file) => [file.path, file]));
  const { approved, blocked } = validatePathsForDeletion(
    targetFiles.map((file) => file.path)
  );
  const results: ArchiveCreateResponse["results"] = [];

  for (const blockedItem of blocked) {
    const file = pathToFileMap.get(blockedItem.originalPath);
    if (!file) continue;
    results.push({
      fileId: file.id,
      path: file.path,
      sizeBytes: file.sizeBytes,
      status: "blocked",
      reason: blockedItem.reason,
    });
  }

  if (approved.length === 0) {
    return {
      archive: null,
      archivedCount: 0,
      trashedCount: 0,
      blockedCount: blocked.length,
      failedCount: 0,
      freedBytes: 0,
      results,
    };
  }

  const destinationDir = path.resolve(
    params.destinationDir?.trim() || getDefaultArchiveDestination()
  );
  const now = new Date();
  const bundlePath = path.join(
    destinationDir,
    `horizon-archive-${sanitizeBundleName(now)}.zip`
  );
  const approvedFiles = approved
    .map((item) => pathToFileMap.get(item.originalPath))
    .filter((file): file is typeof targetFiles[number] => !!file);
  const contents: ArchiveContentItem[] = approvedFiles.map((file) => ({
    fileId: file.id,
    originalPath: file.path,
    entryPath: safeEntryName(file.id, file.path),
    sizeBytes: file.sizeBytes,
    category: file.category,
    modifiedAt: file.modifiedAt,
  }));

  await writeZipArchive(
    bundlePath,
    contents.map((item) => ({
      entryPath: item.entryPath,
      sourcePath: item.originalPath,
      modifiedAt: item.modifiedAt,
    }))
  );
  await verifyZipArchive(bundlePath, contents);

  const trashResult = await trashFiles(contents.map((item) => item.originalPath));
  const successfulFileIds: number[] = [];
  const archivedPaths: string[] = [];
  let freedBytes = 0;

  for (const item of contents) {
    const trashed = trashResult.results.find((result) => result.path === item.originalPath);
    if (trashed?.ok) {
      successfulFileIds.push(item.fileId);
      archivedPaths.push(item.originalPath);
      freedBytes += item.sizeBytes;
      results.push({
        fileId: item.fileId,
        path: item.originalPath,
        sizeBytes: item.sizeBytes,
        status: "archived",
      });
    } else {
      results.push({
        fileId: item.fileId,
        path: item.originalPath,
        sizeBytes: item.sizeBytes,
        status: "failed",
        reason: trashed?.error || "Failed to move original to Trash",
      });
    }
  }

  const nowIso = now.toISOString();
  const archiveSizeBytes = (await fs.promises.stat(bundlePath)).size;
  const archiveRow = db
    .insert(archives)
    .values({
      bundlePath,
      destinationDir,
      contentsJson: JSON.stringify(contents),
      originalFileCount: contents.length,
      originalBytes: contents.reduce((sum, item) => sum + item.sizeBytes, 0),
      archiveSizeBytes,
      status: "active",
      createdAt: nowIso,
    })
    .returning()
    .get();

  if (successfulFileIds.length > 0) {
    db.update(fileIndex)
      .set({ removedAt: nowIso })
      .where(inArray(fileIndex.id, successfulFileIds))
      .run();

    db.insert(cleanupActions)
      .values({
        actionType: "archive",
        filePathsJson: JSON.stringify(archivedPaths),
        bytesFreed: freedBytes,
        performedAt: nowIso,
        relatedArchiveId: archiveRow.id,
      })
      .run();
  }

  return {
    archive: toArchiveRecord(archiveRow),
    archivedCount: successfulFileIds.length,
    trashedCount: successfulFileIds.length,
    blockedCount: blocked.length,
    failedCount: trashResult.failedCount,
    freedBytes,
    results,
  };
}

export function listArchives(): ArchiveListResponse {
  const rows = db.select().from(archives).orderBy(desc(archives.createdAt)).all();
  const archiveRecords = rows.map(toArchiveRecord);
  return {
    archives: archiveRecords,
    totalArchives: archiveRecords.length,
    totalOriginalBytes: archiveRecords.reduce(
      (sum, archive) => sum + archive.originalBytes,
      0
    ),
    totalArchiveBytes: archiveRecords.reduce(
      (sum, archive) => sum + archive.archiveSizeBytes,
      0
    ),
  };
}

export function getArchiveContents(archiveId: number): ArchiveContentItem[] {
  const row = db.select().from(archives).where(eq(archives.id, archiveId)).get();
  if (!row) throw new Error("Archive not found");
  return parseContents(row.contentsJson);
}

export async function restoreArchive(params: {
  archiveId: number;
  restoreRoot?: string;
}): Promise<ArchiveRestoreResponse> {
  const row = db.select().from(archives).where(eq(archives.id, params.archiveId)).get();
  if (!row) throw new Error("Archive not found");
  if (row.status !== "active") throw new Error("Only active archives can be restored");

  const archiveBuffer = await fs.promises.readFile(row.bundlePath);
  const listingMap = new Map(
    readZipListing(archiveBuffer).map((entry) => [entry.entryPath, entry])
  );
  const contents = parseContents(row.contentsJson);
  const restoredPaths: string[] = [];
  let restoredBytes = 0;

  for (const item of contents) {
    const listing = listingMap.get(item.entryPath);
    if (!listing) throw new Error(`Archive entry missing: ${item.entryPath}`);

    const targetPath = params.restoreRoot
      ? safeRestorePath(params.restoreRoot, item.entryPath)
      : item.originalPath;
    restoredBytes += await extractZipEntry(archiveBuffer, listing, targetPath);
    restoredPaths.push(targetPath);
  }

  const nowIso = new Date().toISOString();
  db.update(archives)
    .set({ status: "restored", restoredAt: nowIso })
    .where(eq(archives.id, params.archiveId))
    .run();

  const restoredFileIds = contents.map((item) => item.fileId);
  if (restoredFileIds.length > 0) {
    db.update(fileIndex)
      .set({ removedAt: null })
      .where(inArray(fileIndex.id, restoredFileIds))
      .run();
  }

  db.insert(cleanupActions)
    .values({
      actionType: "restore",
      filePathsJson: JSON.stringify(restoredPaths),
      bytesFreed: 0,
      performedAt: nowIso,
      relatedArchiveId: params.archiveId,
    })
    .run();

  return {
    archiveId: params.archiveId,
    restoredCount: restoredPaths.length,
    restoredBytes,
    restoredPaths,
  };
}
