import { env } from "cloudflare:workers";
import { KNOWLEDGE_CATEGORIES, LARGE_KNOWLEDGE_MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from "@/lib/knowledge";
import { documentNameFromFileName } from "@/lib/file-name";

export const runtime = "edge";

function jsonError(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const fileName = String(body.fileName || "").trim();
  const sizeBytes = Number(body.sizeBytes || 0);
  const documentName = String(body.documentName || "").trim() || documentNameFromFileName(fileName);
  const category = String(body.category || "").trim();
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  if (!fileName || !documentName) return jsonError("등록할 파일을 선택해 주세요.");
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) return jsonError("파일 크기를 확인할 수 없습니다.");
  if (sizeBytes > LARGE_KNOWLEDGE_MAX_FILE_SIZE) return jsonError("대용량 원본은 파일별 200MB 이하만 등록할 수 있습니다.", 413);
  if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) return jsonError("지원하지 않는 파일 형식입니다.");
  if (!KNOWLEDGE_CATEGORIES.includes(category as (typeof KNOWLEDGE_CATEGORIES)[number])) return jsonError("유효한 분류를 선택해 주세요.");

  const id = crypto.randomUUID();
  const storageKey = `knowledge/${id}/${encodeURIComponent(fileName)}`;
  try {
    const upload = await env.FILES.createMultipartUpload(storageKey, {
      httpMetadata: { contentType: String(body.contentType || "application/octet-stream") },
      customMetadata: { documentId: id, originalName: fileName },
    });
    return Response.json({ id, uploadId: upload.uploadId }, { status: 201 });
  } catch (error) {
    console.error("knowledge multipart init failed", error);
    return jsonError("대용량 업로드를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
}
