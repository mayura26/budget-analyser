CREATE TABLE `dismissed_mismatches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalised` text NOT NULL,
	`category_id` integer NOT NULL REFERENCES `categories`(`id`) ON DELETE CASCADE,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dismissed_mismatches_unique` ON `dismissed_mismatches` (`normalised`, `category_id`);
