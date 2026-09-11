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
  baseKey: "SUPPLY_AMOUNT" | "MATERIAL_COST" | "DIRECT_LABOR_COST" | "LABOR_COST" | "MATERIAL_PLUS_DIRECT_LABOR" | "MATERIAL_PLUS_LABOR" | "MATERIAL_PLUS_LABOR_PLUS_EXPENSES" | "LABOR_PLUS_EXPENSES_PLUS_OVERHEAD" | "UNKNOWN";
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

const statutoryCues = [
  ["산업안전", "산업안전보건관리비"], ["간접노무", "간접노무비"], ["기타경비", "기타경비"],
  ["건강보험", "국민건강보험료"], ["국민연금", "국민연금보험료"], ["장기요양", "노인장기요양보험료"],
  ["고용보험", "고용보험료"], ["산재보험", "산재보험료"], ["퇴직공제", "퇴직공제부금비"],
  ["일반관리비", "일반관리비"], ["이윤", "이윤"],
] as const;

const expenseItemCues = ["기타경비", "산재보험", "고용보험", "건강보험", "국민연금", "장기요양", "산업안전", "퇴직공제", "환경보전", "임금채권", "석면분담"];

export function deriveExpenseAmount(rows: Array<Pick<QuotationRow, "category" | "trade" | "itemName" | "amount">>) {
  const summary = rows.find((row) => {
    const name = normalizedEvidenceLabel(row.itemName || "");
    return row.amount !== null && (["경비", "경비계", "경비합계"].includes(name) || /^[가-힣]경비$/.test(name));
  });
  if (summary?.amount !== null && summary?.amount !== undefined) return summary.amount;
  const details = rows.filter((row) => {
    const text = `${row.category || ""} ${row.trade || ""} ${row.itemName || ""}`;
    return row.amount !== null && expenseItemCues.some((cue) => text.includes(cue));
  });
  return details.length ? details.reduce((sum, row) => sum + (row.amount || 0), 0) : null;
}

export function buildEvidenceTargets(analysis: AnalysisAmounts, rows: QuotationRow[]): ReviewTarget[] {
  const targets: ReviewTarget[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const combined = `${row.category || ""} ${row.trade || ""} ${row.itemName || ""}`.trim();
    const classification = `${row.category || ""} ${row.trade || ""}`;
    const statutoryCue = statutoryCues.find(([cue]) => combined.includes(cue));
    if (statutoryCue) {
      const label = statutoryCue[1];
      const key = `rate:${label}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ section: "STATUTORY", targetKey: key, label, quotedValue: row.amount, comparisonKind: "RATE", context: combined });
      }
      continue;
    }
    if ((classification.includes("노무") || classification.includes("직종")) && row.unitPrice !== null) {
      const laborLabel = [row.itemName, row.trade].find((value) => value && !["노무비", "직종", "인건비"].includes(normalizedEvidenceLabel(value))) || row.itemName || row.trade || "노무비 항목";
      const key = `labor:${row.id}`; seen.add(key);
      targets.push({ section: "LABOR", targetKey: key, label: laborLabel, quotedValue: row.unitPrice, comparisonKind: "UNIT_PRICE", context: laborLabel });
      continue;
    }
  }

  const topLevel: Array<[string, string, number | null]> = [
    ["산업안전보건관리비", "산업안전보건관리비", analysis.safetyHealthCost],
    ["간접노무비", "간접노무비", analysis.indirectLaborCost], ["기타경비", "기타경비", analysis.expenses],
    ["일반관리비", "일반관리비", analysis.overhead], ["이윤", "이윤", analysis.profit],
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
  if (baseKey === "MATERIAL_PLUS_LABOR") {
    if (analysis.materialCost === null || (analysis.directLaborCost === null && analysis.indirectLaborCost === null)) return null;
    return analysis.materialCost + (analysis.directLaborCost || 0) + (analysis.indirectLaborCost || 0);
  }
  if (baseKey === "MATERIAL_PLUS_LABOR_PLUS_EXPENSES") {
    if (analysis.materialCost === null || analysis.expenses === null || (analysis.directLaborCost === null && analysis.indirectLaborCost === null)) return null;
    return analysis.materialCost + (analysis.directLaborCost || 0) + (analysis.indirectLaborCost || 0) + analysis.expenses;
  }
  if (baseKey === "LABOR_PLUS_EXPENSES_PLUS_OVERHEAD") {
    if (analysis.expenses === null || analysis.overhead === null || (analysis.directLaborCost === null && analysis.indirectLaborCost === null)) return null;
    return (analysis.directLaborCost || 0) + (analysis.indirectLaborCost || 0) + analysis.expenses + analysis.overhead;
  }
  return null;
}

function numberAppears(text: string, value: number) {
  const values = [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) => Number(match[0].replace(/,/g, ""))).filter(Number.isFinite);
  return values.some((candidate) => Math.abs(candidate - value) < 0.0001);
}

function excerptAppears(text: string, excerpt: string | null) {
  if (!excerpt) return false;
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const haystack = normalize(text);
  const needle = normalize(excerpt);
  return needle.length >= 8 && (haystack.includes(needle) || needle.includes(haystack));
}

function normalizedEvidenceLabel(value: string) {
  return value.normalize("NFKC").replace(/[`*_\s·ㆍ.,:;()\[\]{}<>\-/]/g, "").toLowerCase();
}

