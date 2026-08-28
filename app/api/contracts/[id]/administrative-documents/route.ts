import { getD1 } from "@/db";
import { ensureDatabase } from "@/db/init";
import { getContract } from "@/lib/contracts";
import { getKoreanToday, getStageProgress, STAGE_INFO } from "@/lib/workflow";
import type { AdministrativeDocumentType } from "@/lib/administrative-documents";

export const runtime = "edge";

const nextStageByDocument: Record<AdministrativeDocumentType, "INTERNAL_APPROVAL" | "NARA_CONTRACT"> = {
  PURCHASE_REQUEST: "INTERNAL_APPROVAL",
  INTERNAL_APPROVAL: "NARA_CONTRACT",
};

function isDocumentType(value: unknown): value is AdministrativeDocumentType {
  return value === "PURCHASE_REQUEST" || value === "INTERNAL_APPROVAL";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id: contractId } = await context.params;
  const body = await request.json().catch(() => null) as { documentType?: unknown; content?: unknown; contractMethod?: unknown; confirm?: unknown } | null;
  if (!isDocumentType(body?.documentType)) return Response.json({ error: "문서 종류를 확인해 주세요." }, { status: 400 });
  const documentType = body.documentType;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const contractMethod = typeof body.contractMethod === "string" ? body.contractMethod.trim() : null;
  const confirm = body.confirm === true;
  if (!content) return Response.json({ error: "문서 내용을 입력해 주세요." }, { status: 400 });
  if (content.length > 30_000) return Response.json({ error: "문서 내용은 30,000자 이내로 작성해 주세요." }, { status: 400 });
  if (documentType === "INTERNAL_APPROVAL" && confirm && !contractMethod) return Response.json({ error: "최종 계약방법을 담당자가 입력해 주세요." }, { status: 400 });

  const contract = await getContract(contractId);
  if (!contract) return Response.json({ error: "계약 정보를 찾을 수 없습니다." }, { status: 404 });
  if (contract.currentStage !== documentType) return Response.json({ error: "현재 업무단계에서 작성 또는 완료할 수 있는 문서가 아닙니다." }, { status: 409 });

  const d1 = getD1();
  const existing = await d1.prepare("SELECT status FROM administrative_documents WHERE contract_id = ? AND document_type = ?").bind(contractId, documentType).first<{ status: string }>();
  if (existing?.status === "CONFIRMED") return Response.json({ error: "이미 완료 확정된 문서입니다." }, { status: 409 });

  const now = new Date().toISOString();
  if (!confirm) {
    await d1.prepare(`
      INSERT INTO administrative_documents (
        id, contract_id, document_type, content, contract_method, sources_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, '[]', 'DRAFT', ?, ?)
      ON CONFLICT(contract_id, document_type) DO UPDATE SET
        content = excluded.content, contract_method = excluded.contract_method, updated_at = excluded.updated_at
    `).bind(crypto.randomUUID(), contractId, documentType, content, contractMethod, now, now).run();
    return Response.json({ status: "DRAFT" });
  }

  const nextStage = nextStageByDocument[documentType];
  const today = getKoreanToday();
  const completionField = documentType === "PURCHASE_REQUEST" ? "purchase_request_date" : "internal_approval_date";
  const methodUpdate = documentType === "INTERNAL_APPROVAL" ? ", contract_method = ?" : "";
  const updateValues: Array<string | number | null> = [nextStage, getStageProgress(nextStage), STAGE_INFO[nextStage].action, now];
  if (documentType === "INTERNAL_APPROVAL") updateValues.push(contractMethod);
  updateValues.push(today, contractId, documentType);

  const results = await d1.batch([
    d1.prepare(`
      INSERT INTO administrative_documents (
        id, contract_id, document_type, content, contract_method, sources_json, status, confirmed_at, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, '[]', 'CONFIRMED', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM contracts WHERE id = ? AND current_stage = ?)
      ON CONFLICT(contract_id, document_type) DO UPDATE SET
        content = excluded.content, contract_method = excluded.contract_method, status = 'CONFIRMED',
        confirmed_at = excluded.confirmed_at, updated_at = excluded.updated_at
    `).bind(crypto.randomUUID(), contractId, documentType, content, contractMethod, now, now, now, contractId, documentType),
    d1.prepare(`
      UPDATE contracts SET current_stage = ?, progress = ?, next_task = ?, next_task_date = NULL, updated_at = ?
        ${methodUpdate}, ${completionField} = COALESCE(${completionField}, ?)
      WHERE id = ? AND current_stage = ?
    `).bind(...updateValues),
    d1.prepare(`
      INSERT INTO contract_stage_history (contract_id, from_stage, to_stage, action, actor, occurred_at)
      SELECT ?, ?, ?, ?, '담당자', ? WHERE changes() = 1
    `).bind(contractId, documentType, nextStage, STAGE_INFO[documentType].action, now),
    d1.prepare(`
      INSERT INTO ai_decision_audit (id, analysis_id, contract_id, action, source_file, extracted_json, ai_judgment, user_corrected_json, final_json, decided_at)
      SELECT ?, NULL, ?, 'ADMINISTRATIVE_DOCUMENT_CONFIRMATION', '품의/내부기안 화면', ?, ?, ?, ?, ? WHERE changes() = 1
    `).bind(
      crypto.randomUUID(), contractId, JSON.stringify(contract),
      "계약 DB 기반으로 문안 초안을 만들고, 계약방법은 등록자료 검색결과를 후보로만 제시함.",
      JSON.stringify({ documentType, content, contractMethod }), JSON.stringify({ documentType, content, contractMethod, nextStage }), now,
    ),
  ]);

  if ((results[1].meta.changes ?? 0) !== 1) return Response.json({ error: "다른 작업에서 업무단계가 변경되었습니다. 화면을 새로고침해 주세요." }, { status: 409 });
  return Response.json({ status: "CONFIRMED", nextStage });
}
