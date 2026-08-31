import { getD1 } from ".";
import { SAMPLE_CONTRACTS } from "./sample-data";

let initialization: Promise<void> | null = null;

const CREATE_CONTRACTS = `
  CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY NOT NULL,
    project_name TEXT NOT NULL,
    construction_type TEXT NOT NULL,
    purpose TEXT NOT NULL,
    location TEXT NOT NULL,
    estimated_amount INTEGER NOT NULL,
    contract_amount INTEGER NOT NULL,
    company_name TEXT NOT NULL,
    contract_method TEXT,
    quotation_date TEXT,
    purchase_request_date TEXT,
    internal_approval_date TEXT,
    contract_date TEXT,
    planned_start_date TEXT,
    actual_start_date TEXT,
    planned_completion_date TEXT,
    actual_completion_date TEXT,
    inspection_date TEXT,
    payment_date TEXT,
    current_stage TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    warranty_type TEXT,
    warranty_start_date TEXT,
    warranty_end_date TEXT,
    next_task TEXT,
    next_task_date TEXT,
    attention TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const CREATE_HISTORY = `
  CREATE TABLE IF NOT EXISTS contract_stage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    contract_id TEXT NOT NULL,
    from_stage TEXT,
    to_stage TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT '담당자',
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
  )
`;

const CREATE_ADMINISTRATIVE_DOCUMENTS = `
  CREATE TABLE IF NOT EXISTS administrative_documents (
    id TEXT PRIMARY KEY NOT NULL,
    contract_id TEXT NOT NULL,
    document_type TEXT NOT NULL,
    content TEXT NOT NULL,
    contract_method TEXT,
    recommendation TEXT,
    evidence_status TEXT,
    sources_json TEXT NOT NULL DEFAULT '[]',
    response_id TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    confirmed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
  )
`;

const CREATE_KNOWLEDGE_DOCUMENTS = `
  CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY NOT NULL,
    document_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    category TEXT NOT NULL,
    year INTEGER,
    effective_from TEXT,
    effective_to TEXT,
    uploaded_at TEXT NOT NULL,
    status TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    openai_file_id TEXT,
    vector_store_file_id TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const CREATE_KNOWLEDGE_SETTINGS = `
  CREATE TABLE IF NOT EXISTS knowledge_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const CREATE_KNOWLEDGE_QUERIES = `
  CREATE TABLE IF NOT EXISTS knowledge_queries (
    id TEXT PRIMARY KEY NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    evidence_status TEXT NOT NULL,
    sources_json TEXT NOT NULL,
    response_id TEXT,
    created_at TEXT NOT NULL
  )
`;

const CREATE_QUOTATION_ANALYSES = `
  CREATE TABLE IF NOT EXISTS quotation_analyses (
    id TEXT PRIMARY KEY NOT NULL,
    contract_id TEXT,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    status TEXT NOT NULL,
    project_name TEXT,
    construction_type TEXT,
    purpose TEXT,
    location TEXT,
    company_name TEXT,
    quotation_date TEXT,
    total_amount INTEGER,
    supply_amount INTEGER,
    vat_amount INTEGER,
    material_cost INTEGER,
    direct_labor_cost INTEGER,
    indirect_labor_cost INTEGER,
    expenses INTEGER,
    statutory_expenses INTEGER,
    overhead INTEGER,
    profit INTEGER,
    safety_health_cost INTEGER,
    planned_start_date TEXT,
    planned_completion_date TEXT,
    extraction_json TEXT NOT NULL,
    response_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    confirmed_at TEXT,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL
  )
`;

const CREATE_QUOTATION_ITEMS = `
  CREATE TABLE IF NOT EXISTS quotation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    analysis_id TEXT NOT NULL,
    category TEXT,
    trade TEXT,
    item_name TEXT,
    specification TEXT,
    unit TEXT,
    quantity REAL,
    unit_price INTEGER,
    amount INTEGER,
    source_text TEXT,
    FOREIGN KEY (analysis_id) REFERENCES quotation_analyses(id) ON DELETE CASCADE
  )
`;

const CREATE_AI_DECISION_AUDIT = `
  CREATE TABLE IF NOT EXISTS ai_decision_audit (
    id TEXT PRIMARY KEY NOT NULL,
    analysis_id TEXT,
    contract_id TEXT,
    action TEXT NOT NULL,
    source_file TEXT NOT NULL,
    extracted_json TEXT NOT NULL,
    ai_judgment TEXT NOT NULL,
    user_corrected_json TEXT,
    final_json TEXT,
    decided_at TEXT NOT NULL,
    FOREIGN KEY (analysis_id) REFERENCES quotation_analyses(id) ON DELETE SET NULL,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL
  )
`;

const CREATE_QUOTATION_REVIEWS = `
  CREATE TABLE IF NOT EXISTS quotation_reviews (
    id TEXT PRIMARY KEY NOT NULL,
    analysis_id TEXT NOT NULL,
    contract_id TEXT,
    normal_count INTEGER NOT NULL DEFAULT 0,
    check_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    no_basis_count INTEGER NOT NULL DEFAULT 0,
    response_id TEXT,
    warning TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (analysis_id) REFERENCES quotation_analyses(id) ON DELETE CASCADE,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
  )
`;

const CREATE_QUOTATION_REVIEW_ITEMS = `
  CREATE TABLE IF NOT EXISTS quotation_review_items (
    id TEXT PRIMARY KEY NOT NULL,
    review_id TEXT NOT NULL,
    section TEXT NOT NULL,
    target_key TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL,
    quoted_value REAL,
    expected_value REAL,
    difference REAL,
    difference_rate REAL,
    calculation TEXT,
    detail TEXT NOT NULL,
    evidence_document_id TEXT,
    evidence_document_name TEXT,
    evidence_year INTEGER,
    evidence_location TEXT,
    evidence_excerpt TEXT,
    FOREIGN KEY (review_id) REFERENCES quotation_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (evidence_document_id) REFERENCES knowledge_documents(id) ON DELETE SET NULL
  )
