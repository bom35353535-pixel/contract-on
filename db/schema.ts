import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const administrativeDocuments = sqliteTable(
  "administrative_documents",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    content: text("content").notNull(),
    contractMethod: text("contract_method"),
    recommendation: text("recommendation"),
    evidenceStatus: text("evidence_status"),
    sourcesJson: text("sources_json").notNull().default("[]"),
    responseId: text("response_id"),
    status: text("status").notNull().default("DRAFT"),
    confirmedAt: text("confirmed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_administrative_documents_contract_type").on(table.contractId, table.documentType)],
);

export type AdministrativeDocumentRecord = typeof administrativeDocuments.$inferSelect;

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

export const quotationAnalyses = sqliteTable(
  "quotation_analyses",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    status: text("status").notNull(),
    projectName: text("project_name"),
    constructionType: text("construction_type"),
    purpose: text("purpose"),
    location: text("location"),
    companyName: text("company_name"),
    businessRegistrationNumber: text("business_registration_number"),
    quotationDate: text("quotation_date"),
    totalAmount: integer("total_amount"),
    supplyAmount: integer("supply_amount"),
    vatAmount: integer("vat_amount"),
    materialCost: integer("material_cost"),
    directLaborCost: integer("direct_labor_cost"),
    indirectLaborCost: integer("indirect_labor_cost"),
    expenses: integer("expenses"),
    statutoryExpenses: integer("statutory_expenses"),
    overhead: integer("overhead"),
    profit: integer("profit"),
    safetyHealthCost: integer("safety_health_cost"),
    plannedStartDate: text("planned_start_date"),
    plannedCompletionDate: text("planned_completion_date"),
    extractionJson: text("extraction_json").notNull(),
    responseId: text("response_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    confirmedAt: text("confirmed_at"),
  },
  (table) => [
    index("idx_quotation_analyses_status_created").on(table.status, table.createdAt),
    index("idx_quotation_analyses_contract_id").on(table.contractId),
  ],
);

export const quotationItems = sqliteTable(
  "quotation_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    analysisId: text("analysis_id").notNull().references(() => quotationAnalyses.id, { onDelete: "cascade" }),
    category: text("category"),
    trade: text("trade"),
    itemName: text("item_name"),
    specification: text("specification"),
    unit: text("unit"),
    quantity: real("quantity"),
    unitPrice: integer("unit_price"),
    amount: integer("amount"),
    sourceText: text("source_text"),
  },
  (table) => [index("idx_quotation_items_analysis_id").on(table.analysisId)],
);

export const aiDecisionAudit = sqliteTable(
  "ai_decision_audit",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id").references(() => quotationAnalyses.id, { onDelete: "set null" }),
    contractId: text("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    sourceFile: text("source_file").notNull(),
    extractedJson: text("extracted_json").notNull(),
    aiJudgment: text("ai_judgment").notNull(),
    userCorrectedJson: text("user_corrected_json"),
    finalJson: text("final_json"),
    decidedAt: text("decided_at").notNull(),
  },
  (table) => [
    index("idx_ai_decision_audit_analysis_id").on(table.analysisId),
    index("idx_ai_decision_audit_contract_id").on(table.contractId),
  ],
);

export type QuotationAnalysisRecord = typeof quotationAnalyses.$inferSelect;
export type QuotationItemRecord = typeof quotationItems.$inferSelect;

