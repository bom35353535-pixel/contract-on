CREATE TABLE `contract_document_files` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`document_stage` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_key` text NOT NULL,
	`openai_file_id` text,
	`detected_type` text,
	`detection_status` text NOT NULL,
	`summary` text,
	`uploaded_at` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_contract_document_files_contract_stage_time` ON `contract_document_files` (`contract_id`,`document_stage`,`uploaded_at`);--> statement-breakpoint
CREATE TABLE `contract_document_review_items` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`status` text NOT NULL,
	`required_name` text NOT NULL,
	`uploaded_file_id` text,
	`detail` text NOT NULL,
	`evidence_document_id` text,
	`evidence_document_name` text,
	`evidence_year` integer,
	`evidence_location` text,
	`evidence_excerpt` text,
	FOREIGN KEY (`review_id`) REFERENCES `contract_document_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_file_id`) REFERENCES `contract_document_files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`evidence_document_id`) REFERENCES `knowledge_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_contract_document_review_items_review_status` ON `contract_document_review_items` (`review_id`,`status`);--> statement-breakpoint
CREATE TABLE `contract_document_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`document_stage` text NOT NULL,
	`submitted_count` integer DEFAULT 0 NOT NULL,
	`missing_count` integer DEFAULT 0 NOT NULL,
	`check_count` integer DEFAULT 0 NOT NULL,
	`response_id` text,
	`warning` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_contract_document_reviews_contract_stage_time` ON `contract_document_reviews` (`contract_id`,`document_stage`,`created_at`);