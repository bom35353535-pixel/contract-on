CREATE TABLE `construction_checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`evidence_document_id` text,
	`evidence_document_name` text,
	`evidence_year` integer,
	`evidence_location` text,
	`evidence_excerpt` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `construction_checklist_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_document_id`) REFERENCES `knowledge_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_construction_checklist_items_contract_status` ON `construction_checklist_items` (`contract_id`,`status`);--> statement-breakpoint
CREATE TABLE `construction_checklist_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`response_id` text,
	`warning` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_construction_checklist_runs_contract_time` ON `construction_checklist_runs` (`contract_id`,`created_at`);