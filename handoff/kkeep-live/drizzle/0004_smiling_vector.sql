CREATE TABLE `hgola_saves` (
	`owner` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`previous` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated` integer NOT NULL
);
