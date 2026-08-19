import { ipcMain } from "electron";
import {
  ArchiveContentsRequestSchema,
  ArchiveCreateRequestSchema,
  ArchiveListRequestSchema,
  ArchiveRestoreRequestSchema,
} from "@horizon/shared-types";
import {
  createArchiveFromFileIds,
  getArchiveContents,
  listArchives,
  restoreArchive,
} from "../services/archiver";

export function registerArchiveIpc() {
  ipcMain.handle("archive:create", async (_event, payload: unknown) => {
    try {
      const validated = ArchiveCreateRequestSchema.parse(payload);
      const data = await createArchiveFromFileIds(validated);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "ARCHIVE_CREATE_FAILED",
          message: err.message || "Failed to create archive",
        },
      };
    }
  });

  ipcMain.handle("archive:list", async (_event, payload: unknown) => {
    try {
      ArchiveListRequestSchema.parse(payload);
      const data = listArchives();
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "ARCHIVE_LIST_FAILED",
          message: err.message || "Failed to list archives",
        },
      };
    }
  });

  ipcMain.handle("archive:contents", async (_event, payload: unknown) => {
    try {
      const validated = ArchiveContentsRequestSchema.parse(payload);
      const data = {
        archiveId: validated.archiveId,
        contents: getArchiveContents(validated.archiveId),
      };
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "ARCHIVE_CONTENTS_FAILED",
          message: err.message || "Failed to load archive contents",
        },
      };
    }
  });

  ipcMain.handle("archive:restore", async (_event, payload: unknown) => {
    try {
      const validated = ArchiveRestoreRequestSchema.parse(payload);
      const data = await restoreArchive(validated);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "ARCHIVE_RESTORE_FAILED",
          message: err.message || "Failed to restore archive",
        },
      };
    }
  });
}
