import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { knowledgeDocuments } from "@/db/schema";
import { isOpenAIConfigured } from "@/lib/knowledge";
import { deleteKnowledgeFile, getVectorStoreId } from "@/lib/openai-knowledge";

export const runtime = "edge";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await context.params;
  const db = getDb();
  const [document] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).limit(1);
  if (!document) return Response.json({ error: "지식자료를 찾을 수 없습니다." }, { status: 404 });

  if (document.openaiFileId) {
    if (!isOpenAIConfigured()) return Response.json({ error: "OpenAI API 키 설정 후 검색 색인에서 삭제할 수 있습니다." }, { status: 409 });
    const vectorStoreId = await getVectorStoreId();
    if (!vectorStoreId) return Response.json({ error: "Vector Store 설정을 찾을 수 없습니다." }, { status: 409 });
    try {
      await deleteKnowledgeFile(vectorStoreId, document.openaiFileId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "OpenAI 지식 색인 삭제에 실패했습니다.";
      return Response.json({ error: detail }, { status: 502 });
    }
  }

  await env.FILES.delete(document.storageKey);
  await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
  return Response.json({ ok: true });
}
