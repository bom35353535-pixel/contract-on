CREATE TABLE `knowledge_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`document_name` text NOT NULL,
	`original_name` text NOT NULL,
	`category` text NOT NULL,
	`year` integer,
	`effective_from` text,
	`effective_to` text,
	`uploaded_at` text NOT NULL,
	`status` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_key` text NOT NULL,
	`source_kind` text NOT NULL,
	`openai_file_id` text,
	`vector_store_file_id` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_documents_status_uploaded` ON `knowledge_documents` (`status`,`uploaded_at`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_documents_category_year` ON `knowledge_documents` (`category`,`year`);--> statement-breakpoint
CREATE TABLE `knowledge_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`evidence_status` text NOT NULL,
	`sources_json` text NOT NULL,
	`response_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_queries_created_at` ON `knowledge_queries` (`created_at`);--> statement-breakpoint
CREATE TABLE `knowledge_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
