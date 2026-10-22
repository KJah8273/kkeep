CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor` text NOT NULL,
	`created` integer NOT NULL,
	`day` text NOT NULL,
	`country` text NOT NULL,
	`device` text NOT NULL,
	`browser` text NOT NULL,
	`surface` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_events_created` ON `analytics_events` (`created`);--> statement-breakpoint
CREATE INDEX `analytics_events_visitor_created` ON `analytics_events` (`visitor`,`created`);