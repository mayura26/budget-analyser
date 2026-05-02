CREATE TABLE `budget_review_shares` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `token` text NOT NULL,
  `month` text NOT NULL,
  `format` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_review_shares_token` ON `budget_review_shares` (`token`);
--> statement-breakpoint
CREATE INDEX `budget_review_shares_month_format_idx` ON `budget_review_shares` (`month`,`format`);
