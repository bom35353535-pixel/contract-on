import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { constructionChecklistItems, knowledgeDocuments } from "@/db/schema";
import { getContract } from "@/lib/contracts";
import { getConstructionChecklist, verifyConstructionChecklist } from "@/lib/construction-checklist";
import { isOpenAIConfigured } from "@/lib/knowledge";
import { findConstructionChecklistCriteria, getVectorStoreId } from "@/lib/openai-knowledge";

export const runtime = "edge";

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id: contractId } = await context.params;
  const contract = await getContract(contractId);
  if (!contract) return errorResponse("계약 정보를 찾을 수 없습니다.", 404);
  if (contract.currentStage !== "IN_CONSTRUCTION") return errorResponse("공사중 단계에서만 확인사항을 불러올 수 있습니다.", 409);

  const readyDocuments = await getDb().select({
    id: knowledgeDocuments.id, documentName: knowledgeDocuments.documentName, originalName: knowledgeDocuments.originalName,
    openaiFileId: knowledgeDocuments.openaiFileId, year: knowledgeDocuments.year,
  }).from(knowledgeDocuments).where(eq(knowledgeDocuments.status, "READY"));
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  let warning: string | null = null;
  let responseId: string | null = null;
  let candidates: unknown[] = [];
  let items: ReturnType<typeof verifyConstructionChecklist> = [];

  if (!isOpenAIConfigured() || !readyDocuments.length) {
    warning = "검색 가능한 등록 지식자료가 없어 공사중 확인사항을 제시하지 않았습니다.";
  } else {
    const vectorStoreId = await getVectorStoreId();
    if (!vectorStoreId) {
      warning = "검색 가능한 등록 지식자료가 없어 공사중 확인사항을 제시하지 않았습니다.";
    } else {
      try {
        const evidence = await findConstructionChecklistCriteria({
          projectName: contract.projectName, constructionType: contract.constructionType, contractMethod: contract.contractMethod,
        }, vectorStoreId);
        candidates = evidence.candidates;
        responseId = evidence.responseId;
        items = verifyConstructionChecklist(evidence.candidates, evidence.results, readyDocuments);
        if (!items.length) warning = "등록된 지식자료에서 이 공사에 직접 적용되는 공사중 확인사항을 찾지 못했습니다.";
      } catch (error) {
        console.error("Construction checklist lookup failed", error);
        warning = "등록자료 검색에 실패했습니다. 토큰·결제 상태를 확인한 뒤 다시 불러와 주세요.";
      }
    }
  }

  const d1 = getD1();
  await d1.prepare("INSERT INTO construction_checklist_runs (id, contract_id, response_id, warning, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(runId, contractId, responseId, warning, now).run();
  for (let start = 0; start < items.length; start += 75) {
    const statements = items.slice(start, start + 75).map((item) => d1.prepare(`
      INSERT INTO construction_checklist_items (
        id, run_id, contract_id, title, detail, status, evidence_document_id, evidence_document_name,
        evidence_year, evidence_location, evidence_excerpt, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), runId, contractId, item.title, item.detail, item.evidenceDocumentId, item.evidenceDocumentName,
      item.evidenceYear, item.evidenceLocation, item.evidenceExcerpt, now, now));
    if (statements.length) await d1.batch(statements);
  }
  await d1.prepare(`
    INSERT INTO ai_decision_audit (id, analysis_id, contract_id, action, source_file, extracted_json, ai_judgment, user_corrected_json, final_json, decided_at)
    VALUES (?, NULL, ?, 'PHASE7_CONSTRUCTION_CHECKLIST', '등록 지식자료', '[]', ?, NULL, ?, ?)
  `).bind(crypto.randomUUID(), contractId, JSON.stringify(candidates), JSON.stringify({ warning, items }), now).run();
  return Response.json({ runId, itemCount: items.length, warning }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id: contractId } = await context.params;
  const contract = await getContract(contractId);
  if (!contract) return errorResponse("계약 정보를 찾을 수 없습니다.", 404);
  if (contract.currentStage !== "IN_CONSTRUCTION") return errorResponse("공사중 단계에서만 체크상태를 변경할 수 있습니다.", 409);
  const body = await request.json().catch(() => ({})) as { itemId?: unknown; status?: unknown };
  if (typeof body.itemId !== "string" || !["PENDING", "COMPLETED", "NOT_APPLICABLE"].includes(String(body.status))) {
    return errorResponse("확인항목과 상태를 확인해 주세요.");
  }
  const latest = await getConstructionChecklist(contractId);
  if (!latest.run || !latest.items.some((item) => item.id === body.itemId)) return errorResponse("현재 체크리스트 항목을 찾을 수 없습니다.", 404);
  const result = await getDb().update(constructionChecklistItems).set({ status: String(body.status), updatedAt: new Date().toISOString() })
    .where(eq(constructionChecklistItems.id, body.itemId));
  if ((result.meta.changes ?? 0) !== 1) return errorResponse("체크상태를 저장하지 못했습니다.", 409);
  return Response.json({ saved: true });
}
