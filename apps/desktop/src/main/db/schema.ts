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

export const aiProviderConfig = sqliteTable("ai_provider_config", {
  providerName: text("provider_name", {
    enum: ["ollama", "openai", "anthropic", "groq", "openrouter"],
  }).primaryKey(),
  modelName: text("model_name").notNull(),
  isActive: integer("is_active").notNull().default(0),
  baseUrl: text("base_url"), // For Ollama: null = local (127.0.0.1:11434), set = remote API endpoint
  addedAt: text("added_at").notNull(),
});

export const usageSnapshots = sqliteTable("usage_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotDate: text("snapshot_date").notNull().unique(), // YYYY-MM-DD
  capturedAt: text("captured_at").notNull(), // ISO timestamp
  volumeTotalBytes: integer("volume_total_bytes").notNull(),
  volumeUsedBytes: integer("volume_used_bytes").notNull(),
  volumeFreeBytes: integer("volume_free_bytes").notNull(),
  isSynthetic: integer("is_synthetic").notNull().default(0),
});

export const usageSnapshotCategories = sqliteTable(
  "usage_snapshot_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => usageSnapshots.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    segmentId: integer("segment_id").notNull().default(0),
  },
  (table) => ({
    idxSnapshotCategory: index("idx_snapshot_category").on(
      table.category,
      table.segmentId
    ),
  })
);

export const forecasts = sqliteTable("forecasts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  generatedAt: text("generated_at").notNull(),
  category: text("category").notNull(), // '__total__' or category name
  modelType: text("model_type").notNull(), // 'theil_sen'
  dataSource: text("data_source", {
    enum: ["bootstrap", "blended", "tracked"],
  }).notNull(),
  sampleCount: integer("sample_count").notNull(),
  slopeBytesPerDay: real("slope_bytes_per_day").notNull(),
  slopeLowBytesPerDay: real("slope_low_bytes_per_day").notNull(),
  slopeHighBytesPerDay: real("slope_high_bytes_per_day").notNull(),
  projectedFullDate: text("projected_full_date"),
  projectedFullDateLow: text("projected_full_date_low"),
  projectedFullDateHigh: text("projected_full_date_high"),
  horizonDays: integer("horizon_days"),
  confidenceScore: real("confidence_score").notNull(),
});

export const recommendationBatches = sqliteTable(
  "recommendation_batches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanRunId: integer("scan_run_id")
      .notNull()
      .references(() => scanRuns.id),
    generationId: text("generation_id").notNull().unique(),
    sourceForecastId: integer("source_forecast_id").references(() => forecasts.id),
    status: text("status", {
      enum: ["running", "complete", "no_results", "failed", "stale"],
    }).notNull(),
    errorCategory: text("error_category", {
      enum: [
        "not_configured",
        "provider_unavailable",
        "authentication_failed",
        "quota_exceeded",
        "network_error",
        "timeout",
        "invalid_response",
        "unknown",
      ],
    }),
    errorMessage: text("error_message"),
    provider: text("provider"),
    modelName: text("model_name"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => ({
    idxRecommendationBatchesScanRunId: index(
      "idx_recommendation_batches_scan_run_id"
    ).on(table.scanRunId),
    idxRecommendationBatchesGenerationId: index(
      "idx_recommendation_batches_generation_id"
    ).on(table.generationId),
    idxRecommendationBatchesStatus: index(
      "idx_recommendation_batches_status"
    ).on(table.status),
  })
);

export const recommendations = sqliteTable(
  "recommendations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanRunId: integer("scan_run_id")
      .notNull()
      .references(() => scanRuns.id),
    batchId: integer("batch_id")
      .notNull()
      .references(() => recommendationBatches.id, { onDelete: "cascade" }),
    generationId: text("generation_id").notNull(),
    recommendationType: text("recommendation_type", {
      enum: ["duplicate", "unused", "large_file", "archive", "forecast", "cleanup"],
    }).notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    priority: integer("priority").notNull(),
    relatedFileIdsJson: text("related_file_ids_json").notNull(),
    targetTab: text("target_tab", {
      enum: ["duplicates", "unused", "large_files", "forecast", "overview"],
    }).notNull(),
    action: text("action", { enum: ["review"] }).notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "dismissed"],
    }).notNull().default("pending"),
    provider: text("provider"),
    modelName: text("model_name"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    idxRecommendationsScanRunId: index("idx_recommendations_scan_run_id").on(
      table.scanRunId
    ),
    idxRecommendationsGenerationId: index(
      "idx_recommendations_generation_id"
    ).on(table.generationId),
    idxRecommendationsStatus: index("idx_recommendations_status").on(
      table.status
    ),
    idxRecommendationsCreatedAt: index("idx_recommendations_created_at").on(
      table.createdAt
    ),
  })
);

export const archives = sqliteTable(
  "archives",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bundlePath: text("bundle_path").notNull().unique(),
    destinationDir: text("destination_dir").notNull(),
    contentsJson: text("contents_json").notNull(),
    originalFileCount: integer("original_file_count").notNull(),
    originalBytes: integer("original_bytes").notNull(),
    archiveSizeBytes: integer("archive_size_bytes").notNull(),
    status: text("status", {
      enum: ["active", "restored", "deleted"],
    })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull(),
    restoredAt: text("restored_at"),
  },
  (table) => ({
    idxArchivesStatus: index("idx_archives_status").on(table.status),
    idxArchivesCreatedAt: index("idx_archives_created_at").on(table.createdAt),
  })
);
