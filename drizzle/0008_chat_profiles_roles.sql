CREATE TABLE `kkeep_chat_member_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account` text NOT NULL,
	`role` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role`) REFERENCES `kkeep_chat_roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_chat_member_role_pair` ON `kkeep_chat_member_roles` (`account`,`role`);--> statement-breakpoint
CREATE INDEX `kkeep_chat_member_roles_role` ON `kkeep_chat_member_roles` (`role`,`account`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_moderation` (
	`account` text PRIMARY KEY NOT NULL,
	`banned` integer DEFAULT 0 NOT NULL,
	`timeout_until` integer,
	`reason` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `kkeep_chat_profiles`(`account`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `kkeep_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kkeep_chat_moderation_banned" CHECK(banned IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `kkeep_chat_owner` (
	`id` integer PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `kkeep_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kkeep_chat_owner_singleton" CHECK(id=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_chat_owner_account_unique` ON `kkeep_chat_owner` (`account`);--> statement-breakpoint
CREATE TABLE `kkeep_chat_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`position` integer NOT NULL,
	`permissions` integer NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	CONSTRAINT "kkeep_chat_role_position" CHECK(position BETWEEN 1 AND 9999),
	CONSTRAINT "kkeep_chat_role_permissions" CHECK(permissions BETWEEN 0 AND 15)
);
--> statement-breakpoint
ALTER TABLE `kkeep_chat_profiles` ADD `avatar_decoration` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `kkeep_chat_profiles` ADD `nameplate_style` text DEFAULT 'none' NOT NULL;