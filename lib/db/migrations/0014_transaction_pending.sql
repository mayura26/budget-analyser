ALTER TABLE `transactions` ADD `pending` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `merchant` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `account_reference` text;
--> statement-breakpoint
CREATE INDEX `transactions_account_pending_idx` ON `transactions` (`account_id`,`pending`);
