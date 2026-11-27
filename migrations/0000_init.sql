CREATE TABLE `accounts` (
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`email` text NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_system_admin` integer DEFAULT false NOT NULL,
	`locked_until` integer,
	`password_hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_email_unique` ON `accounts` (`email`);--> statement-breakpoint
CREATE TABLE `api_key_usage` (
	`api_key_id` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`minute` integer NOT NULL,
	PRIMARY KEY(`api_key_id`, `minute`),
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_account_id` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key_hash` text NOT NULL,
	`name` text NOT NULL,
	`revoked_at` integer,
	`unit_id` integer NOT NULL,
	FOREIGN KEY (`created_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
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
CREATE TABLE `daily_visits` (
	`count` integer DEFAULT 0 NOT NULL,
	`day` text NOT NULL,
	`link_id` integer NOT NULL,
	PRIMARY KEY(`link_id`, `day`),
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `link_groups` (
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`unit_id` integer NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `link_groups_unit_name_unique` ON `link_groups` (`unit_id`,`name`);--> statement-breakpoint
CREATE TABLE `link_password_failures` (
	`count` integer DEFAULT 0 NOT NULL,
	`link_id` integer NOT NULL,
	`minute` integer NOT NULL,
	PRIMARY KEY(`link_id`, `minute`),
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `links` (
	`archived_at` integer,
	`code` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by_account_id` integer,
	`created_by_api_key_id` integer,
	`deleted_at` integer,
	`deleted_by_account_id` integer,
	`disabled_by_system` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`group_id` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`logo_choice` text DEFAULT 'inherit' NOT NULL,
	`logo_key` text,
	`logo_scale` integer DEFAULT 100 NOT NULL,
	`name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`password_hash` text,
	`preview_description` text DEFAULT '' NOT NULL,
	`preview_image` text DEFAULT '' NOT NULL,
	`preview_title` text DEFAULT '' NOT NULL,
	`qr_shape` text DEFAULT 'square' NOT NULL,
	`redirect_type` integer DEFAULT 302 NOT NULL,
	`target` text NOT NULL,
	`unit_id` integer NOT NULL,
	`unsafe_since` integer,
	FOREIGN KEY (`created_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `link_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_code_unique` ON `links` (`code`);--> statement-breakpoint
CREATE INDEX `links_unit_idx` ON `links` (`unit_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`account_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`role` text NOT NULL,
	`unit_id` integer NOT NULL,
	PRIMARY KEY(`account_id`, `unit_id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `password_setups` (
	`account_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`token_hash` text PRIMARY KEY NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `redirect_changes` (
	`by_account_id` integer,
	`by_api_key_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` integer NOT NULL,
	`new_type` integer NOT NULL,
	`old_type` integer NOT NULL,
	FOREIGN KEY (`by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`by_api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `redirect_changes_link_idx` ON `redirect_changes` (`link_id`);--> statement-breakpoint
CREATE TABLE `reserved_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`account_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`token_hash` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_account_idx` ON `sessions` (`account_id`);--> statement-breakpoint
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
CREATE INDEX `status_changes_link_idx` ON `status_changes` (`link_id`);--> statement-breakpoint
CREATE TABLE `target_changes` (
	`by_account_id` integer,
	`by_api_key_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` integer NOT NULL,
	`new_target` text NOT NULL,
	`old_target` text NOT NULL,
	FOREIGN KEY (`by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`by_api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `target_changes_link_idx` ON `target_changes` (`link_id`);--> statement-breakpoint
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
CREATE TABLE `units` (
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`dissolved_at` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`logo_key` text,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `units_name_unique` ON `units` (`name`);--> statement-breakpoint
CREATE TABLE `visit_rollup` (
	`id` integer PRIMARY KEY NOT NULL,
	`rolled_through` integer NOT NULL
);
