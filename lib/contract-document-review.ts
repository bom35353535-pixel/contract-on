export type DocumentStage = "NARA_CONTRACT" | "PRE_CONSTRUCTION" | "COMPLETION";
export type DocumentReviewStatus = "SUBMITTED" | "MISSING" | "CHECK" | "NOT_APPLICABLE";

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
  detectedType?: string | null;
  detectedTypes?: string[];
  detectionStatus: "EXACT" | "UNCERTAIN";
  summary: string | null;
};

function fileTypes(file: ClassifiedDocument) {
  return file.detectedTypes?.length ? file.detectedTypes : file.detectedType ? [file.detectedType] : [];
}

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

const DOCUMENT_NAME_EQUIVALENTS = [
  ["착공계", "착공신고서", "착공계신고서"],
  ["공사공정예정표", "공정예정표", "예정공정표", "공사공정표"],
  ["현장기술자지정신고서", "현장대리인계", "현장대리인선임계", "현장대리인신고서"],
] as const;

function canonicalDocumentName(value: string) {
  const normalized = normalize(value);
  for (const names of DOCUMENT_NAME_EQUIVALENTS) {
    if (names.some((name) => {
      const alias = normalize(name);
      return normalized === alias || (Math.min(normalized.length, alias.length) >= 3 && (normalized.includes(alias) || alias.includes(normalized)));
    })) return normalize(names[0]);
  }
  return normalized;
}

function namesMatch(left: string, right: string) {
  const a = canonicalDocumentName(left);
  const b = canonicalDocumentName(right);
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
    return files.flatMap((file) => {
      const types = fileTypes(file);
      if (!types.length) return [{
        status: "CHECK" as const,
        requiredName: file.originalName,
        uploadedFileId: file.id,
        detail: "파일 전체를 확인했지만 문서 종류를 확정하지 못해 담당자 확인이 필요합니다.",
        evidenceDocumentId: null, evidenceDocumentName: null, evidenceYear: null, evidenceLocation: null, evidenceExcerpt: null,
      }];
      return types.map((type) => ({
        status: file.detectionStatus === "EXACT" ? "SUBMITTED" as const : "CHECK" as const,
        requiredName: type,
        uploadedFileId: file.id,
        detail: file.detectionStatus === "EXACT"
          ? `${file.originalName} 전체에서 ${type} 서류를 확인했습니다. 필수 제출서류 목록의 근거는 등록자료에서 별도로 확인되지 않았습니다.`
          : `${file.originalName}에서 ${type} 가능성이 있으나 담당자 확인이 필요합니다.`,
        evidenceDocumentId: null, evidenceDocumentName: null, evidenceYear: null, evidenceLocation: null, evidenceExcerpt: null,
      }));
    });
  }

  const usedFiles = new Set<string>();
  const items = criteria.map<DocumentChecklistItem>((criterion) => {
    const names = [criterion.requiredName, ...criterion.aliases];
    const matches = files.filter((file) => names.some((name) => fileTypes(file).some((type) => namesMatch(name, type)) || namesMatch(name, file.originalName)));
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
      requiredName: fileTypes(file).join(", ") || file.originalName,
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

export function applyCompletionDocumentApplicability(
  items: DocumentChecklistItem[],
  context: { constructionAmount: number; wasteDisposalCost: number; environmentalPreservationCost: number },
) {
  return items.map((item): DocumentChecklistItem => {
    if (item.status === "SUBMITTED") return item;
    const name = normalize(item.requiredName);
    if (name.includes("폐기물처리") && context.wasteDisposalCost <= 0) {
      return { ...item, status: "NOT_APPLICABLE", uploadedFileId: null, detail: "견적서의 폐기물 처리비가 0원 또는 미기재이므로 해당없음입니다." };
    }
    if (name.includes("환경보전") && context.environmentalPreservationCost <= 0) {
      return { ...item, status: "NOT_APPLICABLE", uploadedFileId: null, detail: "견적서의 환경보전비가 0원 또는 미기재이므로 해당없음입니다." };
    }
    if (name.includes("퇴직공제") && context.constructionAmount < 100_000_000) {
      return { ...item, status: "NOT_APPLICABLE", uploadedFileId: null, detail: "공사금액이 1억원 미만이므로 건설근로자 퇴직공제부금 납부확인서는 해당없음입니다." };
    }
    return item;
  });
}
