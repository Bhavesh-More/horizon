-- Phase 9: AI recommendation batches and cards
-- Stores generation state separately from actual recommendation rows.

CREATE TABLE `recommendation_batches` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `scan_run_id` integer NOT NULL,
  `generation_id` text NOT NULL,
  `source_forecast_id` integer,
  `status` text NOT NULL,
  `error_category` text,
  `error_message` text,
  `provider` text,
  `model_name` text,
  `started_at` text NOT NULL,
  `completed_at` text,
  FOREIGN KEY (`scan_run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`source_forecast_id`) REFERENCES `forecasts`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `recommendation_batches_generation_id_unique`
ON `recommendation_batches` (`generation_id`);

CREATE INDEX `idx_recommendation_batches_scan_run_id`
ON `recommendation_batches` (`scan_run_id`);

CREATE INDEX `idx_recommendation_batches_generation_id`
ON `recommendation_batches` (`generation_id`);

CREATE INDEX `idx_recommendation_batches_status`
ON `recommendation_batches` (`status`);

CREATE TABLE `recommendations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `scan_run_id` integer NOT NULL,
  `batch_id` integer NOT NULL,
  `generation_id` text NOT NULL,
  `recommendation_type` text NOT NULL,
  `title` text NOT NULL,
  `reason` text NOT NULL,
  `priority` integer NOT NULL,
  `related_file_ids_json` text NOT NULL,
  `target_tab` text NOT NULL,
  `action` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `provider` text,
  `model_name` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`scan_run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`batch_id`) REFERENCES `recommendation_batches`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_recommendations_scan_run_id`
ON `recommendations` (`scan_run_id`);

CREATE INDEX `idx_recommendations_generation_id`
ON `recommendations` (`generation_id`);

CREATE INDEX `idx_recommendations_status`
ON `recommendations` (`status`);

CREATE INDEX `idx_recommendations_created_at`
ON `recommendations` (`created_at`);
