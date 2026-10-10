CREATE TABLE `categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`parent_id` integer,
	`sort` integer NOT NULL,
	`builtin` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY NOT NULL,
	`chat_id` integer NOT NULL,
	`message` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chats` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expense_tags` (
	`expense_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`expense_id`, `tag_id`),
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY NOT NULL,
	`note` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`category_id` integer,
	`recurring_id` integer,
	`status` text DEFAULT 'normal' NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rates` (
	`date` text NOT NULL,
	`currency` text NOT NULL,
	`rate` real NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`date`, `currency`)
);
--> statement-breakpoint
CREATE TABLE `recurring` (
	`id` integer PRIMARY KEY NOT NULL,
	`note` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`category_id` integer NOT NULL,
	`tags` text NOT NULL,
	`period` text NOT NULL,
	`every` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`needs_confirmation` integer NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`last_date` text,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`base_currency` text NOT NULL,
	`currencies` text NOT NULL,
	`theme` text NOT NULL,
	`onboarded` integer NOT NULL,
	CONSTRAINT "single_row" CHECK("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
INSERT INTO `settings` VALUES (1, 'GBP', '["GBP"]', 'system', 0);
--> statement-breakpoint
INSERT INTO `categories` (`name`, `icon`, `color`, `sort`, `builtin`) VALUES ('Uncategorised', '📦', '#71717a', 100, 1);
