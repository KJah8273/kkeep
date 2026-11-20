CREATE TABLE `kkeep_game_saves` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account` text NOT NULL,
	`game` text NOT NULL,
	`data` text NOT NULL,
	`previous` text,
	`revision` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kkeep_game_saves_account_game` ON `kkeep_game_saves` (`account`,`game`);