CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `private_friends` (
	`id` text PRIMARY KEY NOT NULL,
	`pair_key` text NOT NULL,
	`sender` text NOT NULL,
	`receiver` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sender`) REFERENCES `private_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receiver`) REFERENCES `private_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `private_friends_pair_key_unique` ON `private_friends` (`pair_key`);--> statement-breakpoint
CREATE TABLE `private_members` (
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `private_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `private_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `private_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`author_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `private_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `private_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `private_messages_room_time` ON `private_messages` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `private_oauth` (
	`state` text PRIMARY KEY NOT NULL,
	`binding_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `private_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text,
	`creator` text NOT NULL,
	`dm_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator`) REFERENCES `private_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `private_rooms_dm_key_unique` ON `private_rooms` (`dm_key`);--> statement-breakpoint
CREATE TABLE `private_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `private_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `private_users` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`username` text,
	`name` text,
	`password_hash` text,
	`avatar_key` text,
	`avatar_type` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `private_users_subject_unique` ON `private_users` (`subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `private_users_username_unique` ON `private_users` (`username`);