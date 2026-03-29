CREATE TABLE `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`category_id` integer NOT NULL REFERENCES `categories`(`id`) ON DELETE CASCADE,
	`target_amount` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_month_category` ON `budgets` (`month`, `category_id`);
--> statement-breakpoint
CREATE INDEX `budgets_month_idx` ON `budgets` (`month`);
