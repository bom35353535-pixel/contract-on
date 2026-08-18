import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { knowledgeSettings } from "@/db/schema";
import { normalizeTableFile } from "./table-normalizer";

const API_BASE = "https://api.openai.com/v1";

function apiKey() {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  return key;
}

async function openai(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${apiKey()}`);
  if (!(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI API 오류(${response.status}): ${detail.slice(0, 240)}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

export async function ensureVectorStore() {
  const db = getDb();
  const [existing] = await db.select().from(knowledgeSettings).where(eq(knowledgeSettings.key, "openai_vector_store_id")).limit(1);
  if (existing?.value) return existing.value;

  const created = await openai("/vector_stores", {
    method: "POST",
    body: JSON.stringify({ name: "교육행정 공사계약 승인 지식자료" }),
  });
  const id = String(created.id || "");
  if (!id) throw new Error("Vector Store ID를 받지 못했습니다.");
  const now = new Date().toISOString();
  await db.insert(knowledgeSettings).values({ key: "openai_vector_store_id", value: id, updatedAt: now }).onConflictDoUpdate({
    target: knowledgeSettings.key,
    set: { value: id, updatedAt: now },
  });
  return id;
}

export async function uploadKnowledgeFile(file: File, metadata: { documentId: string; documentName: string; category: string; year: number | null; effectiveFrom: string | null; effectiveTo: string | null }) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  let uploadFile = file;
  if (extension === "csv" || extension === "xlsx") {
    const normalized = await normalizeTableFile(file, extension);
    const header = [
      `문서명: ${metadata.documentName}`,
      `분류: ${metadata.category}`,
      `기준연도: ${metadata.year ?? "미지정"}`,
      `적용기간: ${metadata.effectiveFrom ?? "미지정"} ~ ${metadata.effectiveTo ?? "미지정"}`,
      "",
    ].join("\n");
    uploadFile = new File([header, normalized], `${file.name}.txt`, { type: "text/plain" });
  }

  const form = new FormData();
  form.set("purpose", "assistants");
  form.set("file", uploadFile);
  const uploaded = await openai("/files", { method: "POST", body: form });
  const openaiFileId = String(uploaded.id || "");
  if (!openaiFileId) throw new Error("OpenAI File ID를 받지 못했습니다.");

  const vectorStoreId = await ensureVectorStore();
  const attributes: Record<string, string | number> = {
    document_id: metadata.documentId,
    category: metadata.category,
  };
  if (metadata.year) attributes.year = metadata.year;
  if (metadata.effectiveFrom) attributes.effective_from = metadata.effectiveFrom;
  if (metadata.effectiveTo) attributes.effective_to = metadata.effectiveTo;

  await openai(`/vector_stores/${vectorStoreId}/files`, {
    method: "POST",
    body: JSON.stringify({ file_id: openaiFileId, attributes }),
  });
  return { openaiFileId, vectorStoreId };
}

export async function waitForVectorFile(vectorStoreId: string, openaiFileId: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const file = await openai(`/vector_stores/${vectorStoreId}/files/${openaiFileId}`);
    const status = String(file.status || "");
    if (status === "completed") return "READY";
    if (status === "failed" || status === "cancelled") throw new Error("Vector Store 파일 색인에 실패했습니다.");
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  return "INDEXING";
}

export async function deleteKnowledgeFile(vectorStoreId: string, openaiFileId: string) {
  await openai(`/vector_stores/${vectorStoreId}/files/${openaiFileId}`, { method: "DELETE" });
  await openai(`/files/${openaiFileId}`, { method: "DELETE" });
}

export async function getVectorStoreId() {
  const [setting] = await getDb().select().from(knowledgeSettings).where(eq(knowledgeSettings.key, "openai_vector_store_id")).limit(1);
  return setting?.value || null;
}

export type OpenAIKnowledgeResponse = {
  id?: string;
  output?: Array<{
    type?: string;
    results?: Array<{ file_id?: string; filename?: string; score?: number; text?: string }>;
    content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; file_id?: string; filename?: string }> }>;
  }>;
};

export async function askRegisteredKnowledge(question: string, vectorStoreId: string) {
  return openai("/responses", {
    method: "POST",
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.6",
      instructions: "당신은 교육행정 공사계약 지식 검증기입니다. 반드시 file_search로 제공된 등록 자료에 질문의 직접적인 답이 명시된 경우에만 한국어로 간결하게 답하세요. 일반 지식, 추론, 추정, 외부 지식은 사용하지 마세요. 직접 근거가 없으면 오직 NO_EVIDENCE만 출력하세요. 답변에는 근거 파일 인용이 반드시 포함되어야 합니다.",
      input: question,
      tools: [{ type: "file_search", vector_store_ids: [vectorStoreId], max_num_results: 5 }],
      include: ["file_search_call.results"],
    }),
  }) as Promise<OpenAIKnowledgeResponse>;
}
