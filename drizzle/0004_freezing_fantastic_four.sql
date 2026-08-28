CREATE TABLE `administrative_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`document_type` text NOT NULL,
	`content` text NOT NULL,
	`contract_method` text,
	`recommendation` text,
	`evidence_status` text,
	`sources_json` text DEFAULT '[]' NOT NULL,
	`response_id` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_administrative_documents_contract_type` ON `administrative_documents` (`contract_id`,`document_type`);