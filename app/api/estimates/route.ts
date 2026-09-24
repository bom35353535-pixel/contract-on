import { env } from "cloudflare:workers";
import { getD1 } from "@/db";
import { ensureDatabase } from "@/db/init";
import {
  ESTIMATE_EXTENSIONS,
  ESTIMATE_MAX_FILE_SIZE,
  normalizeQuotationExtraction,
  quotationColumns,
  quotationConsistencyIssues,
  type QuotationExtraction,
} from "@/lib/estimate";
import { extractQuotation, type EstimateAnalysisStage, type EstimateExtractionMetrics } from "@/lib/openai-estimate";

export const runtime = "edge";

const ANALYSIS_VERSION = "estimate-extraction-2026-09-24-v2";
const CRITERIA_VERSION = "quotation-structure-v1";
type ProgressStage = "FILE_CHECK" | EstimateAnalysisStage | "CACHE_HIT" | "SAVE_RESULT";
type Progress = (stage: ProgressStage) => void;

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function progressLabel(stage: ProgressStage) {
  return ({
    FILE_CHECK: "파일 형식과 크기를 확인했습니다.",
    DOCUMENT_PREP: "문서의 표와 금액 구조를 읽고 있습니다.",
    AI_EXTRACTION: "문서에 적힌 값을 구조화하고 있습니다.",
    CROSS_CHECK: "합계와 세부 금액을 교차 확인하고 있습니다.",
    CACHE_HIT: "동일한 파일의 검증된 분석 결과를 불러왔습니다.",
    SAVE_RESULT: "분석 결과를 안전하게 저장하고 있습니다.",
  } satisfies Record<ProgressStage, string>)[stage];
}

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function analyzeAndSave(file: File, progress: Progress) {
  const totalStartedAt = performance.now();
  const bytes = await file.arrayBuffer();
  const stableFile = new File([bytes], file.name, { type: file.type || "application/octet-stream" });
  const fileHash = await sha256Hex(bytes);
  const cacheKey = `${fileHash}:${ANALYSIS_VERSION}:${CRITERIA_VERSION}`;
  const d1 = getD1();
  const cached = await d1.prepare("SELECT extraction_json, response_id, metrics_json FROM estimate_analysis_cache WHERE cache_key = ?")
    .bind(cacheKey).first<{ extraction_json: string; response_id: string | null; metrics_json: string }>();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const storageKey = `quotations/${id}/${encodeURIComponent(file.name)}`;
  const storagePromise = env.FILES.put(storageKey, bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { analysisId: id, originalName: file.name, fileHash },
  });

  let values: QuotationExtraction;
  let responseId: string | null;
  let metrics: EstimateExtractionMetrics;
  let cacheHit = false;
  try {
    if (cached) {
      try {
        values = normalizeQuotationExtraction(JSON.parse(cached.extraction_json));
        responseId = cached.response_id;
        const previous = JSON.parse(cached.metrics_json) as Partial<EstimateExtractionMetrics>;
        metrics = {
          mode: previous.mode === "OPENAI_FILE" ? "OPENAI_FILE" : "LOCAL_SPREADSHEET_TEXT",
          documentPreparationMs: 0,
          aiExtractionMs: 0,
          normalizationMs: 0,
          totalMs: 0,
          openaiRequestCount: 0,
        };
        cacheHit = true;
        progress("CACHE_HIT");
        progress("CROSS_CHECK");
      } catch {
        const extracted = await extractQuotation(stableFile, progress);
        values = extracted.data;
        responseId = extracted.responseId;
        metrics = extracted.metrics;
      }
    } else {
      const extracted = await extractQuotation(stableFile, progress);
      values = extracted.data;
      responseId = extracted.responseId;
      metrics = extracted.metrics;
    }

    const issues = quotationConsistencyIssues(values);
    progress("SAVE_RESULT");
    await storagePromise;
    metrics.totalMs = Math.round(performance.now() - totalStartedAt);

    if (!cacheHit) {
      await d1.prepare(`
        INSERT INTO estimate_analysis_cache (cache_key, file_hash, analysis_version, criteria_version, extraction_json, response_id, metrics_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET extraction_json = excluded.extraction_json, response_id = excluded.response_id,
          metrics_json = excluded.metrics_json, updated_at = excluded.updated_at
      `).bind(cacheKey, fileHash, ANALYSIS_VERSION, CRITERIA_VERSION, JSON.stringify(values), responseId, JSON.stringify(metrics), now, now).run();
    }

    await d1.prepare(`
      INSERT INTO quotation_analyses (
        id, contract_id, original_name, content_type, size_bytes, storage_key, status,
        project_name, construction_type, purpose, location, company_name, business_registration_number, quotation_date,
        total_amount, supply_amount, vat_amount, material_cost, direct_labor_cost,
        indirect_labor_cost, expenses, statutory_expenses, overhead, profit, safety_health_cost,
        planned_start_date, planned_completion_date, extraction_json, response_id,
        created_at, updated_at, confirmed_at
      ) VALUES (?, NULL, ?, ?, ?, ?, 'ANALYZED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).bind(
      id, file.name, file.type || "application/octet-stream", file.size, storageKey,
      ...Object.values(quotationColumns(values)), JSON.stringify(values), responseId, now, now,
    ).run();

    for (let start = 0; start < values.items.length; start += 75) {
      const statements = values.items.slice(start, start + 75).map((item) => d1.prepare(`
        INSERT INTO quotation_items (analysis_id, category, trade, item_name, specification, unit, quantity, unit_price, amount, source_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, item.category, item.trade, item.itemName, item.specification, item.unit, item.quantity, item.unitPrice, item.amount, item.sourceText));
      if (statements.length) await d1.batch(statements);
    }

    await d1.prepare(`
      INSERT INTO ai_decision_audit (id, analysis_id, contract_id, action, source_file, extracted_json, ai_judgment, user_corrected_json, final_json, decided_at)
      VALUES (?, ?, NULL, 'QUOTATION_EXTRACTION', ?, ?, ?, NULL, NULL, ?)
    `).bind(
      crypto.randomUUID(), id, file.name, JSON.stringify(values),
      JSON.stringify({ policy: "문서에 명시된 정보만 구조화하며 적정성 판단은 수행하지 않음", cacheHit, fileHash, analysisVersion: ANALYSIS_VERSION, criteriaVersion: CRITERIA_VERSION, metrics, issues }),
      now,
    ).run();

    return { analysisId: id, cached: cacheHit, metrics, issues };
  } catch (error) {
    await storagePromise.catch(() => undefined);
    await env.FILES.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function POST(request: Request) {
  await ensureDatabase();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse("분석할 견적서를 선택해 주세요.");
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ESTIMATE_EXTENSIONS.includes(extension as (typeof ESTIMATE_EXTENSIONS)[number])) {
    return errorResponse("PDF, XLSX, XLS, DOCX, CSV 견적서만 분석할 수 있습니다.");
  }
  if (file.size === 0) return errorResponse("빈 파일은 분석할 수 없습니다.");
  if (file.size > ESTIMATE_MAX_FILE_SIZE) return errorResponse("업로드 가능한 파일 제한은 15MB입니다.");

  const wantsStream = request.headers.get("accept")?.includes("application/x-ndjson");
  if (!wantsStream) {
    try {
      const result = await analyzeAndSave(file, () => undefined);
      return Response.json(result, { status: 201 });
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "견적서 분석에 실패했습니다.", 502);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      const progress = (stage: ProgressStage) => send({ type: "progress", stage, label: progressLabel(stage) });
      try {
        progress("FILE_CHECK");
        const result = await analyzeAndSave(file, progress);
        send({ type: "complete", ...result });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "견적서 분석에 실패했습니다." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
