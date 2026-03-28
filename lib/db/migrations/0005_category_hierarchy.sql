PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `categories_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`icon` text,
	`parent_id` integer,
	`type` text DEFAULT 'expense' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories_new`(`id`) ON UPDATE NO ACTION ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `categories_new` SELECT * FROM `categories`;
--> statement-breakpoint
DROP TABLE `categories`;
--> statement-breakpoint
ALTER TABLE `categories_new` RENAME TO `categories`;
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_main_name_unique` ON `categories` (`name`) WHERE `parent_id` IS NULL;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
