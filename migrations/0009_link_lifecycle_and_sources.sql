CREATE TABLE `daily_visit_sources` (
	`count` integer DEFAULT 0 NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`link_id` integer NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`link_id`, `day`, `kind`, `value`),
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `links` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `links` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `links` ADD `deleted_by_account_id` integer REFERENCES accounts(id);--> statement-breakpoint
ALTER TABLE `links` ADD `unsafe_since` integer;