CREATE TABLE `party_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`game` text NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `party_rooms_updated` ON `party_rooms` (`updated`);--> statement-breakpoint
CREATE INDEX `party_rooms_creator_created` ON `party_rooms` (`created_by`,`created`);