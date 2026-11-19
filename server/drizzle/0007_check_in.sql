ALTER TABLE `settings` ADD `check_ins` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `last_check_in_at` text;--> statement-breakpoint
ALTER TABLE `chats` ADD `check_in` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `chats` ADD `unread` integer DEFAULT false NOT NULL;
