import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { knowledgeDocuments, knowledgeQueries } from "@/db/schema";
import { finalizeKnowledgeAnswer } from "@/lib/evidence-guard";
import { isOpenAIConfigured, NO_EVIDENCE_MESSAGE } from "@/lib/knowledge";
import { askRegisteredKnowledge, getVectorStoreId } from "@/lib/openai-knowledge";

export const runtime = "edge";

async function saveQuery(question: string, answer: string, evidenceStatus: string, sources: unknown[], responseId: string | null) {
  await getDb().insert(knowledgeQueries).values({
    id: crypto.randomUUID(),
    question,
    answer,
    evidenceStatus,
    sourcesJson: JSON.stringify(sources),
    responseId,
    createdAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  await ensureDatabase();
  const body = await request.json().catch(() => null) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "테스트 질문을 입력해 주세요." }, { status: 400 });
  if (question.length > 1000) return Response.json({ error: "질문은 1,000자 이내로 입력해 주세요." }, { status: 400 });

  const [readyDocuments, vectorStoreId] = await Promise.all([
    getDb().select({
      id: knowledgeDocuments.id,
      documentName: knowledgeDocuments.documentName,
      originalName: knowledgeDocuments.originalName,
      openaiFileId: knowledgeDocuments.openaiFileId,
    }).from(knowledgeDocuments).where(eq(knowledgeDocuments.status, "READY")),
    getVectorStoreId(),
  ]);

  if (!isOpenAIConfigured() || readyDocuments.length === 0) {
    await saveQuery(question, NO_EVIDENCE_MESSAGE, "NO_EVIDENCE", [], null);
    return Response.json({ answer: NO_EVIDENCE_MESSAGE, sources: [], evidenceStatus: "NO_EVIDENCE", durationMs: Date.now() - startedAt });
  }

  if (!vectorStoreId) {
    await saveQuery(question, NO_EVIDENCE_MESSAGE, "NO_EVIDENCE", [], null);
    return Response.json({ answer: NO_EVIDENCE_MESSAGE, sources: [], evidenceStatus: "NO_EVIDENCE", durationMs: Date.now() - startedAt });
  }

  try {
    const response = await askRegisteredKnowledge(question, vectorStoreId);
    const guarded = finalizeKnowledgeAnswer(response, readyDocuments);
    await saveQuery(question, guarded.answer, guarded.evidenceStatus, guarded.sources, response.id || null);
    return Response.json({ ...guarded, durationMs: Date.now() - startedAt });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "지식 검색에 실패했습니다.";
    return Response.json({ error: detail }, { status: 502 });
  }
}
