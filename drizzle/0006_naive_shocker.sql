PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_quotation_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`contract_id` text,
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
INSERT INTO `__new_quotation_reviews`("id", "analysis_id", "contract_id", "normal_count", "check_count", "error_count", "no_basis_count", "response_id", "warning", "created_at") SELECT "id", "analysis_id", "contract_id", "normal_count", "check_count", "error_count", "no_basis_count", "response_id", "warning", "created_at" FROM `quotation_reviews`;--> statement-breakpoint
DROP TABLE `quotation_reviews`;--> statement-breakpoint
ALTER TABLE `__new_quotation_reviews` RENAME TO `quotation_reviews`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_quotation_reviews_contract_created` ON `quotation_reviews` (`contract_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_quotation_reviews_analysis_created` ON `quotation_reviews` (`analysis_id`,`created_at`);