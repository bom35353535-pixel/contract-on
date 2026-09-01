import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { knowledgeDocuments } from "@/db/schema";
import {
  KNOWLEDGE_CATEGORIES,
  PROTOTYPE_MAX_FILE_SIZE,
  SUPPORTED_EXTENSIONS,
  isOpenAIConfigured,
} from "@/lib/knowledge";
import { uploadKnowledgeFile, waitForVectorFile } from "@/lib/openai-knowledge";
import { documentNameFromFileName } from "@/lib/file-name";

export const runtime = "edge";

function jsonError(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("등록할 파일을 선택해 주세요.");

  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
    return jsonError("PDF, DOCX, XLSX, XLSM, CSV, TXT 파일만 등록할 수 있습니다.");
  }
  if (file.size === 0) return jsonError("빈 파일은 등록할 수 없습니다.");
  if (file.size > PROTOTYPE_MAX_FILE_SIZE) return jsonError("프로토타입 파일 제한은 15MB입니다.");

  const documentName = String(form.get("documentName") || "").trim() || documentNameFromFileName(file.name);
  const category = String(form.get("category") || "").trim();
  const yearRaw = String(form.get("year") || "").trim();
  const effectiveFrom = String(form.get("effectiveFrom") || "").trim() || null;
  const effectiveTo = String(form.get("effectiveTo") || "").trim() || null;
  const deferIndexing = String(form.get("deferIndexing") || "") === "true";
  if (!KNOWLEDGE_CATEGORIES.includes(category as (typeof KNOWLEDGE_CATEGORIES)[number])) return jsonError("유효한 분류를 선택해 주세요.");
  if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) return jsonError("적용 종료일은 시작일보다 빠를 수 없습니다.");
  const year = yearRaw ? Number(yearRaw) : null;
  if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) return jsonError("기준연도를 확인해 주세요.");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const storageKey = `knowledge/${id}/${encodeURIComponent(file.name)}`;
  const sourceKind = extension === "csv" || extension === "xlsx" || extension === "xlsm" ? "TABLE" : "TEXT";
  const shouldIndex = isOpenAIConfigured() && !deferIndexing;
  const initialStatus = shouldIndex ? "INDEXING" : isOpenAIConfigured() ? "PENDING_INDEXING" : "PENDING_CONFIGURATION";

  await env.FILES.put(storageKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { documentId: id, originalName: file.name },
  });

  const db = getDb();
  await db.insert(knowledgeDocuments).values({
    id,
    documentName,
    originalName: file.name,
    category,
    year,
    effectiveFrom,
    effectiveTo,
    uploadedAt: now,
    status: initialStatus,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    storageKey,
    sourceKind,
    openaiFileId: null,
    vectorStoreFileId: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  });

  let message = shouldIndex
    ? "원본을 저장하고 Vector Store 색인을 시작했습니다."
    : deferIndexing
      ? "토큰을 사용하지 않고 원본과 메타데이터를 저장했습니다. 나중에 재시도로 색인할 수 있습니다."
      : "원본과 메타데이터를 저장했습니다. API 키 설정 후 색인이 필요합니다.";

  if (shouldIndex) {
    try {
      const indexed = await uploadKnowledgeFile(file, { documentId: id, documentName, category, year, effectiveFrom, effectiveTo });
      const status = await waitForVectorFile(indexed.vectorStoreId, indexed.openaiFileId);
      await db.update(knowledgeDocuments).set({
        status,
        openaiFileId: indexed.openaiFileId,
        vectorStoreFileId: indexed.openaiFileId,
        updatedAt: new Date().toISOString(),
      }).where(eq(knowledgeDocuments.id, id));
      message = status === "READY" ? "지식자료 등록과 검색 색인이 완료되었습니다." : "지식자료를 등록했으며 색인이 진행 중입니다.";
    } catch (error) {
      const detail = error instanceof Error ? error.message : "OpenAI 색인에 실패했습니다.";
      await db.update(knowledgeDocuments).set({ status: "FAILED", errorMessage: detail.slice(0, 240), updatedAt: new Date().toISOString() }).where(eq(knowledgeDocuments.id, id));
      message = "원본은 저장했지만 OpenAI 색인에 실패했습니다.";
    }
  }

  const [document] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).limit(1);
  return Response.json({ document, message }, { status: 201 });
}