function laborEvidenceFromRegisteredTable(
  target: ReviewTarget,
  searchResults: EvidenceSearchResult[],
  documentsByFile: Map<string, ReadyEvidenceDocument>,
) {
  if (target.section !== "LABOR") return null;
  const wanted = normalizedEvidenceLabel(target.label);
  for (const result of searchResults) {
    const document = documentsByFile.get(result.fileId);
    if (!document) continue;
    for (const line of result.text.split(/\r?\n/)) {
      if (!line.includes("|")) continue;
      const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
      const labelIndex = cells.findIndex((cell) => normalizedEvidenceLabel(cell) === wanted);
      if (labelIndex < 0) continue;
      for (const cell of cells.slice(labelIndex + 1)) {
        const match = cell.match(/^\s*(\d[\d,]*(?:\.\d+)?)\s*(?:원)?\s*$/);
        if (!match) continue;
        const expectedValue = Number(match[1].replace(/,/g, ""));
        if (!Number.isFinite(expectedValue) || expectedValue < 1_000) continue;
        const candidate: EvidenceCandidate = {
          targetKey: target.targetKey,
          expectedValue,
          ratePercent: null,
          baseKey: "UNKNOWN",
          matchStatus: "EXACT",
          sourceFileId: result.fileId,
          sourceFilename: result.filename,
          sourceLocation: "직종별 노임단가 표",
          sourceExcerpt: line.trim(),
          note: null,
        };
        return { candidate, result, document };
      }
    }
  }
  return null;
}

