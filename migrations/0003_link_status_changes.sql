CREATE TABLE `status_changes` (
	`by_account_id` integer,
	`by_api_key_id` integer,
	`by_system` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`enabled` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` integer NOT NULL,
	FOREIGN KEY (`by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`by_api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `status_changes_link_idx` ON `status_changes` (`link_id`);