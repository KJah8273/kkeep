CREATE TABLE `kkeep_media` (
	`key` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account` text NOT NULL,
	`id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_media_owner_id` ON `kkeep_media` (`account`,`id`);