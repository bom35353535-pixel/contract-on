import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const contracts = sqliteTable(
  "contracts",
  {
    id: text("id").primaryKey(),
    projectName: text("project_name").notNull(),
    constructionType: text("construction_type").notNull(),
    purpose: text("purpose").notNull(),
    location: text("location").notNull(),
    estimatedAmount: integer("estimated_amount").notNull(),
    contractAmount: integer("contract_amount").notNull(),
    companyName: text("company_name").notNull(),
    contractMethod: text("contract_method"),
    quotationDate: text("quotation_date"),
    purchaseRequestDate: text("purchase_request_date"),
    internalApprovalDate: text("internal_approval_date"),
    contractDate: text("contract_date"),
    plannedStartDate: text("planned_start_date"),
    actualStartDate: text("actual_start_date"),
    plannedCompletionDate: text("planned_completion_date"),
    actualCompletionDate: text("actual_completion_date"),
    inspectionDate: text("inspection_date"),
    paymentDate: text("payment_date"),
    currentStage: text("current_stage").notNull(),
    progress: integer("progress").notNull().default(0),
    warrantyType: text("warranty_type"),
    warrantyStartDate: text("warranty_start_date"),
    warrantyEndDate: text("warranty_end_date"),
    nextTask: text("next_task"),
    nextTaskDate: text("next_task_date"),
    attention: text("attention"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_contracts_current_stage").on(table.currentStage),
    index("idx_contracts_planned_start_date").on(table.plannedStartDate),
    index("idx_contracts_planned_completion_date").on(table.plannedCompletionDate),
  ],
);

export const contractStageHistory = sqliteTable(
  "contract_stage_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contractId: text("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),
    action: text("action").notNull(),
    actor: text("actor").notNull().default("담당자"),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [index("idx_stage_history_contract_time").on(table.contractId, table.occurredAt)],
);

export type ContractRecord = typeof contracts.$inferSelect;
export type StageHistoryRecord = typeof contractStageHistory.$inferSelect;

export const knowledgeDocuments = sqliteTable(
  "knowledge_documents",
  {
    id: text("id").primaryKey(),
    documentName: text("document_name").notNull(),
    originalName: text("original_name").notNull(),
    category: text("category").notNull(),
    year: integer("year"),
    effectiveFrom: text("effective_from"),
    effectiveTo: text("effective_to"),
    uploadedAt: text("uploaded_at").notNull(),
    status: text("status").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    sourceKind: text("source_kind").notNull(),
    openaiFileId: text("openai_file_id"),
    vectorStoreFileId: text("vector_store_file_id"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_knowledge_documents_status_uploaded").on(table.status, table.uploadedAt),
    index("idx_knowledge_documents_category_year").on(table.category, table.year),
  ],
);

export const knowledgeSettings = sqliteTable("knowledge_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const knowledgeQueries = sqliteTable(
  "knowledge_queries",
  {
    id: text("id").primaryKey(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    evidenceStatus: text("evidence_status").notNull(),
    sourcesJson: text("sources_json").notNull(),
    responseId: text("response_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_knowledge_queries_created_at").on(table.createdAt)],
);

export type KnowledgeDocumentRecord = typeof knowledgeDocuments.$inferSelect;
export type KnowledgeQueryRecord = typeof knowledgeQueries.$inferSelect;
