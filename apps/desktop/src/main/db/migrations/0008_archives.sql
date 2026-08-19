CREATE TABLE `archives` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `bundle_path` text NOT NULL,
  `destination_dir` text NOT NULL,
  `contents_json` text NOT NULL,
  `original_file_count` integer NOT NULL,
  `original_bytes` integer NOT NULL,
  `archive_size_bytes` integer NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` text NOT NULL,
  `restored_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archives_bundle_path_unique` ON `archives` (`bundle_path`);
--> statement-breakpoint
CREATE INDEX `idx_archives_status` ON `archives` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_archives_created_at` ON `archives` (`created_at`);
