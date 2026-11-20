ALTER TABLE `settings` ADD `vapid_public_key` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `vapid_private_key` text;--> statement-breakpoint
CREATE TABLE `reminders` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`origin` text NOT NULL,
	`time` text NOT NULL,
	`time_zone` text NOT NULL,
	`last_sent_on` text
);
