import { env } from "cloudflare:workers";
import { getD1 } from "@/db";
import { ensureDatabase } from "@/db/init";

export const runtime = "edge";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const d1 = getD1();
  const contract = await d1.prepare("SELECT id, current_stage FROM contracts WHERE id = ?").bind(id).first<{ id: string; current_stage: string }>();
  if (!contract) return Response.json({ error: "공사 정보를 찾을 수 없습니다." }, { status: 404 });
  if (contract.current_stage === "FINISHED") return Response.json({ error: "완료된 공사는 진행 중 공사 목록에서 삭제할 수 없습니다." }, { status: 409 });

  const [documentFiles, quotationFiles] = await Promise.all([
    d1.prepare("SELECT storage_key FROM contract_document_files WHERE contract_id = ?").bind(id).all<{ storage_key: string }>(),
    d1.prepare("SELECT storage_key FROM quotation_analyses WHERE contract_id = ?").bind(id).all<{ storage_key: string }>(),
  ]);
  const storageKeys = [...documentFiles.results, ...quotationFiles.results].map((row) => row.storage_key).filter(Boolean);

  try {
    await Promise.all(storageKeys.map((key) => env.FILES.delete(key)));
  } catch {
    return Response.json({ error: "제출서류 원본을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }

  const results = await d1.batch([
    d1.prepare("DELETE FROM ai_decision_audit WHERE contract_id = ? OR analysis_id IN (SELECT id FROM quotation_analyses WHERE contract_id = ?)").bind(id, id),
    d1.prepare("DELETE FROM quotation_analyses WHERE contract_id = ?").bind(id),
    d1.prepare("DELETE FROM contracts WHERE id = ? AND current_stage <> 'FINISHED'").bind(id),
  ]);
  if ((results.at(-1)?.meta.changes ?? 0) !== 1) return Response.json({ error: "공사를 삭제하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요." }, { status: 409 });
  return Response.json({ ok: true });
}
