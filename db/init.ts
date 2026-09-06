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
    business_registration_number TEXT,
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

const CREATE_CONSTRUCTION_CHECKLIST_RUNS = `
  CREATE TABLE IF NOT EXISTS construction_checklist_runs (
    id TEXT PRIMARY KEY NOT NULL,
    contract_id TEXT NOT NULL,
    response_id TEXT,
    warning TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
  )
`;

const CREATE_CONSTRUCTION_CHECKLIST_ITEMS = `
  CREATE TABLE IF NOT EXISTS construction_checklist_items (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    evidence_document_id TEXT,
    evidence_document_name TEXT,
    evidence_year INTEGER,
    evidence_location TEXT,
    evidence_excerpt TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES construction_checklist_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
    FOREIGN KEY (evidence_document_id) REFERENCES knowledge_documents(id) ON DELETE SET NULL
  )
`;

const CREATE_WARRANTY_CRITERIA = `CREATE TABLE IF NOT EXISTS warranty_criteria (
  id TEXT PRIMARY KEY NOT NULL, category TEXT NOT NULL, work_name TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]', warranty_years INTEGER NOT NULL, bond_rate REAL,
  source_name TEXT NOT NULL, source_page TEXT NOT NULL, source_excerpt TEXT NOT NULL
)`;
const CREATE_CONTRACT_WARRANTIES = `CREATE TABLE IF NOT EXISTS contract_warranties (
  contract_id TEXT PRIMARY KEY NOT NULL, criterion_id TEXT NOT NULL, warranty_years INTEGER NOT NULL,
  bond_rate REAL, warranty_start_date TEXT NOT NULL, warranty_end_date TEXT NOT NULL,
  confirmed_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
  FOREIGN KEY (criterion_id) REFERENCES warranty_criteria(id)
)`;
const CREATE_WARRANTY_INSPECTIONS = `CREATE TABLE IF NOT EXISTS warranty_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, contract_id TEXT NOT NULL, sequence INTEGER NOT NULL,
  scheduled_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'SCHEDULED', inspected_at TEXT, note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
)`;

const WARRANTY_CRITERIA = [
  ["W01","토목","상수도·하수도(관로 매설), 관개수로 또는 매립",3,0.03],
  ["W02","조경","부지정지, 조경시설물 또는 조경식재",2,0.05],
  ["W03","건축","건축물의 기둥·내력벽 등 주요 구조부",5,0.03],
  ["W04","건축","방수·지붕·주요 구조부 외 철근콘크리트·콘크리트포장·승강기·인양기계설비",3,0.03],
  ["W05","건축·설비","토공·석공·조적·철물·온실·아스팔트포장·급배수·공동구·지하저수조·냉난방·환기·공기조화·자동제어·가스·배연설비",2,0.03],
  ["W06","건축·설비","실내의장·미장·타일·도장·창호·보링·기타 건물 내 설비·건축물 조립·판금·보일러 설치·기타 토목공사",1,0.03],
  ["W07","전기","배전설비 철탑공사",3,0.02],
  ["W08","전기","철탑공사 외 배전설비공사",2,0.02],
  ["W09","전기","건축물·구조물의 전기설비공사 및 그 밖의 전기설비공사",1,0.02],
  ["W10","정보통신","그 밖의 통신공사",1,0.02],
  ["W11","소방","피난기구·유도등·유도표지·비상경보·비상조명·비상방송·무선통신보조설비",2,0.02],
  ["W12","소방","자동식소화기·옥내외소화전·스프링클러·물분무등소화·자동화재탐지·소화용수·소화활동설비",3,0.02],
] as const;

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
    d1.prepare(CREATE_CONSTRUCTION_CHECKLIST_RUNS),
    d1.prepare(CREATE_CONSTRUCTION_CHECKLIST_ITEMS),
    d1.prepare(CREATE_WARRANTY_CRITERIA),
    d1.prepare(CREATE_CONTRACT_WARRANTIES),
    d1.prepare(CREATE_WARRANTY_INSPECTIONS),
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
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_construction_checklist_runs_contract_time ON construction_checklist_runs(contract_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_construction_checklist_items_contract_status ON construction_checklist_items(contract_id, status)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_warranty_inspections_contract_sequence ON warranty_inspections(contract_id, sequence)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_warranty_inspections_contract_date ON warranty_inspections(contract_id, scheduled_date)"),
  ]);

  await d1.batch(WARRANTY_CRITERIA.map(([id, category, workName, years, rate]) => d1.prepare(
    "INSERT OR IGNORE INTO warranty_criteria (id, category, work_name, keywords_json, warranty_years, bond_rate, source_name, source_page, source_excerpt) VALUES (?, ?, ?, '[]', ?, ?, '하자기간.pdf', 'p.155', ?)"
  ).bind(id, category, workName, years, rate, `${workName}: ${years}년, 하자보수보증금률 ${Math.round(rate * 100)}%`)));

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
