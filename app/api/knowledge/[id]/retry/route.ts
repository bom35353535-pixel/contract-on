import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { knowledgeDocuments } from "@/db/schema";
import { isOpenAIConfigured } from "@/lib/knowledge";
import { deleteKnowledgeFile, getVectorStoreId, uploadKnowledgeFile, waitForVectorFile } from "@/lib/openai-knowledge";
import { PROTOTYPE_MAX_FILE_SIZE } from "@/lib/knowledge-constants";

export const runtime = "edge";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  if (!isOpenAIConfigured()) return Response.json({ error: "OpenAI API 키를 먼저 설정해 주세요." }, { status: 409 });
  const { id } = await context.params;
  const db = getDb();
  const [document] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).limit(1);
  if (!document) return Response.json({ error: "지식자료를 찾을 수 없습니다." }, { status: 404 });
  if (document.sizeBytes > PROTOTYPE_MAX_FILE_SIZE) {
    return Response.json({ error: "대용량 원본은 보관되었지만 AI 검색을 위해서는 검색용 분할 처리가 필요합니다." }, { status: 409 });
  }
  const body = await request.json().catch(() => ({})) as { force?: boolean };

  try {
    let openaiFileId = document.openaiFileId;
    let vectorStoreId = await getVectorStoreId();
    if (body.force && openaiFileId && vectorStoreId) {
      await deleteKnowledgeFile(vectorStoreId, openaiFileId);
      openaiFileId = null;
      await db.update(knowledgeDocuments).set({
        status: "UPLOADING",
        openaiFileId: null,
        vectorStoreFileId: null,
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(knowledgeDocuments.id, id));
    }
    if (!openaiFileId || !vectorStoreId) {
      const stored = await env.FILES.get(document.storageKey);
      if (!stored) return Response.json({ error: "보관된 원본 파일을 찾을 수 없습니다." }, { status: 404 });
      const file = new File([await stored.arrayBuffer()], document.originalName, { type: document.contentType });
      const indexed = await uploadKnowledgeFile(file, {
        documentId: document.id,
        documentName: document.documentName,
        category: document.category,
        year: document.year,
        effectiveFrom: document.effectiveFrom,
        effectiveTo: document.effectiveTo,
      });
      openaiFileId = indexed.openaiFileId;
      vectorStoreId = indexed.vectorStoreId;
    }
    const status = await waitForVectorFile(vectorStoreId, openaiFileId);
    await db.update(knowledgeDocuments).set({
      status,
      openaiFileId,
      vectorStoreFileId: openaiFileId,
      errorMessage: null,
      updatedAt: new Date().toISOString(),
    }).where(eq(knowledgeDocuments.id, id));
    const [updated] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).limit(1);
    return Response.json({ document: updated });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "색인 재시도에 실패했습니다.";
    await db.update(knowledgeDocuments).set({ status: "FAILED", errorMessage: detail.slice(0, 240), updatedAt: new Date().toISOString() }).where(eq(knowledgeDocuments.id, id));
    return Response.json({ error: detail }, { status: 502 });
  }
}
