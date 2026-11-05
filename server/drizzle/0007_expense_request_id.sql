ALTER TABLE `expenses` ADD `client_request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_clientRequestId_unique` ON `expenses` (`client_request_id`);