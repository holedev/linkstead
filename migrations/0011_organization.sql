CREATE TABLE `organization` (
	`brand_color` text NOT NULL,
	`email_domains` text DEFAULT '[]' NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`name` text NOT NULL,
	`time_zone` text NOT NULL,
	`ui_logo_key` text,
	`updated_at` integer
);