export const quotationReviews = sqliteTable(
  "quotation_reviews",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id").notNull().references(() => quotationAnalyses.id, { onDelete: "cascade" }),
    contractId: text("contract_id").references(() => contracts.id, { onDelete: "cascade" }),
    normalCount: integer("normal_count").notNull().default(0),
    checkCount: integer("check_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    noBasisCount: integer("no_basis_count").notNull().default(0),
    responseId: text("response_id"),
    warning: text("warning"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_quotation_reviews_contract_created").on(table.contractId, table.createdAt),
    index("idx_quotation_reviews_analysis_created").on(table.analysisId, table.createdAt),
  ],
);

export const quotationReviewItems = sqliteTable(
  "quotation_review_items",
  {
    id: text("id").primaryKey(),
    reviewId: text("review_id").notNull().references(() => quotationReviews.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    targetKey: text("target_key").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull(),
    quotedValue: real("quoted_value"),
    expectedValue: real("expected_value"),
    difference: real("difference"),
    differenceRate: real("difference_rate"),
    calculation: text("calculation"),
    detail: text("detail").notNull(),
    evidenceDocumentId: text("evidence_document_id").references(() => knowledgeDocuments.id, { onDelete: "set null" }),
    evidenceDocumentName: text("evidence_document_name"),
    evidenceYear: integer("evidence_year"),
    evidenceLocation: text("evidence_location"),
    evidenceExcerpt: text("evidence_excerpt"),
  },
  (table) => [index("idx_quotation_review_items_review_status").on(table.reviewId, table.status)],
);

export type QuotationReviewRecord = typeof quotationReviews.$inferSelect;
export type QuotationReviewItemRecord = typeof quotationReviewItems.$inferSelect;

export const contractDocumentFiles = sqliteTable(
  "contract_document_files",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    documentStage: text("document_stage").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    openaiFileId: text("openai_file_id"),
    detectedType: text("detected_type"),
    detectionStatus: text("detection_status").notNull(),
    summary: text("summary"),
    uploadedAt: text("uploaded_at").notNull(),
  },
  (table) => [index("idx_contract_document_files_contract_stage_time").on(table.contractId, table.documentStage, table.uploadedAt)],
);

export const contractDocumentReviews = sqliteTable(
  "contract_document_reviews",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    documentStage: text("document_stage").notNull(),
    submittedCount: integer("submitted_count").notNull().default(0),
    missingCount: integer("missing_count").notNull().default(0),
    checkCount: integer("check_count").notNull().default(0),
    responseId: text("response_id"),
    warning: text("warning"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_contract_document_reviews_contract_stage_time").on(table.contractId, table.documentStage, table.createdAt)],
);

export const contractDocumentReviewItems = sqliteTable(
  "contract_document_review_items",
  {
    id: text("id").primaryKey(),
    reviewId: text("review_id").notNull().references(() => contractDocumentReviews.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    requiredName: text("required_name").notNull(),
    uploadedFileId: text("uploaded_file_id").references(() => contractDocumentFiles.id, { onDelete: "set null" }),
    detail: text("detail").notNull(),
    evidenceDocumentId: text("evidence_document_id").references(() => knowledgeDocuments.id, { onDelete: "set null" }),
    evidenceDocumentName: text("evidence_document_name"),
    evidenceYear: integer("evidence_year"),
    evidenceLocation: text("evidence_location"),
    evidenceExcerpt: text("evidence_excerpt"),
  },
  (table) => [index("idx_contract_document_review_items_review_status").on(table.reviewId, table.status)],
);

export type ContractDocumentFileRecord = typeof contractDocumentFiles.$inferSelect;
export type ContractDocumentReviewRecord = typeof contractDocumentReviews.$inferSelect;
export type ContractDocumentReviewItemRecord = typeof contractDocumentReviewItems.$inferSelect;

export const constructionChecklistRuns = sqliteTable(
  "construction_checklist_runs",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    responseId: text("response_id"),
    warning: text("warning"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_construction_checklist_runs_contract_time").on(table.contractId, table.createdAt)],
);

export const constructionChecklistItems = sqliteTable(
  "construction_checklist_items",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => constructionChecklistRuns.id, { onDelete: "cascade" }),
    contractId: text("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    status: text("status").notNull().default("PENDING"),
    evidenceDocumentId: text("evidence_document_id").references(() => knowledgeDocuments.id, { onDelete: "set null" }),
    evidenceDocumentName: text("evidence_document_name"),
    evidenceYear: integer("evidence_year"),
    evidenceLocation: text("evidence_location"),
    evidenceExcerpt: text("evidence_excerpt"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_construction_checklist_items_contract_status").on(table.contractId, table.status)],
);

export type ConstructionChecklistRunRecord = typeof constructionChecklistRuns.$inferSelect;
export type ConstructionChecklistItemRecord = typeof constructionChecklistItems.$inferSelect;

export const warrantyCriteria = sqliteTable("warranty_criteria", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  workName: text("work_name").notNull(),
  keywordsJson: text("keywords_json").notNull().default("[]"),
  warrantyYears: integer("warranty_years").notNull(),
  bondRate: real("bond_rate"),
  sourceName: text("source_name").notNull(),
  sourcePage: text("source_page").notNull(),
  sourceExcerpt: text("source_excerpt").notNull(),
});

export const contractWarranties = sqliteTable("contract_warranties", {
  contractId: text("contract_id").primaryKey().references(() => contracts.id, { onDelete: "cascade" }),
  criterionId: text("criterion_id").notNull().references(() => warrantyCriteria.id),
  warrantyYears: integer("warranty_years").notNull(),
  bondRate: real("bond_rate"),
  guaranteeMethod: text("guarantee_method"),
  warrantyStartDate: text("warranty_start_date").notNull(),
  warrantyEndDate: text("warranty_end_date").notNull(),
  confirmedAt: text("confirmed_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const warrantyInspections = sqliteTable("warranty_inspections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractId: text("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  status: text("status").notNull().default("SCHEDULED"),
  inspectedAt: text("inspected_at"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_warranty_inspections_contract_sequence").on(table.contractId, table.sequence),
  index("idx_warranty_inspections_contract_date").on(table.contractId, table.scheduledDate),
]);

export type WarrantyCriterionRecord = typeof warrantyCriteria.$inferSelect;
export type ContractWarrantyRecord = typeof contractWarranties.$inferSelect;
export type WarrantyInspectionRecord = typeof warrantyInspections.$inferSelect;
