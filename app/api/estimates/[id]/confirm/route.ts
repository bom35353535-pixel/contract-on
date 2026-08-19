import { getD1 } from "@/db";
import { ensureDatabase } from "@/db/init";
import { missingRequiredFields, normalizeQuotationExtraction, quotationColumns } from "@/lib/estimate";

export const runtime = "edge";

function responseError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function newContractId() {
  const now = new Date();
  const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(now);
  const stamp = now.toISOString().replace(/\D/g, "").slice(4, 14);
  const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
  return `CTR-${year}-${stamp}-${suffix}`;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const d1 = getD1();
  const analysis = await d1.prepare("SELECT * FROM quotation_analyses WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!analysis) return responseError("견적서 분석 결과를 찾을 수 없습니다.", 404);
  if (analysis.status === "CONFIRMED") return responseError("이미 계약업무를 시작한 견적서입니다.", 409);

  const body = await request.json().catch(() => null);
  const values = normalizeQuotationExtraction(body);
  const missing = missingRequiredFields(values);
  if (missing.length) return responseError(`계약업무 시작 전에 입력해 주세요: ${missing.join(", ")}`);
  if (values.plannedStartDate && values.plannedCompletionDate && values.plannedStartDate > values.plannedCompletionDate) {
    return responseError("준공예정일은 착공예정일보다 빠를 수 없습니다.");
  }

  const contractId = newContractId();
  const now = new Date().toISOString();
  const initialJson = String(analysis.extraction_json || "{}");
  const finalJson = JSON.stringify(values);
  const columns = quotationColumns(values);
  const statements = [
    d1.prepare(`
      INSERT INTO contracts (
        id, project_name, construction_type, purpose, location, estimated_amount, contract_amount,
        company_name, contract_method, quotation_date, purchase_request_date, internal_approval_date,
        contract_date, planned_start_date, actual_start_date, planned_completion_date, actual_completion_date,
        inspection_date, payment_date, current_stage, progress, warranty_type, warranty_start_date,
        warranty_end_date, next_task, next_task_date, attention, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, NULL, ?, NULL, NULL, NULL,
        'PURCHASE_REQUEST', 0, NULL, NULL, NULL, '품의 완료', NULL,
        '견적서 추출정보를 담당자가 확인했습니다. 금액 검산은 Phase 4에서 진행합니다.', ?, ?)
    `).bind(
      contractId, values.projectName, values.constructionType, values.purpose, values.location,
      values.totalAmount, values.totalAmount, values.companyName, values.quotationDate,
      values.plannedStartDate, values.plannedCompletionDate, now, now,
    ),
    d1.prepare(`
      UPDATE quotation_analyses SET contract_id = ?, status = 'CONFIRMED', project_name = ?, construction_type = ?,
        purpose = ?, location = ?, company_name = ?, quotation_date = ?, total_amount = ?, supply_amount = ?,
        vat_amount = ?, material_cost = ?, direct_labor_cost = ?, indirect_labor_cost = ?, expenses = ?,
        statutory_expenses = ?, overhead = ?, profit = ?, safety_health_cost = ?, planned_start_date = ?,
        planned_completion_date = ?, updated_at = ?, confirmed_at = ? WHERE id = ? AND status = 'ANALYZED'
    `).bind(contractId, ...Object.values(columns), now, now, id),
    d1.prepare("INSERT INTO contract_stage_history (contract_id, from_stage, to_stage, action, actor, occurred_at) VALUES (?, NULL, 'PURCHASE_REQUEST', '견적정보 확정 및 계약업무 시작', '담당자', ?)").bind(contractId, now),
    d1.prepare("DELETE FROM quotation_items WHERE analysis_id = ?").bind(id),
    d1.prepare(`
      INSERT INTO ai_decision_audit (id, analysis_id, contract_id, action, source_file, extracted_json, ai_judgment, user_corrected_json, final_json, decided_at)
      VALUES (?, ?, ?, 'QUOTATION_CONFIRMATION', ?, ?, '담당자가 AI 추출값을 검토하고 계약 기본정보로 확정함.', ?, ?, ?)
    `).bind(crypto.randomUUID(), id, contractId, String(analysis.original_name || ""), initialJson, finalJson, finalJson, now),
  ];
  await d1.batch(statements);

  for (let start = 0; start < values.items.length; start += 75) {
    const itemStatements = values.items.slice(start, start + 75).map((item) => d1.prepare(`
      INSERT INTO quotation_items (analysis_id, category, trade, item_name, specification, unit, quantity, unit_price, amount, source_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, item.category, item.trade, item.itemName, item.specification, item.unit, item.quantity, item.unitPrice, item.amount, item.sourceText));
    if (itemStatements.length) await d1.batch(itemStatements);
  }

  return Response.json({ contractId });
}
