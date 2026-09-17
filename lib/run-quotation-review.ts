import { env } from "cloudflare:workers";
import { inArray } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { knowledgeDocuments, type QuotationAnalysisRecord, type QuotationItemRecord } from "@/db/schema";
import { findLocalQuotationEvidence } from "./local-quotation-evidence";
import { findQuotationReviewCriteria, getVectorStoreId } from "./openai-knowledge";
import { applyEvidenceCandidates, buildArithmeticReview, buildEvidenceTargets, deriveExpenseAmount, reviewCounts, type ReviewItem } from "./quotation-review";

type Quotation = { analysis: QuotationAnalysisRecord; items: QuotationItemRecord[] };

export async function performQuotationReview(quotation: Quotation, contractId: string | null) {
  const db = getDb();
  const analysis = quotation.analysis.expenses === null
    ? { ...quotation.analysis, expenses: deriveExpenseAmount(quotation.items) }
    : quotation.analysis;
  const arithmetic = buildArithmeticReview(analysis, quotation.items);
  const targets = buildEvidenceTargets(analysis, quotation.items);
  // READY/INDEXING 원문의 직접 인용만 사용하고 외부 AI 재검색을 기다리지 않는다.
  const searchableDocuments = await db.select({
    id: knowledgeDocuments.id,
    documentName: knowledgeDocuments.documentName,
    originalName: knowledgeDocuments.originalName,
    openaiFileId: knowledgeDocuments.openaiFileId,
    year: knowledgeDocuments.year,
    effectiveFrom: knowledgeDocuments.effectiveFrom,
    effectiveTo: knowledgeDocuments.effectiveTo,
    status: knowledgeDocuments.status,
    category: knowledgeDocuments.category,
    storageKey: knowledgeDocuments.storageKey,
    sizeBytes: knowledgeDocuments.sizeBytes,
  }).from(knowledgeDocuments).where(inArray(knowledgeDocuments.status, ["READY", "INDEXING"]));

  let evidenceItems: ReviewItem[];
  let responseId: string | null = null;
  let warning: string | null = null;
  let rawCandidates: unknown[] = [];
  try {
    const textDocuments = (await Promise.all(searchableDocuments.map(async (document) => {
      if (!/\.(?:md|txt|csv)$/i.test(document.originalName) || document.sizeBytes > 3 * 1024 * 1024) return null;
      const stored = await env.FILES.get(document.storageKey);
      if (!stored) return null;
      return { ...document, text: await stored.text() };
    }))).filter((document): document is NonNullable<typeof document> => Boolean(document));
    const reviewContext = {
        constructionType: quotation.analysis.constructionType,
        totalAmount: quotation.analysis.totalAmount,
        plannedStartDate: quotation.analysis.plannedStartDate,
        plannedCompletionDate: quotation.analysis.plannedCompletionDate,
    };
    const localEvidence = findLocalQuotationEvidence(targets, textDocuments, reviewContext);
    const candidates = [...localEvidence.candidates];
    const results = [...localEvidence.results];
    const locallyMatched = new Set(candidates.map((candidate) => candidate.targetKey));
    const missingLaborTargets = targets.filter((target) => target.section === "LABOR" && !locallyMatched.has(target.targetKey));
    if (missingLaborTargets.length && env.OPENAI_API_KEY) {
      const vectorStoreId = await getVectorStoreId();
      if (vectorStoreId) {
        try {
          const remoteEvidence = await findQuotationReviewCriteria(missingLaborTargets, vectorStoreId, {
            ...reviewContext,
            referenceDate: quotation.analysis.plannedStartDate || new Date().toISOString().slice(0, 10),
            instruction: "같은 직종 자료가 여러 개면 적용일이 가장 최신인 등록자료를 우선",
          });
          candidates.push(...remoteEvidence.candidates);
          results.push(...remoteEvidence.results);
          responseId = remoteEvidence.responseId;
        } catch (error) {
          console.error("Indexed labor evidence lookup failed", error);
        }
      }
    }
    rawCandidates = candidates;
    evidenceItems = applyEvidenceCandidates(targets, candidates, results, searchableDocuments, analysis);
    if (targets.length && candidates.length < targets.length) {
      warning = "등록된 MD·TXT·CSV에서 직접 확인되는 근거만 즉시 반영했습니다. 찾지 못한 항목은 기준자료 없음으로 표시했습니다.";
    }
  } catch (error) {
    console.error("Local quotation evidence lookup failed", error);
    warning = "산술검산은 완료했지만 등록자료 원문을 읽지 못했습니다. 지식자료 등록상태를 확인해 주세요.";
    evidenceItems = applyEvidenceCandidates(targets, [], [], searchableDocuments, analysis);
  }

  const items = [...arithmetic, ...evidenceItems];
  const counts = reviewCounts(items);
  const reviewId = crypto.randomUUID();
  const now = new Date().toISOString();
  const d1 = getD1();
  await d1.prepare(`
    INSERT INTO quotation_reviews (id, analysis_id, contract_id, normal_count, check_count, error_count, no_basis_count, response_id, warning, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(reviewId, quotation.analysis.id, contractId, counts.normalCount, counts.checkCount, counts.errorCount, counts.noBasisCount, responseId, warning, now).run();

  for (let start = 0; start < items.length; start += 75) {
    const statements = items.slice(start, start + 75).map((item) => d1.prepare(`
      INSERT INTO quotation_review_items (
        id, review_id, section, target_key, label, status, quoted_value, expected_value, difference, difference_rate,
        calculation, detail, evidence_document_id, evidence_document_name, evidence_year, evidence_location, evidence_excerpt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), reviewId, item.section, item.targetKey, item.label, item.status, item.quotedValue, item.expectedValue,
      item.difference, item.differenceRate, item.calculation, item.detail, item.evidenceDocumentId, item.evidenceDocumentName,
      item.evidenceYear, item.evidenceLocation, item.evidenceExcerpt,
    ));
    if (statements.length) await d1.batch(statements);
  }

  await d1.prepare(`
    INSERT INTO ai_decision_audit (id, analysis_id, contract_id, action, source_file, extracted_json, ai_judgment, user_corrected_json, final_json, decided_at)
    VALUES (?, ?, ?, 'QUOTATION_REVIEW', ?, ?, ?, NULL, ?, ?)
  `).bind(
    crypto.randomUUID(), quotation.analysis.id, contractId, quotation.analysis.originalName,
    quotation.analysis.extractionJson, JSON.stringify(rawCandidates), JSON.stringify({ counts, items }), now,
  ).run();

  return { reviewId, counts, warning };
}
