CREATE TABLE `duplicate_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hash_type` text NOT NULL,
	`representative_hash` text NOT NULL,
	`total_size_bytes` integer NOT NULL,
	`member_count` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `duplicate_group_members` (
	`group_id` integer NOT NULL,
	`file_id` integer NOT NULL,
	`similarity_score` real,
	PRIMARY KEY(`group_id`, `file_id`),
	FOREIGN KEY (`group_id`) REFERENCES `duplicate_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `file_index`(`id`) ON UPDATE no action ON DELETE cascade
);
