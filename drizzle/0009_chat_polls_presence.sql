CREATE TABLE `kkeep_chat_poll_ballots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message` integer NOT NULL,
	`account` text NOT NULL,
	`options` text NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`message`) REFERENCES `kkeep_chat_polls`(`message`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_chat_poll_ballot_account` ON `kkeep_chat_poll_ballots` (`message`,`account`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_poll_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message` integer NOT NULL,
	`room` text NOT NULL,
	FOREIGN KEY (`message`) REFERENCES `kkeep_chat_polls`(`message`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_chat_poll_update_message` ON `kkeep_chat_poll_updates` (`message`);--> statement-breakpoint
CREATE INDEX `kkeep_chat_poll_updates_room_id` ON `kkeep_chat_poll_updates` (`room`,`id`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_polls` (
	`message` integer PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`allow_multiple` integer DEFAULT 0 NOT NULL,
	`closes_at` integer NOT NULL,
	`closed_at` integer,
	`revision` text NOT NULL,
	FOREIGN KEY (`message`) REFERENCES `kkeep_chat_messages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kkeep_chat_poll_multiple" CHECK(allow_multiple IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `kkeep_chat_presence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account` text NOT NULL,
	`client` text NOT NULL,
	`sequence` integer NOT NULL,
	`expires` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_chat_presence_account_client` ON `kkeep_chat_presence` (`account`,`client`);--> statement-breakpoint
CREATE INDEX `kkeep_chat_presence_account_expiry` ON `kkeep_chat_presence` (`account`,`expires`);--> statement-breakpoint
ALTER TABLE `kkeep_chat_messages` ADD `kind` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `kkeep_chat_profiles` ADD `profile_frame` text DEFAULT 'none' NOT NULL;