import { env } from "cloudflare:workers";
import { getD1 } from "@/db";
import { ensureDatabase } from "@/db/init";
import { quotationColumns } from "@/lib/estimate";
import { extractQuotation } from "@/lib/openai-estimate";

export const runtime = "edge";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await params;
  const d1 = getD1();
  const analysis = await d1.prepare("SELECT * FROM quotation_analyses WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!analysis) return Response.json({ error: "견적서 분석 결과를 찾을 수 없습니다." }, { status: 404 });
  if (analysis.status === "CONFIRMED") return Response.json({ error: "이미 현황판에 등록된 견적서는 다시 분석할 수 없습니다." }, { status: 409 });

  const stored = await env.FILES.get(String(analysis.storage_key));
  if (!stored) return Response.json({ error: "저장된 원본 견적서를 찾을 수 없습니다." }, { status: 404 });
  const originalName = String(analysis.original_name);
  const contentType = String(analysis.content_type || stored.httpMetadata?.contentType || "application/octet-stream");

  try {
    const file = new File([await stored.arrayBuffer()], originalName, { type: contentType });
    const extracted = await extractQuotation(file);
    const values = extracted.data;
    const now = new Date().toISOString();
    const statements = [
      d1.prepare(`UPDATE quotation_analyses SET project_name = ?, construction_type = ?, purpose = ?, location = ?, company_name = ?,
        business_registration_number = ?, quotation_date = ?, total_amount = ?, supply_amount = ?, vat_amount = ?, material_cost = ?,
        direct_labor_cost = ?, indirect_labor_cost = ?, expenses = ?, statutory_expenses = ?, overhead = ?, profit = ?, safety_health_cost = ?,
        planned_start_date = ?, planned_completion_date = ?, extraction_json = ?, response_id = ?, status = 'ANALYZED', updated_at = ? WHERE id = ?`)
        .bind(...Object.values(quotationColumns(values)), JSON.stringify(values), extracted.responseId, now, id),
      d1.prepare("DELETE FROM quotation_review_items WHERE review_id IN (SELECT id FROM quotation_reviews WHERE analysis_id = ?)").bind(id),
      d1.prepare("DELETE FROM quotation_reviews WHERE analysis_id = ?").bind(id),
      d1.prepare("DELETE FROM quotation_items WHERE analysis_id = ?").bind(id),
    ];
    await d1.batch(statements);
    for (let start = 0; start < values.items.length; start += 75) {
      const itemStatements = values.items.slice(start, start + 75).map((item) => d1.prepare(`
        INSERT INTO quotation_items (analysis_id, category, trade, item_name, specification, unit, quantity, unit_price, amount, source_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, item.category, item.trade, item.itemName, item.specification, item.unit, item.quantity, item.unitPrice, item.amount, item.sourceText));
      if (itemStatements.length) await d1.batch(itemStatements);
    }
    await d1.prepare(`INSERT INTO ai_decision_audit (id, analysis_id, contract_id, action, source_file, extracted_json, ai_judgment, user_corrected_json, final_json, decided_at)
      VALUES (?, ?, NULL, 'QUOTATION_REEXTRACTION', ?, ?, '사용자 요청으로 저장된 원본 견적서를 다시 구조화함.', NULL, NULL, ?)`)
      .bind(crypto.randomUUID(), id, originalName, JSON.stringify(values), now).run();
    return Response.json({ analysisId: id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "견적서를 다시 분석하지 못했습니다." }, { status: 502 });
  }
}
