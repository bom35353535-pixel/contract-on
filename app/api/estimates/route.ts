import { env } from "cloudflare:workers";
import { getD1 } from "@/db";
import { ensureDatabase } from "@/db/init";
import { ESTIMATE_EXTENSIONS, ESTIMATE_MAX_FILE_SIZE, quotationColumns } from "@/lib/estimate";
import { extractQuotation } from "@/lib/openai-estimate";

export const runtime = "edge";

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse("분석할 견적서를 선택해 주세요.");
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ESTIMATE_EXTENSIONS.includes(extension as (typeof ESTIMATE_EXTENSIONS)[number])) {
    return errorResponse("PDF, XLSX, XLS, DOCX, CSV 견적서만 분석할 수 있습니다.");
  }
  if (file.size === 0) return errorResponse("빈 파일은 분석할 수 없습니다.");
  if (file.size > ESTIMATE_MAX_FILE_SIZE) return errorResponse("프로토타입 파일 제한은 15MB입니다.");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const storageKey = `quotations/${id}/${encodeURIComponent(file.name)}`;
  await env.FILES.put(storageKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { analysisId: id, originalName: file.name },
  });

  try {
    const extracted = await extractQuotation(file);
    const values = extracted.data;
    const d1 = getD1();
    await d1.prepare(`
      INSERT INTO quotation_analyses (
        id, contract_id, original_name, content_type, size_bytes, storage_key, status,
        project_name, construction_type, purpose, location, company_name, quotation_date,
        total_amount, supply_amount, vat_amount, material_cost, direct_labor_cost,
        indirect_labor_cost, expenses, statutory_expenses, overhead, profit, safety_health_cost,
        planned_start_date, planned_completion_date, extraction_json, response_id,
        created_at, updated_at, confirmed_at
      ) VALUES (?, NULL, ?, ?, ?, ?, 'ANALYZED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).bind(
      id, file.name, file.type || "application/octet-stream", file.size, storageKey,
      ...Object.values(quotationColumns(values)), JSON.stringify(values), extracted.responseId, now, now,
    ).run();

    for (let start = 0; start < values.items.length; start += 75) {
      const statements = values.items.slice(start, start + 75).map((item) => d1.prepare(`
        INSERT INTO quotation_items (analysis_id, category, trade, item_name, specification, unit, quantity, unit_price, amount, source_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, item.category, item.trade, item.itemName, item.specification, item.unit, item.quantity, item.unitPrice, item.amount, item.sourceText));
      if (statements.length) await d1.batch(statements);
    }

    await d1.prepare(`
      INSERT INTO ai_decision_audit (id, analysis_id, contract_id, action, source_file, extracted_json, ai_judgment, user_corrected_json, final_json, decided_at)
      VALUES (?, ?, NULL, 'QUOTATION_EXTRACTION', ?, ?, '문서에 명시된 정보만 구조화함. 적정성 판단 및 금액 검산은 수행하지 않음.', NULL, NULL, ?)
    `).bind(crypto.randomUUID(), id, file.name, JSON.stringify(values), now).run();

    return Response.json({ analysisId: id }, { status: 201 });
  } catch (error) {
    await env.FILES.delete(storageKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : "견적서 분석에 실패했습니다.";
    return errorResponse(message, 502);
  }
}
