CREATE TABLE `fx_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rate_date` text NOT NULL,
	`base_currency` text NOT NULL,
	`quote_currency` text NOT NULL,
	`rate` real NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fx_rates_date_base_quote` ON `fx_rates` (`rate_date`, `base_currency`, `quote_currency`);
--> statement-breakpoint
INSERT OR IGNORE INTO `settings` (`key`, `value`, `updated_at`) VALUES ('home_currency', 'AUD', unixepoch());
