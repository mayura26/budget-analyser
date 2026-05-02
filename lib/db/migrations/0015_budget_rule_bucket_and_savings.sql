ALTER TABLE `categories` ADD `budget_rule_bucket` text;
--> statement-breakpoint
UPDATE `categories` SET `type` = 'savings' WHERE `name` = 'Savings & Investing' AND `parent_id` IS NULL;
--> statement-breakpoint
UPDATE `categories` SET `type` = 'savings' WHERE `parent_id` IN (SELECT `id` FROM `categories` WHERE `name` = 'Savings & Investing' AND `parent_id` IS NULL);
--> statement-breakpoint
UPDATE `categories` SET `budget_rule_bucket` = 'none' WHERE `parent_id` IS NULL AND `name` = 'Money IN';
--> statement-breakpoint
UPDATE `categories` SET `budget_rule_bucket` = 'none' WHERE `parent_id` IS NULL AND `name` = 'Transfers';
--> statement-breakpoint
UPDATE `categories` SET `budget_rule_bucket` = 'needs' WHERE `parent_id` IS NULL AND `name` IN ('Living Costs', 'Essentials');
--> statement-breakpoint
UPDATE `categories` SET `budget_rule_bucket` = 'wants' WHERE `parent_id` IS NULL AND `name` IN ('Enjoyment', 'Special', 'Misc');
--> statement-breakpoint
UPDATE `categories` SET `budget_rule_bucket` = 'savings' WHERE `parent_id` IS NULL AND `name` = 'Savings & Investing';
