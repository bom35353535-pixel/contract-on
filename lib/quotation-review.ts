export type ReviewStatus = "NORMAL" | "CHECK" | "ERROR" | "NO_BASIS";
export type ReviewSection = "ARITHMETIC" | "LABOR" | "MATERIAL" | "STATUTORY";

export type ReviewItem = {
  id?: string;
  section: ReviewSection;
  targetKey: string;
  label: string;
  status: ReviewStatus;
  quotedValue: number | null;
  expectedValue: number | null;
  difference: number | null;
  differenceRate: number | null;
  calculation: string | null;
  detail: string;
  evidenceDocumentId: string | null;
  evidenceDocumentName: string | null;
  evidenceYear: number | null;
  evidenceLocation: string | null;
  evidenceExcerpt: string | null;
};

export type ReviewTarget = {
  section: Exclude<ReviewSection, "ARITHMETIC">;
  targetKey: string;
  label: string;
  quotedValue: number | null;
  comparisonKind: "UNIT_PRICE" | "RATE";
  context: string;
};

export type EvidenceCandidate = {
  targetKey: string;
  expectedValue: number | null;
  ratePercent: number | null;
  baseKey: "SUPPLY_AMOUNT" | "MATERIAL_COST" | "DIRECT_LABOR_COST" | "LABOR_COST" | "MATERIAL_PLUS_DIRECT_LABOR" | "UNKNOWN";
  matchStatus: "EXACT" | "UNCERTAIN";
  sourceFileId: string | null;
  sourceFilename: string | null;
  sourceLocation: string | null;
  sourceExcerpt: string | null;
  note: string | null;
};

export type EvidenceSearchResult = { fileId: string; filename: string; text: string };
export type ReadyEvidenceDocument = { id: string; documentName: string; originalName: string; openaiFileId: string | null; year: number | null };

type AnalysisAmounts = {
  totalAmount: number | null; supplyAmount: number | null; vatAmount: number | null;
  materialCost: number | null; directLaborCost: number | null; indirectLaborCost: number | null;
  expenses: number | null; statutoryExpenses: number | null; overhead: number | null;
  profit: number | null; safetyHealthCost: number | null;
};

type QuotationRow = {
  id: number; category: string | null; trade: string | null; itemName: string | null;
  specification: string | null; unit: string | null; quantity: number | null;
  unitPrice: number | null; amount: number | null;
};

const emptyEvidence = { evidenceDocumentId: null, evidenceDocumentName: null, evidenceYear: null, evidenceLocation: null, evidenceExcerpt: null };

function differenceValues(quoted: number | null, expected: number | null) {
  if (quoted === null || expected === null) return { difference: null, differenceRate: null };
  const difference = quoted - expected;
  const differenceRate = expected === 0 ? null : Math.round((difference / expected) * 1000) / 10;
  return { difference, differenceRate };
}

export function buildArithmeticReview(analysis: AnalysisAmounts, rows: QuotationRow[]): ReviewItem[] {
  const results: ReviewItem[] = [];
  for (const row of rows) {
    const label = row.itemName || row.trade || `세부항목 ${row.id}`;
    if (row.quantity !== null && row.unitPrice !== null && row.amount !== null) {
      const expected = Math.round(row.quantity * row.unitPrice);
      const values = differenceValues(row.amount, expected);
      results.push({
        section: "ARITHMETIC", targetKey: `line:${row.id}`, label: `${label} 수량×단가`,
        status: row.amount === expected ? "NORMAL" : "ERROR", quotedValue: row.amount, expectedValue: expected,
        ...values, calculation: `${row.quantity} × ${row.unitPrice} = ${expected}`,
        detail: row.amount === expected ? "견적서의 수량×단가와 금액이 일치합니다." : "견적서 금액과 코드 재계산 결과가 다릅니다.", ...emptyEvidence,
      });
    } else if (row.amount !== null && (row.quantity !== null || row.unitPrice !== null)) {
      results.push({
        section: "ARITHMETIC", targetKey: `line:${row.id}`, label: `${label} 수량×단가`, status: "CHECK",
        quotedValue: row.amount, expectedValue: null, difference: null, differenceRate: null, calculation: null,
        detail: "수량 또는 단가가 없어 코드로 재계산할 수 없습니다.", ...emptyEvidence,
      });
    }
  }

  if (analysis.supplyAmount !== null && analysis.vatAmount !== null && analysis.totalAmount !== null) {
    const expected = analysis.supplyAmount + analysis.vatAmount;
    const values = differenceValues(analysis.totalAmount, expected);
    results.push({
      section: "ARITHMETIC", targetKey: "total:supply_plus_vat", label: "공급가액 + 부가가치세",
      status: analysis.totalAmount === expected ? "NORMAL" : "ERROR", quotedValue: analysis.totalAmount, expectedValue: expected,
      ...values, calculation: `${analysis.supplyAmount} + ${analysis.vatAmount} = ${expected}`,
      detail: analysis.totalAmount === expected ? "공급가액과 부가가치세의 합이 총액과 일치합니다." : "공급가액과 부가가치세의 합이 총액과 다릅니다.", ...emptyEvidence,
    });
  } else {
    results.push({
      section: "ARITHMETIC", targetKey: "total:supply_plus_vat", label: "공급가액 + 부가가치세", status: "CHECK",
      quotedValue: analysis.totalAmount, expectedValue: null, difference: null, differenceRate: null, calculation: null,
      detail: "총액·공급가액·부가가치세 중 일부가 없어 합계를 검산할 수 없습니다.", ...emptyEvidence,
    });
  }
  return results;
}

