ALTER TABLE `categories` ADD `kind` text DEFAULT 'expense' NOT NULL;--> statement-breakpoint
INSERT INTO `categories` (`name`, `icon`, `color`, `sort`, `kind`) VALUES ('Salary', '💼', '#3fbe90', 0, 'income');
--> statement-breakpoint
INSERT INTO `categories` (`name`, `icon`, `color`, `sort`, `builtin`, `kind`) VALUES ('Other income', '💰', '#71717a', 100, 1, 'income');
