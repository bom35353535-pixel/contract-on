import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { contractDocumentFiles, contractDocumentReviewItems, contractDocumentReviews } from "@/db/schema";
import type { DocumentStage } from "./contract-document-review";

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
  const items = review
    ? await db.select().from(contractDocumentReviewItems)
      .where(eq(contractDocumentReviewItems.reviewId, review.id))
      .orderBy(contractDocumentReviewItems.status, contractDocumentReviewItems.requiredName)
    : [];
  return { files, review, items };
}
