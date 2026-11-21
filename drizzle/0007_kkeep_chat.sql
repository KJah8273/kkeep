CREATE TABLE `kkeep_chat_avatar_cleanup` (
	`key` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `kkeep_chat_avatar_cleanup_account` ON `kkeep_chat_avatar_cleanup` (`account`,`created`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`blocker` text NOT NULL,
	`blocked` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`blocker`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blocked`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kkeep_chat_blocks_not_self" CHECK(blocker <> blocked)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_chat_blocks_pair` ON `kkeep_chat_blocks` (`blocker`,`blocked`);--> statement-breakpoint
CREATE INDEX `kkeep_chat_blocks_incoming` ON `kkeep_chat_blocks` (`blocked`,`blocker`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`read_only` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kkeep_chat_channel_readonly" CHECK(read_only IN (0,1)),
	CONSTRAINT "kkeep_chat_channel_archived" CHECK(archived IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `kkeep_chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`pair_key` text NOT NULL,
	`low` text NOT NULL,
	`high` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`low`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`high`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kkeep_chat_conversations_order" CHECK(low < high)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_chat_conversations_pair` ON `kkeep_chat_conversations` (`pair_key`);--> statement-breakpoint
CREATE INDEX `kkeep_chat_conversations_low` ON `kkeep_chat_conversations` (`low`,`updated`);--> statement-breakpoint
CREATE INDEX `kkeep_chat_conversations_high` ON `kkeep_chat_conversations` (`high`,`updated`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room` text NOT NULL,
	`message` integer NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`message`) REFERENCES `kkeep_chat_messages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kkeep_chat_event_kind" CHECK(kind IN ('created','deleted'))
);
--> statement-breakpoint
CREATE INDEX `kkeep_chat_events_room_id` ON `kkeep_chat_events` (`room`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_chat_events_message_kind` ON `kkeep_chat_events` (`message`,`kind`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_friends` (
	`id` text PRIMARY KEY NOT NULL,
	`pair_key` text NOT NULL,
	`sender` text NOT NULL,
	`receiver` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`sender`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receiver`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kkeep_chat_friends_not_self" CHECK(sender <> receiver),
	CONSTRAINT "kkeep_chat_friends_status" CHECK(status IN ('pending','accepted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_chat_friends_pair` ON `kkeep_chat_friends` (`pair_key`);--> statement-breakpoint
CREATE INDEX `kkeep_chat_friends_sender` ON `kkeep_chat_friends` (`sender`,`status`);--> statement-breakpoint
CREATE INDEX `kkeep_chat_friends_receiver` ON `kkeep_chat_friends` (`receiver`,`status`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kkeep_chat_limits_expiry` ON `kkeep_chat_limits` (`expires`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room` text NOT NULL,
	`author` text NOT NULL,
	`text` text NOT NULL,
	`client_id` text NOT NULL,
	`created` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`author`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kkeep_chat_message_deleted" CHECK(deleted IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `kkeep_chat_messages_room_id` ON `kkeep_chat_messages` (`room`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_chat_messages_retry` ON `kkeep_chat_messages` (`author`,`client_id`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_profiles` (
	`account` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`search_key` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`avatar_key` text,
	`avatar_type` text,
	`avatar_version` text,
	`banner_key` text,
	`banner_type` text,
	`banner_version` text,
	`name_color` text DEFAULT '#eeeeee' NOT NULL,
	`primary_color` text DEFAULT '#181b22' NOT NULL,
	`secondary_color` text DEFAULT '#121212' NOT NULL,
	`joined` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `kkeep_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `kkeep_chat_profiles_search` ON `kkeep_chat_profiles` (`search_key`);--> statement-breakpoint
CREATE INDEX `kkeep_chat_profiles_joined` ON `kkeep_chat_profiles` (`joined`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter` text NOT NULL,
	`message` integer NOT NULL,
	`reason` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`reporter`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message`) REFERENCES `kkeep_chat_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_chat_reports_once` ON `kkeep_chat_reports` (`reporter`,`message`);