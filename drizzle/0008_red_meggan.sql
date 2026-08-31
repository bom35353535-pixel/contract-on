CREATE TABLE `contract_warranties` (
	`contract_id` text PRIMARY KEY NOT NULL,
	`criterion_id` text NOT NULL,
	`warranty_years` integer NOT NULL,
	`bond_rate` real,
	`warranty_start_date` text NOT NULL,
	`warranty_end_date` text NOT NULL,
	`confirmed_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criterion_id`) REFERENCES `warranty_criteria`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `warranty_criteria` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`work_name` text NOT NULL,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`warranty_years` integer NOT NULL,
	`bond_rate` real,
	`source_name` text NOT NULL,
	`source_page` text NOT NULL,
	`source_excerpt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `warranty_inspections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contract_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`scheduled_date` text NOT NULL,
	`status` text DEFAULT 'SCHEDULED' NOT NULL,
	`inspected_at` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_warranty_inspections_contract_sequence` ON `warranty_inspections` (`contract_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_warranty_inspections_contract_date` ON `warranty_inspections` (`contract_id`,`scheduled_date`);