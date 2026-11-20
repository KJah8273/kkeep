CREATE TABLE `stick_members` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`name` text NOT NULL,
	`seen` integer NOT NULL,
	`joined` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stick_members_room` ON `stick_members` (`room`);--> statement-breakpoint
CREATE INDEX `stick_members_seen` ON `stick_members` (`seen`);--> statement-breakpoint
CREATE TABLE `stick_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room` text NOT NULL,
	`recipient` text NOT NULL,
	`payload` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stick_messages_recipient_id` ON `stick_messages` (`recipient`,`id`);--> statement-breakpoint
CREATE INDEX `stick_messages_created` ON `stick_messages` (`created`);--> statement-breakpoint
CREATE TABLE `stick_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host` text NOT NULL,
	`name` text NOT NULL,
	`private` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stick_rooms_updated` ON `stick_rooms` (`updated`);