const statutoryCues = ["산업안전", "간접노무", "기타경비", "건강보험", "국민연금", "장기요양", "고용보험", "산재보험", "퇴직공제", "일반관리비", "이윤", "법정경비"];

export function buildEvidenceTargets(analysis: AnalysisAmounts, rows: QuotationRow[]): ReviewTarget[] {
  const targets: ReviewTarget[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const combined = `${row.category || ""} ${row.trade || ""} ${row.itemName || ""}`.trim();
    const classification = `${row.category || ""} ${row.trade || ""}`;
    const quoted = row.unitPrice ?? row.amount;
    if (statutoryCues.some((cue) => combined.includes(cue))) {
      const cue = statutoryCues.find((value) => combined.includes(value)) || row.itemName || "제비율";
      const key = `rate:${cue}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ section: "STATUTORY", targetKey: key, label: cue, quotedValue: row.amount, comparisonKind: "RATE", context: combined });
      }
      continue;
    }
    if ((classification.includes("노무") || classification.includes("직종")) && quoted !== null) {
      const key = `labor:${row.id}`; seen.add(key);
      targets.push({ section: "LABOR", targetKey: key, label: row.itemName || row.trade || "노무비 항목", quotedValue: quoted, comparisonKind: "UNIT_PRICE", context: combined });
      continue;
    }
    if ((classification.includes("재료") || classification.includes("자재")) && quoted !== null) {
      const key = `material:${row.id}`; seen.add(key);
      targets.push({ section: "MATERIAL", targetKey: key, label: `${row.itemName || "자재"}${row.specification ? ` ${row.specification}` : ""}`, quotedValue: quoted, comparisonKind: "UNIT_PRICE", context: combined });
      continue;
    }
  }

  const topLevel: Array<[string, string, number | null]> = [
    ["산업안전보건관리비", "산업안전보건관리비", analysis.safetyHealthCost],
    ["간접노무비", "간접노무비", analysis.indirectLaborCost], ["기타경비", "기타경비", analysis.expenses],
    ["법정경비", "법정경비", analysis.statutoryExpenses], ["일반관리비", "일반관리비", analysis.overhead], ["이윤", "이윤", analysis.profit],
  ];
  for (const [keyName, label, quotedValue] of topLevel) {
    const key = `rate:${keyName}`;
    if (!seen.has(key)) targets.push({ section: "STATUTORY", targetKey: key, label, quotedValue, comparisonKind: "RATE", context: label });
  }
  return targets;
}

function baseAmount(baseKey: EvidenceCandidate["baseKey"], analysis: AnalysisAmounts) {
  if (baseKey === "SUPPLY_AMOUNT") return analysis.supplyAmount;
  if (baseKey === "MATERIAL_COST") return analysis.materialCost;
  if (baseKey === "DIRECT_LABOR_COST") return analysis.directLaborCost;
  if (baseKey === "LABOR_COST") {
    if (analysis.directLaborCost === null && analysis.indirectLaborCost === null) return null;
    return (analysis.directLaborCost || 0) + (analysis.indirectLaborCost || 0);
  }
  if (baseKey === "MATERIAL_PLUS_DIRECT_LABOR") {
    if (analysis.materialCost === null || analysis.directLaborCost === null) return null;
    return analysis.materialCost + analysis.directLaborCost;
  }
  return null;
}

function numberAppears(text: string, value: number) {
  const values = [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) => Number(match[0].replace(/,/g, ""))).filter(Number.isFinite);
  return values.some((candidate) => Math.abs(candidate - value) < 0.0001);
}

export function applyEvidenceCandidates(
  targets: ReviewTarget[], candidates: EvidenceCandidate[], searchResults: EvidenceSearchResult[], documents: ReadyEvidenceDocument[], analysis: AnalysisAmounts,
) {
  const targetKeys = new Set(targets.map((target) => target.targetKey));
  const documentsByFile = new Map(documents.filter((document) => document.openaiFileId).map((document) => [document.openaiFileId!, document]));
  const verified = new Map<string, { candidate: EvidenceCandidate; result: EvidenceSearchResult; document: ReadyEvidenceDocument }>();
  for (const candidate of candidates) {
    if (!targetKeys.has(candidate.targetKey)) continue;
    const result = searchResults.find((item) => (candidate.sourceFileId && item.fileId === candidate.sourceFileId) || (candidate.sourceFilename && item.filename === candidate.sourceFilename));
    if (!result) continue;
    const document = documentsByFile.get(result.fileId);
    if (!document) continue;
    const evidenceNumber = candidate.expectedValue ?? candidate.ratePercent;
    if (evidenceNumber === null || !numberAppears(result.text, evidenceNumber)) continue;
    verified.set(candidate.targetKey, { candidate, result, document });
  }

  return targets.map<ReviewItem>((target) => {
    const evidence = verified.get(target.targetKey);
    if (!evidence) return {
      section: target.section, targetKey: target.targetKey, label: target.label, status: "NO_BASIS", quotedValue: target.quotedValue,
      expectedValue: null, difference: null, differenceRate: null, calculation: null,
      detail: target.section === "MATERIAL" ? "등록된 가격자료에서 해당 자재의 비교가격을 확인할 수 없습니다." : "등록된 지식자료에서 해당 기준을 확인할 수 없습니다.", ...emptyEvidence,
    };

    const { candidate, result, document } = evidence;
    const base = candidate.ratePercent === null ? null : baseAmount(candidate.baseKey, analysis);
    const expected = candidate.expectedValue ?? (base === null || candidate.ratePercent === null ? null : Math.round(base * candidate.ratePercent / 100));
    const values = differenceValues(target.quotedValue, expected);
    let status: ReviewStatus = "CHECK";
    if (target.quotedValue !== null && expected !== null && target.quotedValue === expected && candidate.matchStatus === "EXACT") status = "NORMAL";
    const calculation = candidate.ratePercent !== null && base !== null ? `${base} × ${candidate.ratePercent}% = ${expected}` : null;
    return {
      section: target.section, targetKey: target.targetKey, label: target.label, status,
      quotedValue: target.quotedValue, expectedValue: expected, ...values, calculation,
      detail: expected === null ? "근거자료는 찾았지만 적용 기준금액을 확정할 수 없어 담당자 확인이 필요합니다." : status === "NORMAL" ? "견적값이 등록 근거자료의 기준값과 일치합니다." : candidate.note || "견적값과 등록 근거자료의 기준값이 달라 담당자 확인이 필요합니다.",
      evidenceDocumentId: document.id, evidenceDocumentName: document.documentName, evidenceYear: document.year,
      evidenceLocation: candidate.sourceLocation, evidenceExcerpt: candidate.sourceExcerpt || result.text.slice(0, 300),
    };
  });
}

export function reviewCounts(items: ReviewItem[]) {
  return {
    normalCount: items.filter((item) => item.status === "NORMAL").length,
    checkCount: items.filter((item) => item.status === "CHECK").length,
    errorCount: items.filter((item) => item.status === "ERROR").length,
    noBasisCount: items.filter((item) => item.status === "NO_BASIS").length,
  };
}
