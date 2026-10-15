ALTER TABLE `expenses` ADD `created_by` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `users` ADD `deleted_at` text;--> statement-breakpoint
UPDATE `expenses` SET `created_by` = (SELECT min(`id`) FROM `users` WHERE `role` = 'admin');
