import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { constructionChecklistItems, constructionChecklistRuns } from "@/db/schema";
import type { DocumentEvidenceSearchResult, ReadyKnowledgeDocument } from "./contract-document-review";
import { parseFieldChecklistDetail } from "./construction-field-checklist";

export type ConstructionChecklistCandidate = {
  title: string;
  detail: string;
  sourceFileId: string | null;
  sourceFilename: string | null;
  sourceLocation: string | null;
  sourceExcerpt: string | null;
  matchStatus: "EXACT" | "UNCERTAIN";
};

export type VerifiedConstructionCheck = {
  title: string;
  detail: string;
  evidenceDocumentId: string;
  evidenceDocumentName: string;
  evidenceYear: number | null;
  evidenceLocation: string | null;
  evidenceExcerpt: string;
};

function normalize(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/g, "");
}

export function verifyConstructionChecklist(
  candidates: ConstructionChecklistCandidate[],
  results: DocumentEvidenceSearchResult[],
  documents: ReadyKnowledgeDocument[],
) {
  const documentsByFile = new Map(documents.filter((document) => document.openaiFileId).map((document) => [document.openaiFileId!, document]));
  const verified = new Map<string, VerifiedConstructionCheck>();
  for (const candidate of candidates) {
    if (candidate.matchStatus !== "EXACT" || !candidate.title.trim()) continue;
    const result = results.find((item) => (candidate.sourceFileId && item.fileId === candidate.sourceFileId) || (candidate.sourceFilename && item.filename === candidate.sourceFilename));
    if (!result) continue;
    const document = documentsByFile.get(result.fileId);
    const key = normalize(candidate.title);
    if (!document || !key || verified.has(key) || !normalize(result.text).includes(key)) continue;
    verified.set(key, {
      title: candidate.title.trim(),
      detail: candidate.detail.trim() || "등록자료의 확인사항을 담당자가 점검합니다.",
      evidenceDocumentId: document.id,
      evidenceDocumentName: document.documentName,
      evidenceYear: document.year,
      evidenceLocation: candidate.sourceLocation,
      evidenceExcerpt: result.text.slice(0, 350),
    });
  }
  return [...verified.values()];
}

export async function getConstructionChecklist(contractId: string) {
  await ensureDatabase();
  const db = getDb();
  const runs = await db.select().from(constructionChecklistRuns)
    .where(eq(constructionChecklistRuns.contractId, contractId))
    .orderBy(desc(constructionChecklistRuns.createdAt)).limit(20);
  if (!runs.length) return { run: null, items: [], history: [] };
  const allItems = await db.select().from(constructionChecklistItems)
    .where(eq(constructionChecklistItems.contractId, contractId));
  const byRun = new Map<string, typeof allItems>();
  for (const item of allItems) byRun.set(item.runId, [...(byRun.get(item.runId) || []), item]);
  for (const items of byRun.values()) items.sort((a, b) => parseFieldChecklistDetail(a.detail).order - parseFieldChecklistDetail(b.detail).order);
  const [run, ...pastRuns] = runs;
  return {
    run,
    items: byRun.get(run.id) || [],
    history: pastRuns.map((pastRun) => ({ run: pastRun, items: byRun.get(pastRun.id) || [] })),
  };
}
