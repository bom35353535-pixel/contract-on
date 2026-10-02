import { getD1 } from "@/db";
import { ensureDatabase } from "@/db/init";
import { normalizeQuotationExtraction, quotationColumns } from "@/lib/estimate";
import { getQuotationAnalysis } from "@/lib/quotations";
import { performQuotationReview } from "@/lib/run-quotation-review";

export const runtime = "edge";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const current = await getQuotationAnalysis(id);
  if (!current) return Response.json({ error: "견적서 분석 결과를 찾을 수 없습니다." }, { status: 404 });
  if (current.analysis.status === "CONFIRMED") return Response.json({ error: "이미 현황판에 등록된 견적서입니다." }, { status: 409 });

  const values = normalizeQuotationExtraction(await request.json().catch(() => null));
  const missingRequired = [
    values.projectName, values.constructionType, values.companyName, values.location, values.purpose,
    values.totalAmount, values.plannedStartDate, values.plannedCompletionDate,
  ].filter((value) => value === null || value === "" || value === 0).length;
  if (missingRequired) return Response.json({ error: `필수항목 ${missingRequired}개를 모두 입력해야 견적검토를 실행할 수 있습니다.` }, { status: 422 });
  if (values.plannedStartDate! > values.plannedCompletionDate!) {
    return Response.json({ error: "준공예정일은 착공예정일보다 빠를 수 없습니다." }, { status: 422 });
  }
  const columns = quotationColumns(values);
  const now = new Date().toISOString();
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`
      UPDATE quotation_analyses SET project_name = ?, construction_type = ?, purpose = ?, location = ?, company_name = ?,
        business_registration_number = ?, quotation_date = ?, total_amount = ?, supply_amount = ?, vat_amount = ?, material_cost = ?, direct_labor_cost = ?,
        indirect_labor_cost = ?, expenses = ?, statutory_expenses = ?, overhead = ?, profit = ?, safety_health_cost = ?,
        planned_start_date = ?, planned_completion_date = ?, extraction_json = ?, updated_at = ? WHERE id = ? AND status = 'ANALYZED'
    `).bind(...Object.values(columns), JSON.stringify(values), now, id),
    d1.prepare("DELETE FROM quotation_items WHERE analysis_id = ?").bind(id),
  ]);
  for (let start = 0; start < values.items.length; start += 75) {
    const statements = values.items.slice(start, start + 75).map((item) => d1.prepare(`
      INSERT INTO quotation_items (analysis_id, category, trade, item_name, specification, unit, quantity, unit_price, amount, source_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, item.category, item.trade, item.itemName, item.specification, item.unit, item.quantity, item.unitPrice, item.amount, item.sourceText));
    if (statements.length) await d1.batch(statements);
  }
  const quotation = await getQuotationAnalysis(id);
  if (!quotation) return Response.json({ error: "저장된 견적정보를 다시 읽지 못했습니다." }, { status: 500 });
  const result = await performQuotationReview(quotation, null);
  return Response.json(result, { status: 201 });
}
