CREATE TABLE `link_password_failures` (
	`count` integer DEFAULT 0 NOT NULL,
	`link_id` integer NOT NULL,
	`minute` integer NOT NULL,
	PRIMARY KEY(`link_id`, `minute`),
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `links` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `links` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `links` ADD `qr_shape` text DEFAULT 'square' NOT NULL;