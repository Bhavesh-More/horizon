CREATE TABLE `usage_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_date` text NOT NULL,
	`captured_at` text NOT NULL,
	`volume_total_bytes` integer NOT NULL,
	`volume_used_bytes` integer NOT NULL,
	`volume_free_bytes` integer NOT NULL,
	`is_synthetic` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_snapshots_snapshot_date_unique` ON `usage_snapshots` (`snapshot_date`);
--> statement-breakpoint
CREATE TABLE `usage_snapshot_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`category` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`segment_id` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `usage_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_category` ON `usage_snapshot_categories` (`category`,`segment_id`);
--> statement-breakpoint
CREATE TABLE `forecasts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`generated_at` text NOT NULL,
	`category` text NOT NULL,
	`model_type` text NOT NULL,
	`data_source` text NOT NULL,
	`sample_count` integer NOT NULL,
	`slope_bytes_per_day` real NOT NULL,
	`slope_low_bytes_per_day` real NOT NULL,
	`slope_high_bytes_per_day` real NOT NULL,
	`projected_full_date` text,
	`projected_full_date_low` text,
	`projected_full_date_high` text,
	`horizon_days` integer,
	`confidence_score` real NOT NULL
);
