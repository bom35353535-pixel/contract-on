import { eq, inArray } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { knowledgeDocuments, type QuotationAnalysisRecord, type QuotationItemRecord } from "@/db/schema";
import { isOpenAIConfigured } from "./knowledge";
import { findQuotationReviewCriteria, getVectorStoreId } from "./openai-knowledge";
import { applyEvidenceCandidates, buildArithmeticReview, buildEvidenceTargets, reviewCounts, type ReviewItem } from "./quotation-review";

type Quotation = { analysis: QuotationAnalysisRecord; items: QuotationItemRecord[] };

export async function performQuotationReview(quotation: Quotation, contractId: string | null) {
  const db = getDb();
  const arithmetic = buildArithmeticReview(quotation.analysis, quotation.items);
  const targets = buildEvidenceTargets(quotation.analysis, quotation.items);
  // An OpenAI vector file can finish shortly after the upload request has timed out.
  // Keep INDEXING rows eligible: applyEvidenceCandidates still accepts only evidence
  // that was actually returned by file_search, so stale database state cannot hide a
  // searchable document and an unfinished document cannot create false evidence.
  const searchableDocuments = await db.select({
    id: knowledgeDocuments.id,
    documentName: knowledgeDocuments.documentName,
    originalName: knowledgeDocuments.originalName,
    openaiFileId: knowledgeDocuments.openaiFileId,
    year: knowledgeDocuments.year,
    status: knowledgeDocuments.status,
  }).from(knowledgeDocuments).where(inArray(knowledgeDocuments.status, ["READY", "INDEXING"]));

  let evidenceItems: ReviewItem[];
  let responseId: string | null = null;
  let warning: string | null = null;
  let rawCandidates: unknown[] = [];
  const vectorStoreId = searchableDocuments.length && isOpenAIConfigured() ? await getVectorStoreId() : null;
  if (vectorStoreId) {
    try {
      const evidence = await findQuotationReviewCriteria(targets, vectorStoreId, {
        constructionType: quotation.analysis.constructionType,
        totalAmount: quotation.analysis.totalAmount,
        supplyAmount: quotation.analysis.supplyAmount,
        materialCost: quotation.analysis.materialCost,
        directLaborCost: quotation.analysis.directLaborCost,
        indirectLaborCost: quotation.analysis.indirectLaborCost,
        expenses: quotation.analysis.expenses,
        overhead: quotation.analysis.overhead,
        profit: quotation.analysis.profit,
        plannedStartDate: quotation.analysis.plannedStartDate,
        plannedCompletionDate: quotation.analysis.plannedCompletionDate,
        constructionDays: (() => {
          const start = quotation.analysis.plannedStartDate ? Date.parse(quotation.analysis.plannedStartDate) : NaN;
          const end = quotation.analysis.plannedCompletionDate ? Date.parse(quotation.analysis.plannedCompletionDate) : NaN;
          return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 86_400_000) + 1 : null;
        })(),
      });
      rawCandidates = evidence.candidates;
      responseId = evidence.responseId;
      evidenceItems = applyEvidenceCandidates(targets, evidence.candidates, evidence.results, searchableDocuments, quotation.analysis);

      const returnedFileIds = new Set(evidence.results.map((result) => result.fileId));
      for (const document of searchableDocuments) {
        if (document.status === "INDEXING" && document.openaiFileId && returnedFileIds.has(document.openaiFileId)) {
          await db.update(knowledgeDocuments).set({ status: "READY", errorMessage: null, updatedAt: new Date().toISOString() }).where(eq(knowledgeDocuments.id, document.id));
        }
      }
    } catch (error) {
      console.error("Quotation review evidence lookup failed", error);
      warning = "산술검산은 완료했지만 등록자료 근거검색에 실패했습니다. 토큰·결제 상태를 확인한 뒤 다시 검토해 주세요.";
      evidenceItems = applyEvidenceCandidates(targets, [], [], searchableDocuments, quotation.analysis);
    }
  } else {
    warning = searchableDocuments.length
      ? "산술검산은 완료했지만 등록자료 검색 연결을 사용할 수 없습니다."
      : "검색 가능한 등록 지식자료가 없어 산술검산만 완료했습니다. 지식자료를 먼저 등록할 수 있습니다.";
    evidenceItems = applyEvidenceCandidates(targets, [], [], searchableDocuments, quotation.analysis);
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
