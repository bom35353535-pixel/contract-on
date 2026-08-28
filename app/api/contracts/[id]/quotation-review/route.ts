import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { knowledgeDocuments } from "@/db/schema";
import { isOpenAIConfigured } from "@/lib/knowledge";
import { findQuotationReviewCriteria, getVectorStoreId } from "@/lib/openai-knowledge";
import { applyEvidenceCandidates, buildArithmeticReview, buildEvidenceTargets, reviewCounts, type ReviewItem } from "@/lib/quotation-review";
import { getQuotationByContract } from "@/lib/quotations";

export const runtime = "edge";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id: contractId } = await context.params;
  const quotation = await getQuotationByContract(contractId);
  if (!quotation) return Response.json({ error: "확정된 견적정보가 없어 검토를 실행할 수 없습니다." }, { status: 404 });

  const arithmetic = buildArithmeticReview(quotation.analysis, quotation.items);
  const targets = buildEvidenceTargets(quotation.analysis, quotation.items);
  const readyDocuments = await getDb().select({
    id: knowledgeDocuments.id, documentName: knowledgeDocuments.documentName,
    originalName: knowledgeDocuments.originalName, openaiFileId: knowledgeDocuments.openaiFileId, year: knowledgeDocuments.year,
  }).from(knowledgeDocuments).where(eq(knowledgeDocuments.status, "READY"));

  let evidenceItems: ReviewItem[];
  let responseId: string | null = null;
  let warning: string | null = null;
  let rawCandidates: unknown[] = [];
  const vectorStoreId = readyDocuments.length && isOpenAIConfigured() ? await getVectorStoreId() : null;
  if (vectorStoreId) {
    try {
      const evidence = await findQuotationReviewCriteria(targets, vectorStoreId);
      rawCandidates = evidence.candidates;
      responseId = evidence.responseId;
      evidenceItems = applyEvidenceCandidates(targets, evidence.candidates, evidence.results, readyDocuments, quotation.analysis);
    } catch (error) {
      console.error("Quotation review evidence lookup failed", error);
      warning = "산술검산은 완료했지만 등록자료 근거검색에 실패했습니다. 잠시 후 다시 검토해 주세요.";
      evidenceItems = applyEvidenceCandidates(targets, [], [], readyDocuments, quotation.analysis);
    }
  } else {
    warning = "검색 가능한 등록 지식자료가 없어 산술검산만 완료했습니다.";
    evidenceItems = applyEvidenceCandidates(targets, [], [], readyDocuments, quotation.analysis);
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

  return Response.json({ reviewId, counts, warning }, { status: 201 });
}
