CREATE TABLE `cleanup_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action_type` text NOT NULL,
	`file_paths_json` text NOT NULL,
	`bytes_freed` integer NOT NULL,
	`performed_at` text NOT NULL,
	`related_archive_id` integer
);
--> statement-breakpoint
CREATE INDEX `idx_cleanup_actions_performed` ON `cleanup_actions` (`performed_at`);
