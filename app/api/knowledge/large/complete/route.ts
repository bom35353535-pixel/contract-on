import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { knowledgeDocuments } from "@/db/schema";
import { KNOWLEDGE_CATEGORIES, LARGE_KNOWLEDGE_MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from "@/lib/knowledge";
import { documentNameFromFileName } from "@/lib/file-name";

export const runtime = "edge";

export async function POST(request: Request) {
  await ensureDatabase();
  const body = await request.json() as Record<string, unknown>;
  const id = String(body.id || "");
  const uploadId = String(body.uploadId || "");
  const fileName = String(body.fileName || "").trim();
  const documentName = String(body.documentName || "").trim() || documentNameFromFileName(fileName);
  const category = String(body.category || "").trim();
  const yearRaw = String(body.year || "").trim();
  const effectiveFrom = String(body.effectiveFrom || "").trim() || null;
  const effectiveTo = String(body.effectiveTo || "").trim() || null;
  const sizeBytes = Number(body.sizeBytes || 0);
  const contentType = String(body.contentType || "application/octet-stream");
  const parts = Array.isArray(body.parts) ? body.parts as Array<{ partNumber: number; etag: string }> : [];
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  const year = yearRaw ? Number(yearRaw) : null;

  if (!id || !uploadId || !fileName || !documentName || parts.length === 0) return Response.json({ error: "대용량 업로드 완료 정보를 확인해 주세요." }, { status: 400 });
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > LARGE_KNOWLEDGE_MAX_FILE_SIZE) return Response.json({ error: "파일 크기를 확인해 주세요." }, { status: 400 });
  if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) return Response.json({ error: "지원하지 않는 파일 형식입니다." }, { status: 400 });
  if (!KNOWLEDGE_CATEGORIES.includes(category as (typeof KNOWLEDGE_CATEGORIES)[number])) return Response.json({ error: "유효한 분류를 선택해 주세요." }, { status: 400 });
  if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) return Response.json({ error: "기준연도를 확인해 주세요." }, { status: 400 });
  if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) return Response.json({ error: "적용 종료일은 시작일보다 빠를 수 없습니다." }, { status: 400 });

  const storageKey = `knowledge/${id}/${encodeURIComponent(fileName)}`;
  const now = new Date().toISOString();
  const sourceKind = extension === "csv" || extension === "xlsx" || extension === "xlsm" ? "TABLE" : "TEXT";
  try {
    const upload = env.FILES.resumeMultipartUpload(storageKey, uploadId);
    await upload.complete(parts.sort((a, b) => a.partNumber - b.partNumber));
    await getDb().insert(knowledgeDocuments).values({
      id, documentName, originalName: fileName, category, year, effectiveFrom, effectiveTo, uploadedAt: now,
      status: "LARGE_FILE_STORED", contentType, sizeBytes, storageKey, sourceKind,
      openaiFileId: null, vectorStoreFileId: null,
      errorMessage: "원본 보관 완료 · AI 검색용 분할 처리 필요", createdAt: now, updatedAt: now,
    });
    const [document] = await getDb().select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).limit(1);
    return Response.json({ document, message: "대용량 원본을 지식라이브러리에 저장했습니다. AI 검색용 분할 처리는 별도로 진행됩니다." }, { status: 201 });
  } catch (error) {
    console.error("knowledge multipart complete failed", error);
    await env.FILES.delete(storageKey).catch(() => undefined);
    return Response.json({ error: "분할된 대용량 원본을 최종 저장하지 못했습니다." }, { status: 500 });
  }
}
