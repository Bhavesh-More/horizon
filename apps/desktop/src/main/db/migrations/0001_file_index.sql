CREATE TABLE `file_index` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_run_id` integer NOT NULL,
	`path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`extension` text,
	`category` text NOT NULL,
	`created_at` text,
	`modified_at` text,
	`accessed_at` text,
	`content_hash` text,
	`perceptual_hash` text,
	`removed_at` text,
	FOREIGN KEY (`scan_run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_index_path_unique` ON `file_index` (`path`);
--> statement-breakpoint
CREATE INDEX `idx_file_index_hash` ON `file_index` (`content_hash`);
--> statement-breakpoint
CREATE INDEX `idx_file_index_category` ON `file_index` (`category`);
--> statement-breakpoint
CREATE INDEX `idx_file_index_accessed` ON `file_index` (`accessed_at`);
