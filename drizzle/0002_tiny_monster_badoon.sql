CREATE TABLE `ai_decision_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text,
	`contract_id` text,
	`action` text NOT NULL,
	`source_file` text NOT NULL,
	`extracted_json` text NOT NULL,
	`ai_judgment` text NOT NULL,
	`user_corrected_json` text,
	`final_json` text,
	`decided_at` text NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `quotation_analyses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_ai_decision_audit_analysis_id` ON `ai_decision_audit` (`analysis_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_decision_audit_contract_id` ON `ai_decision_audit` (`contract_id`);--> statement-breakpoint
CREATE TABLE `quotation_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_key` text NOT NULL,
	`status` text NOT NULL,
	`project_name` text,
	`construction_type` text,
	`purpose` text,
	`location` text,
	`company_name` text,
	`quotation_date` text,
	`total_amount` integer,
	`supply_amount` integer,
	`vat_amount` integer,
	`material_cost` integer,
	`direct_labor_cost` integer,
	`indirect_labor_cost` integer,
	`expenses` integer,
	`statutory_expenses` integer,
	`overhead` integer,
	`profit` integer,
	`safety_health_cost` integer,
	`planned_start_date` text,
	`planned_completion_date` text,
	`extraction_json` text NOT NULL,
	`response_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`confirmed_at` text,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_quotation_analyses_status_created` ON `quotation_analyses` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_quotation_analyses_contract_id` ON `quotation_analyses` (`contract_id`);--> statement-breakpoint
CREATE TABLE `quotation_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`analysis_id` text NOT NULL,
	`category` text,
	`trade` text,
	`item_name` text,
	`specification` text,
	`unit` text,
	`quantity` real,
	`unit_price` integer,
	`amount` integer,
	`source_text` text,
	FOREIGN KEY (`analysis_id`) REFERENCES `quotation_analyses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_quotation_items_analysis_id` ON `quotation_items` (`analysis_id`);