import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";

export const scanRuns = sqliteTable("scan_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  scopePaths: text("scope_paths").notNull(),
  status: text("status", {
    enum: ["running", "complete", "cancelled", "failed"],
  }).notNull(),
  totalFiles: integer("total_files").default(0),
  totalBytes: integer("total_bytes").default(0),
});

export const fileIndex = sqliteTable(
  "file_index",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanRunId: integer("scan_run_id")
      .notNull()
      .references(() => scanRuns.id),
    path: text("path").notNull().unique(),
    sizeBytes: integer("size_bytes").notNull(),
    extension: text("extension"),
    category: text("category").notNull(),
    createdAt: text("created_at"),
    modifiedAt: text("modified_at"),
    accessedAt: text("accessed_at"),
    contentHash: text("content_hash"),
    perceptualHash: text("perceptual_hash"),
    removedAt: text("removed_at"),
  },
  (table) => ({
    idxFileIndexHash: index("idx_file_index_hash").on(table.contentHash),
    idxFileIndexCategory: index("idx_file_index_category").on(table.category),
    idxFileIndexAccessed: index("idx_file_index_accessed").on(table.accessedAt),
  })
);

export const cleanupActions = sqliteTable(
  "cleanup_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actionType: text("action_type").notNull(),
    filePathsJson: text("file_paths_json").notNull(),
    bytesFreed: integer("bytes_freed").notNull(),
    performedAt: text("performed_at").notNull(),
    relatedArchiveId: integer("related_archive_id"),
  },
  (table) => ({
    idxCleanupActionsPerformed: index("idx_cleanup_actions_performed").on(
      table.performedAt
    ),
  })
);

export const duplicateGroups = sqliteTable("duplicate_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  hashType: text("hash_type", {
    enum: ["exact", "perceptual", "embedding"],
  }).notNull(),
  representativeHash: text("representative_hash").notNull(),
  totalSizeBytes: integer("total_size_bytes").notNull(),
  memberCount: integer("member_count").notNull(),
  createdAt: text("created_at").notNull(),
});

export const duplicateGroupMembers = sqliteTable(
  "duplicate_group_members",
  {
    groupId: integer("group_id")
      .notNull()
      .references(() => duplicateGroups.id, { onDelete: "cascade" }),
    fileId: integer("file_id")
      .notNull()
      .references(() => fileIndex.id, { onDelete: "cascade" }),
    similarityScore: real("similarity_score"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.fileId] }),
  })
);

