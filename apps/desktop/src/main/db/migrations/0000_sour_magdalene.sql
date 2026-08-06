CREATE TABLE `scan_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`scope_paths` text NOT NULL,
	`status` text NOT NULL,
	`total_files` integer DEFAULT 0,
	`total_bytes` integer DEFAULT 0
);
