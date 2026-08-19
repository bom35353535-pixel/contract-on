import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { quotationAnalyses, quotationItems } from "@/db/schema";

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
