import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { administrativeDocuments } from "@/db/schema";

export type AdministrativeDocumentType = "CONSTRUCTION_PLAN" | "PURCHASE_REQUEST" | "INTERNAL_APPROVAL";

export async function getAdministrativeDocuments(contractId: string) {
  await ensureDatabase();
  return getDb().select().from(administrativeDocuments)
    .where(eq(administrativeDocuments.contractId, contractId))
    .orderBy(asc(administrativeDocuments.documentType));
}
