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
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_contracts_current_stage ON contracts(current_stage)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_contracts_planned_start_date ON contracts(planned_start_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_contracts_planned_completion_date ON contracts(planned_completion_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_stage_history_contract_time ON contract_stage_history(contract_id, occurred_at)"),
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
