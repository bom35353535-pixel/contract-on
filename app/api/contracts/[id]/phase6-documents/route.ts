import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { knowledgeDocuments } from "@/db/schema";
import { advanceContractStage, getContract } from "@/lib/contracts";
import {
  buildDocumentChecklist,
  documentReviewCounts,
  verifyRequiredDocumentCriteria,
  type ClassifiedDocument,
  type DocumentStage,
  type RequiredDocumentCriterion,
} from "@/lib/contract-document-review";
import { findRequiredDocumentCriteria, getVectorStoreId } from "@/lib/openai-knowledge";
import { getPhase6DocumentWorkspace } from "@/lib/phase6-documents";
import { classifySubmittedDocumentName, submittedDocumentTypeOptions } from "@/lib/submitted-document-classifier";
import { CONTRACT_STAGES, isContractStage } from "@/lib/workflow";

export const runtime = "edge";

const ALLOWED_EXTENSIONS = ["pdf", "docx", "xlsx", "xls", "csv", "txt"] as const;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 10;

function isDocumentStage(value: FormDataEntryValue | unknown): value is DocumentStage {
  return value === "NARA_CONTRACT" || value === "PRE_CONSTRUCTION" || value === "COMPLETION";
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function safeFileName(name: string) {
  return name.replace(/[^0-9A-Za-z가-힣._-]/g, "_").slice(-120) || "document";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id: contractId } = await context.params;
  const contract = await getContract(contractId);
  if (!contract) return errorResponse("계약 정보를 찾을 수 없습니다.", 404);
  const form = await request.formData();
  const stage = form.get("documentStage");
  if (!isDocumentStage(stage)) return errorResponse("문서 업무단계를 확인해 주세요.");
  if (!isContractStage(contract.currentStage)) return errorResponse("현재 계약단계를 확인할 수 없습니다.", 409);
  const currentStageIndex = CONTRACT_STAGES.indexOf(contract.currentStage);
  const documentStageIndex = CONTRACT_STAGES.indexOf(stage);
  if (currentStageIndex > documentStageIndex) return errorResponse("이미 완료된 업무단계에는 서류를 추가로 업로드할 수 없습니다.", 409);
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return errorResponse("분석할 서류를 한 개 이상 선택해 주세요.");
  if (files.length > MAX_FILES) return errorResponse(`한 번에 최대 ${MAX_FILES}개까지 분석할 수 있습니다.`);
  if (files.some((file) => file.size > MAX_FILE_SIZE)) return errorResponse("파일 하나의 최대 크기는 20MB입니다.");
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_SIZE) return errorResponse("전체 파일 크기는 50MB 이하여야 합니다.");
  if (files.some((file) => !ALLOWED_EXTENSIONS.includes((file.name.split(".").pop()?.toLowerCase() || "") as (typeof ALLOWED_EXTENSIONS)[number]))) {
    return errorResponse("PDF, DOCX, XLSX, XLS, CSV, TXT 서류만 분석할 수 있습니다.");
  }
  const submittedTypesRaw = String(form.get("submittedTypes") || "[]");
  let submittedTypes: unknown[] = [];
  try {
    const parsed = JSON.parse(submittedTypesRaw);
    if (Array.isArray(parsed)) submittedTypes = parsed;
  } catch {
    return errorResponse("선택한 문서 종류를 확인해 주세요.");
  }
  const allowedTypes = new Set(submittedDocumentTypeOptions(stage));
  if (submittedTypes.some((value) => value !== null && value !== "" && (typeof value !== "string" || !allowedTypes.has(value)))) {
    return errorResponse("선택한 문서 종류를 확인해 주세요.");
  }

  const stored: Array<{ id: string; storageKey: string; file: File }> = [];
  let metadataSaved = false;
  try {
    for (const file of files) {
      const id = crypto.randomUUID();
      const storageKey = `contract-documents/${contractId}/${stage}/${id}-${safeFileName(file.name)}`;
      await env.FILES.put(storageKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
        customMetadata: { contractId, documentStage: stage, originalName: file.name },
      });
      stored.push({ id, storageKey, file });
    }

    const classification = {
      responseId: null,
      documents: files.map((file, index) => ({
        originalName: file.name,
        openaiFileId: null,
        ...classifySubmittedDocumentName(file.name, stage, typeof submittedTypes[index] === "string" ? submittedTypes[index] as string : null),
      })),
    };
    const now = new Date().toISOString();
    const d1 = getD1();
    const inserts = stored.map((entry, index) => {
      const result = classification.documents[index];
      return d1.prepare(`
        INSERT INTO contract_document_files (
          id, contract_id, document_stage, original_name, content_type, size_bytes, storage_key,
          openai_file_id, detected_type, detection_status, summary, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        entry.id, contractId, stage, entry.file.name, entry.file.type || "application/octet-stream", entry.file.size, entry.storageKey,
        null, result?.detectedType || null, result?.detectionStatus || "UNCERTAIN", result?.summary || null, now,
      );
    });
    await d1.batch(inserts);
    metadataSaved = true;

    const readyDocuments = await getDb().select({
      id: knowledgeDocuments.id,
      documentName: knowledgeDocuments.documentName,
      originalName: knowledgeDocuments.originalName,
      openaiFileId: knowledgeDocuments.openaiFileId,
      year: knowledgeDocuments.year,
    }).from(knowledgeDocuments).where(eq(knowledgeDocuments.status, "READY"));

    let criteria: RequiredDocumentCriterion[] = [];
    let criteriaResponseId: string | null = null;
    let rawCandidates: unknown[] = [];
    let warning: string | null = null;
    const vectorStoreId = readyDocuments.length ? await getVectorStoreId() : null;
    if (vectorStoreId) {
      try {
        const evidence = await findRequiredDocumentCriteria({
          projectName: contract.projectName,
          constructionType: contract.constructionType,
          contractMethod: contract.contractMethod,
        }, stage, vectorStoreId);
        rawCandidates = evidence.candidates;
        criteriaResponseId = evidence.responseId;
        criteria = verifyRequiredDocumentCriteria(evidence.candidates, evidence.results, readyDocuments);
        if (!criteria.length) warning = "업로드한 서류의 종류는 확인했습니다. 다만 등록된 지식자료에서 이 단계의 필수 제출서류 목록 근거를 확인하지 못해 누락 여부는 판정하지 않았습니다.";
      } catch (error) {
        console.error("Required document evidence lookup failed", error);
        warning = "등록자료 검색에 실패해 제출 기준을 확정하지 못했습니다. 잠시 후 다시 분석해 주세요.";
      }
    } else {
      warning = "검색 가능한 등록 지식자료가 없어 필수 제출서류 기준을 제시하지 않았습니다.";
    }

    const workspace = await getPhase6DocumentWorkspace(contractId, stage);
    const classifiedFiles: ClassifiedDocument[] = workspace.files.map((file) => ({
      id: file.id,
      originalName: file.originalName,
      detectedType: file.detectedType,
      detectionStatus: file.detectionStatus === "EXACT" ? "EXACT" : "UNCERTAIN",
      summary: file.summary,
    }));
    const items = buildDocumentChecklist(criteria, classifiedFiles);
    const counts = documentReviewCounts(items);
    const reviewId = crypto.randomUUID();
    await d1.prepare(`
      INSERT INTO contract_document_reviews (
        id, contract_id, document_stage, submitted_count, missing_count, check_count, response_id, warning, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(reviewId, contractId, stage, counts.submittedCount, counts.missingCount, counts.checkCount, criteriaResponseId || classification.responseId, warning, now).run();

    for (let start = 0; start < items.length; start += 75) {
      const statements = items.slice(start, start + 75).map((item) => d1.prepare(`
        INSERT INTO contract_document_review_items (
          id, review_id, status, required_name, uploaded_file_id, detail,
          evidence_document_id, evidence_document_name, evidence_year, evidence_location, evidence_excerpt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), reviewId, item.status, item.requiredName, item.uploadedFileId, item.detail,
        item.evidenceDocumentId, item.evidenceDocumentName, item.evidenceYear, item.evidenceLocation, item.evidenceExcerpt,
      ));
      if (statements.length) await d1.batch(statements);
    }

    await d1.prepare(`
      INSERT INTO ai_decision_audit (id, analysis_id, contract_id, action, source_file, extracted_json, ai_judgment, user_corrected_json, final_json, decided_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).bind(
      crypto.randomUUID(), contractId, stage === "COMPLETION" ? "PHASE7_COMPLETION_DOCUMENT_REVIEW" : "PHASE6_DOCUMENT_REVIEW",
      files.map((file) => file.name).join(", "), JSON.stringify(classification.documents),
      JSON.stringify({ method: "LOCAL_FILENAME_RULES", knowledgeCandidates: rawCandidates }), JSON.stringify({ counts, items }), now,
    ).run();

    return Response.json({ reviewId, counts, warning, preUploaded: currentStageIndex < documentStageIndex }, { status: 201 });
  } catch (error) {
    if (!metadataSaved) await Promise.all(stored.map((entry) => env.FILES.delete(entry.storageKey).catch(() => undefined)));
    return errorResponse(error instanceof Error ? error.message : "서류 분석에 실패했습니다.", 502);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id: contractId } = await context.params;
  const body = await request.json().catch(() => ({})) as { documentStage?: unknown };
  if (!isDocumentStage(body.documentStage)) return errorResponse("문서 업무단계를 확인해 주세요.");
  const contract = await getContract(contractId);
  if (!contract) return errorResponse("계약 정보를 찾을 수 없습니다.", 404);
  if (contract.currentStage !== body.documentStage) return errorResponse("현재 계약단계가 이미 변경되었습니다.", 409);
  const workspace = await getPhase6DocumentWorkspace(contractId, body.documentStage);
  if (!workspace.review) return errorResponse("먼저 서류를 업로드하고 분석 결과를 확인해 주세요.", 409);
  try {
    const result = await advanceContractStage(contractId, body.documentStage === "COMPLETION" ? "phase7" : "phase6-documents");
    return Response.json(result);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "단계를 변경하지 못했습니다.", 409);
  }
}
