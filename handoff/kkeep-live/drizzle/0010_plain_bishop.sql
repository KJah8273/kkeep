CREATE TABLE `kkeep_community_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`state` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kkeep_google_accounts` (
	`subject` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `kkeep_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kkeep_login_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`expires` integer NOT NULL
);
