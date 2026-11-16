CREATE TEMP TABLE saved_attachments AS SELECT * FROM attachments;
--> statement-breakpoint
CREATE TEMP TABLE saved_transaction_tags AS SELECT * FROM transaction_tags;
--> statement-breakpoint
CREATE TABLE `new_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_request_id` text,
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
	`created_by` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO new_transactions SELECT * FROM transactions;
--> statement-breakpoint
DROP TABLE transactions;
--> statement-breakpoint
ALTER TABLE new_transactions RENAME TO transactions;
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_clientRequestId_unique` ON `transactions` (`client_request_id`);
--> statement-breakpoint
INSERT OR REPLACE INTO attachments SELECT * FROM saved_attachments;
--> statement-breakpoint
INSERT OR REPLACE INTO transaction_tags SELECT * FROM saved_transaction_tags;
--> statement-breakpoint
DROP TABLE saved_attachments;
--> statement-breakpoint
DROP TABLE saved_transaction_tags;
