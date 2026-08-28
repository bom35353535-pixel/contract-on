CREATE TABLE `quotation_review_items` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`section` text NOT NULL,
	`target_key` text NOT NULL,
	`label` text NOT NULL,
	`status` text NOT NULL,
	`quoted_value` real,
	`expected_value` real,
	`difference` real,
	`difference_rate` real,
	`calculation` text,
	`detail` text NOT NULL,
	`evidence_document_id` text,
	`evidence_document_name` text,
	`evidence_year` integer,
	`evidence_location` text,
	`evidence_excerpt` text,
	FOREIGN KEY (`review_id`) REFERENCES `quotation_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_document_id`) REFERENCES `knowledge_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_quotation_review_items_review_status` ON `quotation_review_items` (`review_id`,`status`);--> statement-breakpoint
CREATE TABLE `quotation_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`normal_count` integer DEFAULT 0 NOT NULL,
	`check_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`no_basis_count` integer DEFAULT 0 NOT NULL,
	`response_id` text,
	`warning` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `quotation_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_quotation_reviews_contract_created` ON `quotation_reviews` (`contract_id`,`created_at`);