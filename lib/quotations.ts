import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { quotationAnalyses, quotationItems, quotationReviewItems, quotationReviews } from "@/db/schema";

export async function getQuotationAnalysis(id: string) {
  await ensureDatabase();
  const db = getDb();
  const [analysis] = await db.select().from(quotationAnalyses).where(eq(quotationAnalyses.id, id)).limit(1);
  if (!analysis) return null;
  const items = await db.select().from(quotationItems).where(eq(quotationItems.analysisId, id)).orderBy(quotationItems.id);
  return { analysis, items };
}

export async function getQuotationByContract(contractId: string) {
  await ensureDatabase();
  const db = getDb();
  const [analysis] = await db.select().from(quotationAnalyses).where(and(eq(quotationAnalyses.contractId, contractId), eq(quotationAnalyses.status, "CONFIRMED"))).limit(1);
  if (!analysis) return null;
  const items = await db.select().from(quotationItems).where(eq(quotationItems.analysisId, analysis.id)).orderBy(quotationItems.id);
  return { analysis, items };
}

export async function getLatestQuotationReview(contractId: string) {
  await ensureDatabase();
  const db = getDb();
  const [review] = await db.select().from(quotationReviews).where(eq(quotationReviews.contractId, contractId)).orderBy(desc(quotationReviews.createdAt)).limit(1);
  if (!review) return null;
  const items = await db.select().from(quotationReviewItems).where(eq(quotationReviewItems.reviewId, review.id)).orderBy(quotationReviewItems.section, quotationReviewItems.label);
  return { review, items };
}

export async function getLatestQuotationReviewByAnalysis(analysisId: string) {
  await ensureDatabase();
  const db = getDb();
  const [review] = await db.select().from(quotationReviews).where(eq(quotationReviews.analysisId, analysisId)).orderBy(desc(quotationReviews.createdAt)).limit(1);
  if (!review) return null;
  const items = await db.select().from(quotationReviewItems).where(eq(quotationReviewItems.reviewId, review.id)).orderBy(quotationReviewItems.section, quotationReviewItems.label);
  return { review, items };
}
