export type DocumentStage = "NARA_CONTRACT" | "PRE_CONSTRUCTION";
export type DocumentReviewStatus = "SUBMITTED" | "MISSING" | "CHECK";

export type RequiredDocumentCriterion = {
  requiredName: string;
  aliases: string[];
  evidenceDocumentId: string;
  evidenceDocumentName: string;
  evidenceYear: number | null;
  evidenceLocation: string | null;
  evidenceExcerpt: string;
};

export type RequiredDocumentCandidate = {
  requiredName: string;
  aliases: string[];
  sourceFileId: string | null;
  sourceFilename: string | null;
  sourceLocation: string | null;
  sourceExcerpt: string | null;
  matchStatus: "EXACT" | "UNCERTAIN";
};

export type DocumentEvidenceSearchResult = { fileId: string; filename: string; text: string };
export type ReadyKnowledgeDocument = { id: string; documentName: string; originalName: string; openaiFileId: string | null; year: number | null };

export type ClassifiedDocument = {
  id: string;
  originalName: string;
  detectedType: string | null;
  detectionStatus: "EXACT" | "UNCERTAIN";
  summary: string | null;
};

export type DocumentChecklistItem = {
  status: DocumentReviewStatus;
  requiredName: string;
  uploadedFileId: string | null;
  detail: string;
  evidenceDocumentId: string | null;
  evidenceDocumentName: string | null;
  evidenceYear: number | null;
  evidenceLocation: string | null;
  evidenceExcerpt: string | null;
};

function normalize(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\.[a-z0-9]{1,6}$/i, "").replace(/[^0-9a-z가-힣]/g, "");
}

function namesMatch(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a));
}

export function verifyRequiredDocumentCriteria(
  candidates: RequiredDocumentCandidate[], results: DocumentEvidenceSearchResult[], documents: ReadyKnowledgeDocument[],
) {
  const documentsByFile = new Map(documents.filter((document) => document.openaiFileId).map((document) => [document.openaiFileId!, document]));
  const verified = new Map<string, RequiredDocumentCriterion>();
  for (const candidate of candidates) {
    if (candidate.matchStatus !== "EXACT" || !candidate.requiredName.trim()) continue;
    const result = results.find((item) => (candidate.sourceFileId && item.fileId === candidate.sourceFileId) || (candidate.sourceFilename && item.filename === candidate.sourceFilename));
    if (!result) continue;
    const document = documentsByFile.get(result.fileId);
    if (!document || !namesMatch(candidate.requiredName, result.text)) continue;
    const aliases = candidate.aliases.filter((alias) => alias.trim() && namesMatch(alias, result.text));
    const key = normalize(candidate.requiredName);
    if (!key || verified.has(key)) continue;
    verified.set(key, {
      requiredName: candidate.requiredName.trim(),
      aliases,
      evidenceDocumentId: document.id,
      evidenceDocumentName: document.documentName,
      evidenceYear: document.year,
      evidenceLocation: candidate.sourceLocation,
      evidenceExcerpt: result.text.slice(0, 350),
    });
  }
  return [...verified.values()];
}

export function buildDocumentChecklist(criteria: RequiredDocumentCriterion[], files: ClassifiedDocument[]): DocumentChecklistItem[] {
  if (criteria.length === 0) {
    return files.map((file) => ({
      status: "CHECK",
      requiredName: file.detectedType || file.originalName,
      uploadedFileId: file.id,
      detail: "등록된 지식자료에서 제출 기준을 확인할 수 없어 담당자 확인이 필요합니다.",
      evidenceDocumentId: null,
      evidenceDocumentName: null,
      evidenceYear: null,
      evidenceLocation: null,
      evidenceExcerpt: null,
    }));
  }

  const usedFiles = new Set<string>();
  const items = criteria.map<DocumentChecklistItem>((criterion) => {
    const names = [criterion.requiredName, ...criterion.aliases];
    const matches = files.filter((file) => !usedFiles.has(file.id) && names.some((name) => namesMatch(name, file.detectedType || "") || namesMatch(name, file.originalName)));
    const exact = matches.find((file) => file.detectionStatus === "EXACT");
    const matched = exact || matches[0];
    if (!matched) return {
      status: "MISSING",
      requiredName: criterion.requiredName,
      uploadedFileId: null,
      detail: "등록자료의 제출 기준과 일치하는 업로드 문서를 찾지 못했습니다.",
      evidenceDocumentId: criterion.evidenceDocumentId,
      evidenceDocumentName: criterion.evidenceDocumentName,
      evidenceYear: criterion.evidenceYear,
      evidenceLocation: criterion.evidenceLocation,
      evidenceExcerpt: criterion.evidenceExcerpt,
    };
    usedFiles.add(matched.id);
    return {
      status: matched.detectionStatus === "EXACT" ? "SUBMITTED" : "CHECK",
      requiredName: criterion.requiredName,
      uploadedFileId: matched.id,
      detail: matched.detectionStatus === "EXACT"
        ? `${matched.originalName}에서 해당 서류를 확인했습니다.`
        : `${matched.originalName}의 서류 종류가 불명확하여 담당자 확인이 필요합니다.`,
      evidenceDocumentId: criterion.evidenceDocumentId,
      evidenceDocumentName: criterion.evidenceDocumentName,
      evidenceYear: criterion.evidenceYear,
      evidenceLocation: criterion.evidenceLocation,
      evidenceExcerpt: criterion.evidenceExcerpt,
    };
  });

  for (const file of files) {
    if (usedFiles.has(file.id)) continue;
    items.push({
      status: "CHECK",
      requiredName: file.detectedType || file.originalName,
      uploadedFileId: file.id,
      detail: "업로드된 문서이지만 등록자료의 제출 기준과 정확히 연결되지 않았습니다.",
      evidenceDocumentId: null,
      evidenceDocumentName: null,
      evidenceYear: null,
      evidenceLocation: null,
      evidenceExcerpt: null,
    });
  }
  return items;
}

export function documentReviewCounts(items: DocumentChecklistItem[]) {
  return {
    submittedCount: items.filter((item) => item.status === "SUBMITTED").length,
    missingCount: items.filter((item) => item.status === "MISSING").length,
    checkCount: items.filter((item) => item.status === "CHECK").length,
  };
}
