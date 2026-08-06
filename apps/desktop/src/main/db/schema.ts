import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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
