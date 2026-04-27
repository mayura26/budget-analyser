ALTER TABLE `scheduled_transactions` ADD `internal_name` text;
--> statement-breakpoint
ALTER TABLE `scheduled_transactions` ADD `display_name` text;
--> statement-breakpoint
UPDATE `scheduled_transactions`
SET
  `internal_name` = LOWER(TRIM(`name`)),
  `display_name` = `name`
WHERE `internal_name` IS NULL OR `display_name` IS NULL;
--> statement-breakpoint
CREATE TABLE `muted_schedule_suggestions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `signature` text NOT NULL,
  `internal_name` text NOT NULL,
  `frequency` text NOT NULL,
  `amount_rounded` real NOT NULL,
  `reason` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `muted_schedule_suggestions_signature_unique` ON `muted_schedule_suggestions` (`signature`);
--> statement-breakpoint
CREATE INDEX `muted_schedule_suggestions_internal_name_idx` ON `muted_schedule_suggestions` (`internal_name`);
