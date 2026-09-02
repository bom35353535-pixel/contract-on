import type { DocumentStage } from "./contract-document-review";

type DocumentNameRule = { canonicalName: string; stages: DocumentStage[]; aliases: string[] };
const ALL_STAGES: DocumentStage[] = ["NARA_CONTRACT", "PRE_CONSTRUCTION", "COMPLETION"];

export const SUBMITTED_DOCUMENT_RULES: DocumentNameRule[] = [
  { canonicalName: "견적서", stages: ["NARA_CONTRACT"], aliases: ["견적서", "비교견적서", "산출내역서", "견적내역서"] },
  { canonicalName: "사업자등록증", stages: ["NARA_CONTRACT"], aliases: ["사업자등록증", "사업자등록", "사업자사본", "사업자등록증사본"] },
  { canonicalName: "통장사본", stages: ["NARA_CONTRACT"], aliases: ["통장사본", "계좌사본", "통장", "계좌정보"] },
  { canonicalName: "청렴서약서", stages: ["NARA_CONTRACT"], aliases: ["청렴서약서", "청렴계약서약서", "청렴계약이행서약서", "청렴서약"] },
  { canonicalName: "계약보증 관련서류", stages: ["NARA_CONTRACT"], aliases: ["계약보증서", "계약보증보험", "계약보증금지급각서", "계약보증", "보증보험증권"] },
  { canonicalName: "공사계약서", stages: ["NARA_CONTRACT"], aliases: ["공사계약서", "계약서"] },
  { canonicalName: "사용인감계", stages: ["NARA_CONTRACT"], aliases: ["사용인감계", "사용인감"] },
  { canonicalName: "인감증명서", stages: ["NARA_CONTRACT"], aliases: ["인감증명서", "법인인감증명서", "인감증명"] },
  { canonicalName: "국세완납증명서", stages: ["NARA_CONTRACT"], aliases: ["국세완납증명서", "국세납세증명서", "국세완납", "국세증명"] },
  { canonicalName: "지방세완납증명서", stages: ["NARA_CONTRACT"], aliases: ["지방세완납증명서", "지방세납세증명서", "지방세완납", "지방세증명"] },
  { canonicalName: "4대보험 완납증명서", stages: ["NARA_CONTRACT"], aliases: ["4대보험완납증명서", "사회보험료완납증명서", "4대보험완납", "사회보험완납"] },
  { canonicalName: "착공계", stages: ["PRE_CONSTRUCTION"], aliases: ["착공계", "착공신고서", "착공계신고서"] },
  { canonicalName: "현장대리인계", stages: ["PRE_CONSTRUCTION"], aliases: ["현장대리인계", "현장대리인선임계", "현장대리인신고서", "현장대리인"] },
  { canonicalName: "공사공정예정표", stages: ["PRE_CONSTRUCTION"], aliases: ["공사공정예정표", "공정예정표", "예정공정표", "공사공정표"] },
  { canonicalName: "산재보험 가입증명서", stages: ["PRE_CONSTRUCTION"], aliases: ["산재보험가입증명서", "산재보험가입증명원", "산재보험성립신고", "산재보험"] },
  { canonicalName: "고용보험 가입증명서", stages: ["PRE_CONSTRUCTION"], aliases: ["고용보험가입증명서", "고용보험가입증명원", "고용보험성립신고", "고용보험"] },
  { canonicalName: "안전관리계획서", stages: ["PRE_CONSTRUCTION"], aliases: ["안전관리계획서", "안전관리계획", "안전계획서"] },
  { canonicalName: "준공계", stages: ["COMPLETION"], aliases: ["준공계", "준공신고서"] },
  { canonicalName: "준공검사원", stages: ["COMPLETION"], aliases: ["준공검사원", "준공검사신청서", "검사원"] },
  { canonicalName: "준공사진대지", stages: ["COMPLETION"], aliases: ["준공사진대지", "준공사진", "공사사진대지", "공사사진"] },
  { canonicalName: "하자보수보증서", stages: ["COMPLETION"], aliases: ["하자보수보증서", "하자보증서", "하자보수보증보험", "하자보증"] },
  { canonicalName: "세금계산서", stages: ["COMPLETION"], aliases: ["세금계산서", "전자세금계산서"] },
  { canonicalName: "기타 제출서류", stages: ALL_STAGES, aliases: [] },
];

export type SubmittedDocumentClassification = {
  detectedType: string | null;
  detectionStatus: "EXACT" | "UNCERTAIN";
  summary: string;
  source: "USER_CONFIRMED" | "FILE_NAME" | "UNRESOLVED";
};

export function submittedDocumentTypeOptions(stage: DocumentStage) {
  return SUBMITTED_DOCUMENT_RULES.filter((rule) => rule.stages.includes(stage)).map((rule) => rule.canonicalName);
}

function normalizeName(value: string) {
  return value.toLocaleLowerCase("ko-KR")
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/(?:copy|final|scan|document|img|복사본|스캔본|최종본|제출용)/gi, "")
    .replace(/\d{4}[._-]?\d{1,2}[._-]?\d{1,2}/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

export function classifySubmittedDocumentName(fileName: string, stage: DocumentStage, userSelectedType?: string | null): SubmittedDocumentClassification {
  const options = submittedDocumentTypeOptions(stage);
  const selected = typeof userSelectedType === "string" ? userSelectedType.trim() : "";
  if (selected && options.includes(selected)) return {
    detectedType: selected, detectionStatus: "EXACT", summary: "담당자가 업로드 전에 문서 종류를 직접 확인했습니다.", source: "USER_CONFIRMED",
  };

  const normalized = normalizeName(fileName);
  const matches = normalized ? SUBMITTED_DOCUMENT_RULES.filter((rule) => rule.stages.includes(stage) && rule.aliases.some((alias) => {
    const candidate = normalizeName(alias);
    return candidate.length >= 2 && normalized.includes(candidate);
  })) : [];
  const unique = [...new Map(matches.map((rule) => [rule.canonicalName, rule])).values()];
  if (unique.length === 1) return {
    detectedType: unique[0].canonicalName, detectionStatus: "EXACT", summary: "파일명과 등록된 문서명 별칭이 일치했습니다.", source: "FILE_NAME",
  };
  return {
    detectedType: null,
    detectionStatus: "UNCERTAIN",
    summary: unique.length > 1 ? "파일명이 여러 문서종류와 일치합니다. 담당자가 문서 종류를 선택해 주세요." : "파일명으로 문서 종류를 확인할 수 없습니다. 담당자 확인이 필요합니다.",
    source: "UNRESOLVED",
  };
}
