import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { constructionChecklistItems } from "@/db/schema";
import { getApplicableFieldChecklist, createFieldChecklistDetail, parseFieldChecklistDetail, type FieldCheckStatus } from "@/lib/construction-field-checklist";
import { getContract } from "@/lib/contracts";
import { getConstructionChecklist } from "@/lib/construction-checklist";
import { safeFileName } from "@/lib/file-name";

export const runtime = "edge";
const ALLOWED_STATUSES: FieldCheckStatus[] = ["PENDING", "NORMAL", "NEEDS_REVIEW", "NOT_APPLICABLE"];

function errorResponse(message: string, status = 400) { return Response.json({ error: message }, { status }); }

async function requireActiveContract(contractId: string) {
  const contract = await getContract(contractId);
  if (!contract) throw new Error("계약 정보를 찾을 수 없습니다.");
  if (contract.currentStage !== "IN_CONSTRUCTION") throw new Error("공사중 단계에서만 현장 확인사항을 기록할 수 있습니다.");
  return contract;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id: contractId } = await context.params;
  const photoId = new URL(request.url).searchParams.get("photo");
  if (!photoId) return errorResponse("사진 식별값을 확인해 주세요.");
  const workspace = await getConstructionChecklist(contractId);
  const allItems = [...workspace.items, ...workspace.history.flatMap((entry) => entry.items)];
  for (const item of allItems) {
    const photo = parseFieldChecklistDetail(item.detail).photos.find((candidate) => candidate.id === photoId);
    if (!photo) continue;
    const stored = await env.FILES.get(photo.storageKey);
    if (!stored) return errorResponse("첨부 사진을 찾을 수 없습니다.", 404);
    const headers = new Headers();
    stored.writeHttpMetadata(headers);
    headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(photo.name)}`);
    headers.set("cache-control", "private, max-age=300");
    return new Response(stored.body, { headers });
  }
  return errorResponse("첨부 사진을 찾을 수 없습니다.", 404);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id: contractId } = await context.params;
  let contract;
  try { contract = await requireActiveContract(contractId); }
  catch (error) { return errorResponse(error instanceof Error ? error.message : "계약 정보를 확인해 주세요.", 409); }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const itemId = String(form.get("itemId") || "");
    const file = form.get("photo");
    if (!itemId || !(file instanceof File) || !file.size) return errorResponse("첨부할 사진을 선택해 주세요.");
    if (!file.type.startsWith("image/")) return errorResponse("사진 파일만 첨부할 수 있습니다.");
    if (file.size > 10 * 1024 * 1024) return errorResponse("사진 한 장은 10MB 이하로 첨부해 주세요.");
    const workspace = await getConstructionChecklist(contractId);
    const item = workspace.items.find((candidate) => candidate.id === itemId);
    if (!workspace.run || !item) return errorResponse("현재 점검 항목을 찾을 수 없습니다.", 404);
    const photoId = crypto.randomUUID();
    const storageKey = `construction-checklist/${contractId}/${workspace.run.id}/${itemId}/${photoId}-${safeFileName(file.name)}`;
    await env.FILES.put(storageKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { contractId, itemId } });
    const detail = parseFieldChecklistDetail(item.detail);
    detail.photos.push({ id: photoId, name: file.name, storageKey });
    await getDb().update(constructionChecklistItems).set({ detail: JSON.stringify(detail), updatedAt: new Date().toISOString() })
      .where(eq(constructionChecklistItems.id, itemId));
    return Response.json({ saved: true, photoId }, { status: 201 });
  }

  const { categories, items } = getApplicableFieldChecklist(contract.constructionType, contract.projectName);
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  const d1 = getD1();
  await d1.prepare("INSERT INTO construction_checklist_runs (id, contract_id, response_id, warning, created_at) VALUES (?, ?, NULL, NULL, ?)")
    .bind(runId, contractId, now).run();
  for (let start = 0; start < items.length; start += 75) {
    const statements = items.slice(start, start + 75).map((item, index) => d1.prepare(`
      INSERT INTO construction_checklist_items (
        id, run_id, contract_id, title, detail, status, evidence_document_id, evidence_document_name,
        evidence_year, evidence_location, evidence_excerpt, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', NULL, NULL, NULL, NULL, NULL, ?, ?)
    `).bind(crypto.randomUUID(), runId, contractId, item.title, JSON.stringify(createFieldChecklistDetail(item, start + index)), now, now));
    if (statements.length) await d1.batch(statements);
  }
  return Response.json({ runId, itemCount: items.length, categories }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id: contractId } = await context.params;
  try { await requireActiveContract(contractId); }
  catch (error) { return errorResponse(error instanceof Error ? error.message : "계약 정보를 확인해 주세요.", 409); }
  const body = await request.json().catch(() => ({})) as { itemId?: unknown; status?: unknown; memo?: unknown; actionNote?: unknown; resolved?: unknown };
  if (typeof body.itemId !== "string") return errorResponse("확인항목을 선택해 주세요.");
  const workspace = await getConstructionChecklist(contractId);
  const item = workspace.items.find((candidate) => candidate.id === body.itemId);
  if (!workspace.run || !item) return errorResponse("현재 체크리스트 항목을 찾을 수 없습니다.", 404);
  const detail = parseFieldChecklistDetail(item.detail);
  if (typeof body.memo === "string") detail.memo = body.memo.slice(0, 2000);
  if (typeof body.actionNote === "string") detail.actionNote = body.actionNote.slice(0, 2000);
  if (typeof body.resolved === "boolean") detail.resolved = body.resolved;
  const status = typeof body.status === "string" && ALLOWED_STATUSES.includes(body.status as FieldCheckStatus) ? body.status : item.status;
  if (body.status !== undefined && !ALLOWED_STATUSES.includes(String(body.status) as FieldCheckStatus)) return errorResponse("체크상태를 확인해 주세요.");
  const result = await getDb().update(constructionChecklistItems)
    .set({ status, detail: JSON.stringify(detail), updatedAt: new Date().toISOString() })
    .where(eq(constructionChecklistItems.id, item.id));
  if ((result.meta.changes ?? 0) !== 1) return errorResponse("현장 확인내용을 저장하지 못했습니다.", 409);
  return Response.json({ saved: true });
}
