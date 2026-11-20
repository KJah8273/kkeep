CREATE TABLE `browser_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `browser_items_owner_kind_created` ON `browser_items` (`owner`,`kind`,`created`);--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`message` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ideas_owner_created` ON `ideas` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `ideas_created` ON `ideas` (`created`);