export function applyEvidenceCandidates(
  targets: ReviewTarget[], candidates: EvidenceCandidate[], searchResults: EvidenceSearchResult[], documents: ReadyEvidenceDocument[], analysis: AnalysisAmounts,
) {
  const targetKeys = new Set(targets.map((target) => target.targetKey));
  const documentsByFile = new Map(documents.flatMap((document) => [
    [document.id, document] as const,
    ...(document.openaiFileId ? [[document.openaiFileId, document] as const] : []),
  ]));
  type VerifiedEvidence = { candidate: EvidenceCandidate; result: EvidenceSearchResult; document: ReadyEvidenceDocument };
  const verifiedLists = new Map<string, VerifiedEvidence[]>();
  for (const candidate of candidates) {
    if (!targetKeys.has(candidate.targetKey)) continue;
    const matchingResults = searchResults.filter((item) => (candidate.sourceFileId && item.fileId === candidate.sourceFileId) || (candidate.sourceFilename && item.filename === candidate.sourceFilename));
    const evidenceNumber = candidate.expectedValue ?? candidate.ratePercent;
    const result = matchingResults.find((item) => evidenceNumber === null ? excerptAppears(item.text, candidate.sourceExcerpt) : numberAppears(item.text, evidenceNumber));
    if (!result) continue;
    const document = documentsByFile.get(result.fileId);
    if (!document) continue;
    const list = verifiedLists.get(candidate.targetKey) || [];
    list.push({ candidate, result, document });
    verifiedLists.set(candidate.targetKey, list);
  }

  const verified = new Map<string, VerifiedEvidence>();
  for (const [targetKey, evidenceList] of verifiedLists) {
    const exact = evidenceList.filter(({ candidate }) => candidate.matchStatus === "EXACT");
    const preferred = exact.length ? exact : evidenceList;
    const distinctNumbers = new Set(preferred.map(({ candidate }) => candidate.expectedValue ?? candidate.ratePercent).filter((value) => value !== null));
    if (distinctNumbers.size <= 1) {
      verified.set(targetKey, preferred[0]);
      continue;
    }
    const first = preferred[0];
    verified.set(targetKey, {
      ...first,
      candidate: {
        ...first.candidate,
        expectedValue: null,
        ratePercent: null,
        matchStatus: "UNCERTAIN",
        note: "등록자료에서 금액·기간 조건별 요율을 여러 개 찾았습니다. 공사기간과 해당 공사규모 기준금액을 입력하면 적용 요율을 확정할 수 있습니다.",
      },
    });
  }

  // A response may return one row for repeated labor items, or omit a target key
  // even though the exact markdown table row was retrieved. Reuse a verified row
  // for the same job title, then fall back to deterministic exact-cell parsing.
  for (const target of targets) {
    if (target.section !== "LABOR" || verified.has(target.targetKey)) continue;
    const matchingTarget = targets.find((candidateTarget) =>
      candidateTarget.section === "LABOR"
      && candidateTarget.targetKey !== target.targetKey
      && normalizedEvidenceLabel(candidateTarget.label) === normalizedEvidenceLabel(target.label)
      && verified.has(candidateTarget.targetKey));
    if (matchingTarget) {
      verified.set(target.targetKey, verified.get(matchingTarget.targetKey)!);
      continue;
    }
    const tableEvidence = laborEvidenceFromRegisteredTable(target, searchResults, documentsByFile);
    if (tableEvidence) verified.set(target.targetKey, tableEvidence);
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
    const isCeiling = target.section === "STATUTORY" && ["간접노무비", "기타경비", "일반관리비", "이윤"].some((label) => target.label.includes(label));
    let status: ReviewStatus = "CHECK";
    if (target.quotedValue !== null && expected !== null && candidate.matchStatus === "EXACT" && (isCeiling ? target.quotedValue <= expected : target.quotedValue === expected)) status = "NORMAL";
    const calculation = candidate.ratePercent !== null && base !== null ? `${base} × ${candidate.ratePercent}% = ${expected}` : null;
    return {
      section: target.section, targetKey: target.targetKey, label: target.label, status,
      quotedValue: target.quotedValue, expectedValue: expected, ...values, calculation,
      detail: expected === null ? candidate.note || "등록 기준은 찾았지만 적용 조건이 부족하여 요율을 확정할 수 없습니다." : status === "NORMAL" ? (isCeiling ? "견적값이 등록 근거자료의 허용 상한 이내입니다." : target.section === "LABOR" ? "견적 단가가 등록된 직종별 노임단가와 일치합니다." : "견적값이 등록 근거자료의 기준값과 일치합니다.") : candidate.note || (isCeiling ? "견적값이 등록 근거자료의 허용 상한을 초과합니다." : target.section === "LABOR" ? "견적 단가와 등록된 직종별 노임단가의 차이를 확인해 주세요." : "견적값과 등록 근거자료의 기준값이 달라 담당자 확인이 필요합니다."),
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
