CREATE TABLE `account_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL DEFAULT '#6366f1',
	`created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD COLUMN `group_id` integer REFERENCES `account_groups`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `linked_transaction_id` integer;
--> statement-breakpoint
CREATE INDEX `transactions_linked_idx` ON `transactions` (`linked_transaction_id`);