`;

const CREATE_CONTRACT_DOCUMENT_FILES = `
  CREATE TABLE IF NOT EXISTS contract_document_files (
    id TEXT PRIMARY KEY NOT NULL,
    contract_id TEXT NOT NULL,
    document_stage TEXT NOT NULL,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    openai_file_id TEXT,
    detected_type TEXT,
    detection_status TEXT NOT NULL,
    summary TEXT,
    uploaded_at TEXT NOT NULL,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
  )
`;

const CREATE_CONTRACT_DOCUMENT_REVIEWS = `
  CREATE TABLE IF NOT EXISTS contract_document_reviews (
    id TEXT PRIMARY KEY NOT NULL,
    contract_id TEXT NOT NULL,
    document_stage TEXT NOT NULL,
    submitted_count INTEGER NOT NULL DEFAULT 0,
    missing_count INTEGER NOT NULL DEFAULT 0,
    check_count INTEGER NOT NULL DEFAULT 0,
    response_id TEXT,
    warning TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
  )
`;

const CREATE_CONTRACT_DOCUMENT_REVIEW_ITEMS = `
  CREATE TABLE IF NOT EXISTS contract_document_review_items (
    id TEXT PRIMARY KEY NOT NULL,
    review_id TEXT NOT NULL,
    status TEXT NOT NULL,
    required_name TEXT NOT NULL,
    uploaded_file_id TEXT,
    detail TEXT NOT NULL,
    evidence_document_id TEXT,
    evidence_document_name TEXT,
    evidence_year INTEGER,
    evidence_location TEXT,
    evidence_excerpt TEXT,
    FOREIGN KEY (review_id) REFERENCES contract_document_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_file_id) REFERENCES contract_document_files(id) ON DELETE SET NULL,
    FOREIGN KEY (evidence_document_id) REFERENCES knowledge_documents(id) ON DELETE SET NULL
  )
`;

const INSERT_CONTRACT = `
  INSERT INTO contracts (
    id, project_name, construction_type, purpose, location,
    estimated_amount, contract_amount, company_name, contract_method,
    quotation_date, purchase_request_date, internal_approval_date, contract_date,
    planned_start_date, actual_start_date, planned_completion_date, actual_completion_date,
    inspection_date, payment_date, current_stage, progress,
    warranty_type, warranty_start_date, warranty_end_date,
    next_task, next_task_date, attention, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

async function initialize() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare(CREATE_CONTRACTS),
    d1.prepare(CREATE_HISTORY),
    d1.prepare(CREATE_ADMINISTRATIVE_DOCUMENTS),
    d1.prepare(CREATE_KNOWLEDGE_DOCUMENTS),
    d1.prepare(CREATE_KNOWLEDGE_SETTINGS),
    d1.prepare(CREATE_KNOWLEDGE_QUERIES),
    d1.prepare(CREATE_QUOTATION_ANALYSES),
    d1.prepare(CREATE_QUOTATION_ITEMS),
    d1.prepare(CREATE_AI_DECISION_AUDIT),
    d1.prepare(CREATE_QUOTATION_REVIEWS),
    d1.prepare(CREATE_QUOTATION_REVIEW_ITEMS),
    d1.prepare(CREATE_CONTRACT_DOCUMENT_FILES),
    d1.prepare(CREATE_CONTRACT_DOCUMENT_REVIEWS),
    d1.prepare(CREATE_CONTRACT_DOCUMENT_REVIEW_ITEMS),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_contracts_current_stage ON contracts(current_stage)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_contracts_planned_start_date ON contracts(planned_start_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_contracts_planned_completion_date ON contracts(planned_completion_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_stage_history_contract_time ON contract_stage_history(contract_id, occurred_at)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_administrative_documents_contract_type ON administrative_documents(contract_id, document_type)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status_uploaded ON knowledge_documents(status, uploaded_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_knowledge_documents_category_year ON knowledge_documents(category, year)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_knowledge_queries_created_at ON knowledge_queries(created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_quotation_analyses_status_created ON quotation_analyses(status, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_quotation_analyses_contract_id ON quotation_analyses(contract_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_quotation_items_analysis_id ON quotation_items(analysis_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_ai_decision_audit_analysis_id ON ai_decision_audit(analysis_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_ai_decision_audit_contract_id ON ai_decision_audit(contract_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_quotation_reviews_contract_created ON quotation_reviews(contract_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_quotation_reviews_analysis_created ON quotation_reviews(analysis_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_quotation_review_items_review_status ON quotation_review_items(review_id, status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_contract_document_files_contract_stage_time ON contract_document_files(contract_id, document_stage, uploaded_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_contract_document_reviews_contract_stage_time ON contract_document_reviews(contract_id, document_stage, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_contract_document_review_items_review_status ON contract_document_review_items(review_id, status)"),
  ]);

  const countRow = await d1.prepare("SELECT COUNT(*) AS count FROM contracts").first<{ count: number }>();
  if ((countRow?.count ?? 0) === 0) {
    await d1.batch(SAMPLE_CONTRACTS.map((contract) => d1.prepare(INSERT_CONTRACT).bind(...contract)));
    await d1.prepare("INSERT INTO contract_stage_history (contract_id, from_stage, to_stage, action, actor, occurred_at) SELECT id, NULL, current_stage, '샘플 계약 생성', '시스템', created_at FROM contracts").run();
  }

  await d1.prepare("PRAGMA optimize").run();
}

export function ensureDatabase() {
  initialization ??= initialize().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}
