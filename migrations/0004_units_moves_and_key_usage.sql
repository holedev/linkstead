CREATE TABLE `api_key_usage` (
	`api_key_id` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`minute` integer NOT NULL,
	PRIMARY KEY(`api_key_id`, `minute`),
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `unit_changes` (
	`by_account_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` integer NOT NULL,
	`new_unit_id` integer NOT NULL,
	`old_unit_id` integer NOT NULL,
	FOREIGN KEY (`by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`new_unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`old_unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `unit_changes_link_idx` ON `unit_changes` (`link_id`);--> statement-breakpoint
ALTER TABLE `units` ADD `dissolved_at` integer;