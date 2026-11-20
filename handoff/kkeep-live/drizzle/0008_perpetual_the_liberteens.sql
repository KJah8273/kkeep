CREATE TABLE `kkeep_video_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account` text NOT NULL,
	`channel` text NOT NULL,
	`name` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_video_owner_channel` ON `kkeep_video_channels` (`account`,`channel`);--> statement-breakpoint
CREATE TABLE `kkeep_video_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account` text NOT NULL,
	`video` text NOT NULL,
	`data` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`duration` integer DEFAULT 0 NOT NULL,
	`watched` integer DEFAULT 0 NOT NULL,
	`saved` integer DEFAULT 0 NOT NULL,
	`liked` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL,
	`session` text,
	`seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_video_owner_video` ON `kkeep_video_items` (`account`,`video`);--> statement-breakpoint
CREATE INDEX `kkeep_video_recent` ON `kkeep_video_items` (`account`,`updated`);