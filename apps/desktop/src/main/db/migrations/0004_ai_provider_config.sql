CREATE TABLE `ai_provider_config` (
	`provider_name` text PRIMARY KEY NOT NULL,
	`model_name` text NOT NULL,
	`is_active` integer DEFAULT 0 NOT NULL,
	`added_at` text NOT NULL
);
