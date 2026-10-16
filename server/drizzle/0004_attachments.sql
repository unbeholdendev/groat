CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY NOT NULL,
	`expense_id` integer,
	`mime` text NOT NULL,
	`bytes` blob NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade
);
