CREATE TABLE `link_groups` (
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`unit_id` integer NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `link_groups_unit_name_unique` ON `link_groups` (`unit_id`,`name`);--> statement-breakpoint
ALTER TABLE `links` ADD `group_id` integer REFERENCES link_groups(id);