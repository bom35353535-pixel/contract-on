CREATE TABLE `contract_stage_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_id` text NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`action` text NOT NULL,
	`actor` text DEFAULT '담당자' NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_stage_history_contract_time` ON `contract_stage_history` (`contract_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_name` text NOT NULL,
	`construction_type` text NOT NULL,
	`purpose` text NOT NULL,
	`location` text NOT NULL,
	`estimated_amount` integer NOT NULL,
	`contract_amount` integer NOT NULL,
	`company_name` text NOT NULL,
	`contract_method` text,
	`quotation_date` text,
	`purchase_request_date` text,
	`internal_approval_date` text,
	`contract_date` text,
	`planned_start_date` text,
	`actual_start_date` text,
	`planned_completion_date` text,
	`actual_completion_date` text,
	`inspection_date` text,
	`payment_date` text,
	`current_stage` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`warranty_type` text,
	`warranty_start_date` text,
	`warranty_end_date` text,
	`next_task` text,
	`next_task_date` text,
	`attention` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_contracts_current_stage` ON `contracts` (`current_stage`);--> statement-breakpoint
CREATE INDEX `idx_contracts_planned_start_date` ON `contracts` (`planned_start_date`);--> statement-breakpoint
CREATE INDEX `idx_contracts_planned_completion_date` ON `contracts` (`planned_completion_date`);