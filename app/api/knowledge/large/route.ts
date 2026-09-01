import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { knowledgeDocuments } from "@/db/schema";
import {
  KNOWLEDGE_CATEGORIES,
  LARGE_KNOWLEDGE_MAX_FILE_SIZE,
  SUPPORTED_EXTENSIONS,
} from "@/lib/knowledge";
import { documentNameFromFileName } from "@/lib/file-name";

export const runtime = "edge";

function jsonError(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const params = new URL(request.url).searchParams;
  const fileName = String(params.get("fileName") || "").trim();
  const sizeBytes = Number(params.get("sizeBytes") || request.headers.get("content-length") || 0);
  const documentName = String(params.get("documentName") || "").trim() || documentNameFromFileName(fileName);
  const category = String(params.get("category") || "").trim();
  const yearRaw = String(params.get("year") || "").trim();
  const effectiveFrom = String(params.get("effectiveFrom") || "").trim() || null;
  const effectiveTo = String(params.get("effectiveTo") || "").trim() || null;
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  if (!fileName || !request.body) return jsonError("등록할 파일을 선택해 주세요.");
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) return jsonError("파일 크기를 확인할 수 없습니다.");
  if (sizeBytes > LARGE_KNOWLEDGE_MAX_FILE_SIZE) return jsonError("대용량 원본은 파일별 200MB 이하만 등록할 수 있습니다.", 413);
  if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
    return jsonError("PDF, DOCX, XLSX, XLSM, CSV, TXT 파일만 등록할 수 있습니다.");
  }
  if (!KNOWLEDGE_CATEGORIES.includes(category as (typeof KNOWLEDGE_CATEGORIES)[number])) return jsonError("유효한 분류를 선택해 주세요.");
  if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) return jsonError("적용 종료일은 시작일보다 빠를 수 없습니다.");
  const year = yearRaw ? Number(yearRaw) : null;
  if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) return jsonError("기준연도를 확인해 주세요.");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const storageKey = `knowledge/${id}/${encodeURIComponent(fileName)}`;
  const contentType = request.headers.get("content-type") || "application/octet-stream";
  const sourceKind = extension === "csv" || extension === "xlsx" || extension === "xlsm" ? "TABLE" : "TEXT";

  try {
    await env.FILES.put(storageKey, request.body, {
      httpMetadata: { contentType },
      customMetadata: { documentId: id, originalName: fileName },
    });
    await getDb().insert(knowledgeDocuments).values({
      id,
      documentName,
      originalName: fileName,
      category,
      year,
      effectiveFrom,
      effectiveTo,
      uploadedAt: now,
      status: "LARGE_FILE_STORED",
      contentType,
      sizeBytes,
      storageKey,
      sourceKind,
      openaiFileId: null,
      vectorStoreFileId: null,
      errorMessage: "원본 보관 완료 · AI 검색용 분할 처리 필요",
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    await env.FILES.delete(storageKey).catch(() => undefined);
    return jsonError("대용량 원본을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  const [document] = await getDb().select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).limit(1);
  return Response.json({ document, message: "대용량 원본을 지식라이브러리에 저장했습니다. AI 검색용 분할 처리는 별도로 진행됩니다." }, { status: 201 });
}
