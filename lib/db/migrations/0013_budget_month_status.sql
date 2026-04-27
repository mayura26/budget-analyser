CREATE TABLE `budget_month_status` (
  `month` text PRIMARY KEY NOT NULL,
  `is_closed` integer DEFAULT false NOT NULL,
  `closed_at` integer,
  `review_generated_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budget_month_status_closed_idx` ON `budget_month_status` (`is_closed`);
