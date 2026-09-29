import { and, desc, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { contracts, contractDocumentFiles, contractDocumentReviewItems, contractDocumentReviews } from "@/db/schema";
import { applyCompletionDocumentApplicability, documentReviewCounts, type DocumentChecklistItem, type DocumentStage } from "./contract-document-review";

export async function getPhase6DocumentWorkspace(contractId: string, documentStage: DocumentStage) {
  await ensureDatabase();
  const db = getDb();
  const [files, reviews] = await Promise.all([
    db.select().from(contractDocumentFiles)
      .where(and(eq(contractDocumentFiles.contractId, contractId), eq(contractDocumentFiles.documentStage, documentStage)))
      .orderBy(desc(contractDocumentFiles.uploadedAt)),
    db.select().from(contractDocumentReviews)
      .where(and(eq(contractDocumentReviews.contractId, contractId), eq(contractDocumentReviews.documentStage, documentStage)))
      .orderBy(desc(contractDocumentReviews.createdAt)).limit(1),
  ]);
  const review = reviews[0] || null;
  let items = review
    ? await db.select().from(contractDocumentReviewItems)
      .where(eq(contractDocumentReviewItems.reviewId, review.id))
      .orderBy(contractDocumentReviewItems.status, contractDocumentReviewItems.requiredName)
    : [];
  let adjustedReview = review;
  if (documentStage === "COMPLETION" && review && items.length) {
    const [contract] = await db.select({ contractAmount: contracts.contractAmount }).from(contracts).where(eq(contracts.id, contractId)).limit(1);
    const result = await getD1().prepare(`
      SELECT COALESCE(qi.item_name, '') AS itemName, COALESCE(qi.category, '') AS category, COALESCE(qi.amount, 0) AS amount
      FROM quotation_items qi
      WHERE qi.analysis_id = (
        SELECT id FROM quotation_analyses
        WHERE contract_id = ?
        ORDER BY confirmed_at DESC, created_at DESC
        LIMIT 1
      )
    `).bind(contractId).all<{ itemName: string; category: string; amount: number }>();
    let wasteDisposalCost = 0;
    let environmentalPreservationCost = 0;
    for (const row of result.results || []) {
      const name = `${row.category || ""} ${row.itemName || ""}`.replace(/\s+/g, "");
      const amount = Number(row.amount) || 0;
      if (name.includes("폐기물처리")) wasteDisposalCost += amount;
      if (name.includes("환경보전")) environmentalPreservationCost += amount;
    }
    items = applyCompletionDocumentApplicability(items as unknown as DocumentChecklistItem[], {
      constructionAmount: contract?.contractAmount || 0,
      wasteDisposalCost,
      environmentalPreservationCost,
    }) as typeof items;
    const counts = documentReviewCounts(items as unknown as DocumentChecklistItem[]);
    adjustedReview = { ...review, ...counts };
  }
  return { files, review: adjustedReview, items };
}
