CREATE TABLE `budget_month_reviews` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `month` text NOT NULL,
  `format` text NOT NULL,
  `review_json` text NOT NULL,
  `metrics_json` text NOT NULL,
  `model` text NOT NULL,
  `generated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_month_reviews_month_format` ON `budget_month_reviews` (`month`,`format`);
