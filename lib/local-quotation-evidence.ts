import type { EvidenceCandidate, EvidenceSearchResult, ReadyEvidenceDocument, ReviewTarget } from "./quotation-review";

type KnowledgeText = ReadyEvidenceDocument & { category: string; text: string };
type ReviewContext = {
  constructionType: string | null;
  totalAmount: number | null;
  plannedStartDate: string | null;
  plannedCompletionDate: string | null;
};

function normalize(value: string) {
  return value.normalize("NFKC").replace(/[`*_\s·ㆍ.,:;()\[\]{}<>\-/]/g, "").toLowerCase();
}

function cells(line: string) {
  if (!line.includes("|")) return [];
  const row = line.split("|").map((cell) => cell.trim());
  if (!row[0]) row.shift();
  if (!row.at(-1)) row.pop();
  return row;
}

function percent(value?: string) {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*%?/);
  return match ? Number(match[1]) : null;
}

function amountMatches(label: string, amount: number) {
  const compact = label.replace(/,/g, "").replace(/\s/g, "");
  const less = compact.match(/^(\d+(?:\.\d+)?)억미만$/);
  if (less) return amount < Number(less[1]) * 100_000_000;
  const range = compact.match(/^(\d+(?:\.\d+)?)억이상~(\d+(?:\.\d+)?)억미만$/);
  if (range) return amount >= Number(range[1]) * 100_000_000 && amount < Number(range[2]) * 100_000_000;
  const more = compact.match(/^(\d+(?:\.\d+)?)억이상$/);
  return more ? amount >= Number(more[1]) * 100_000_000 : false;
}

function constructionDays(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
    ? Math.floor((endMs - startMs) / 86_400_000) + 1
    : null;
}

function periodMatches(label: string, days: number) {
  if (label.includes("6개월 이하")) return days <= 183;
  if (label.includes("7~12개월")) return days >= 184 && days <= 365;
  if (label.includes("13~36개월")) return days >= 366 && days <= 1_095;
  if (label.includes("36개월 초과")) return days >= 1_096;
  return false;
}

function source(document: KnowledgeText, line: string, location: string) {
  const fileId = document.openaiFileId || document.id;
  const result: EvidenceSearchResult = { fileId, filename: document.originalName, text: line };
  return { fileId, result, location };
}

export function findLocalQuotationEvidence(targets: ReviewTarget[], documents: KnowledgeText[], context: ReviewContext) {
  const candidates: EvidenceCandidate[] = [];
  const results: EvidenceSearchResult[] = [];
  const push = (target: ReviewTarget, document: KnowledgeText, line: string, location: string, expectedValue: number | null, ratePercent: number | null, baseKey: EvidenceCandidate["baseKey"]) => {
    const found = source(document, line, location);
    candidates.push({
      targetKey: target.targetKey, expectedValue, ratePercent, baseKey, matchStatus: "EXACT",
      sourceFileId: found.fileId, sourceFilename: document.originalName, sourceLocation: location,
      sourceExcerpt: line.trim().slice(0, 350), note: null,
    });
    results.push(found.result);
  };

  const laborDocuments = documents.filter((document) => `${document.category} ${document.documentName} ${document.originalName}`.includes("노임"));
  for (const target of targets.filter((candidate) => candidate.section === "LABOR")) {
    const wanted = normalize(target.label);
    outer: for (const document of laborDocuments) {
      for (const line of document.text.split(/\r?\n/)) {
        const row = cells(line);
        const labelIndex = row.findIndex((cell) => {
          const value = normalize(cell);
          return value === wanted || (wanted.length >= 2 && value.endsWith(wanted));
        });
        if (labelIndex < 0) continue;
        for (const cell of row.slice(labelIndex + 1)) {
          const match = cell.match(/^\s*(\d[\d,]*(?:\.\d+)?)\s*(?:원)?\s*$/);
          if (!match) continue;
          const value = Number(match[1].replace(/,/g, ""));
          if (!Number.isFinite(value) || value < 1_000) continue;
          push(target, document, line, "직종별 노임단가 표", value, null, "UNKNOWN");
          break outer;
        }
      }
    }
  }

  const amount = context.totalAmount;
  const days = constructionDays(context.plannedStartDate, context.plannedCompletionDate);
  const rateDocument = documents.find((document) => {
    const name = `${document.documentName} ${document.originalName}`;
    return name.includes("간접공사비") || document.category.includes("제비율");
  });
  if (!rateDocument || amount === null) return { candidates, results };

  const rows = rateDocument.text.split(/\r?\n/).map((line) => ({ line, cells: cells(line) })).filter((row) => row.cells.length >= 2);
  const duration = days === null ? null : rows.find((row) => row.cells.length >= 4 && row.cells[0].includes("억") && row.cells[1].includes("개월") && amountMatches(row.cells[0], amount) && periodMatches(row.cells[1], days));
  const price = rows.find((row) => row.cells.length >= 4 && row.cells[0].includes("억") && !row.cells[1].includes("개월") && percent(row.cells[1]) !== null && percent(row.cells[3]) !== null && amountMatches(row.cells[0], amount));
  const definitions: Array<[string, typeof duration, number, EvidenceCandidate["baseKey"]]> = [
    ["간접노무비", duration, 2, "DIRECT_LABOR_COST"],
    ["기타경비", duration, 3, "MATERIAL_PLUS_LABOR"],
    ["일반관리비", price, 1, "MATERIAL_PLUS_LABOR_PLUS_EXPENSES"],
    ["이윤", price, 3, "LABOR_PLUS_EXPENSES_PLUS_OVERHEAD"],
  ];
  for (const [label, row, rateIndex, baseKey] of definitions) {
    const target = targets.find((candidate) => candidate.section === "STATUTORY" && candidate.label.includes(label));
    const rate = row ? percent(row.cells[rateIndex]) : null;
    if (target && row && rate !== null) push(target, rateDocument, row.line, "공사금액·공사기간별 제비율표", null, rate, baseKey);
  }

  const fixed: Array<[string, EvidenceCandidate["baseKey"], string[]]> = [
    ["산재보험료", "LABOR_COST", ["산재보험료", "산재보험"]],
    ["고용보험료", "LABOR_COST", ["7등급 미만", "고용보험료"]],
    ["국민건강보험료", "DIRECT_LABOR_COST", ["건강보험료", "국민건강보험료"]],
    ["국민연금보험료", "DIRECT_LABOR_COST", ["연금보험료", "국민연금보험료"]],
  ];
  for (const [label, baseKey, aliases] of fixed) {
    const target = targets.find((candidate) => candidate.section === "STATUTORY" && candidate.label.includes(label));
    if (!target) continue;
    const row = rows.find((candidate) => aliases.some((alias) => candidate.cells[0] === alias));
    const rate = row ? percent(row.cells[2]) ?? percent(row.cells[1]) : null;
    if (row && rate !== null) push(target, rateDocument, row.line, "사회보험·고정요율표", null, rate, baseKey);
  }
  return { candidates, results };
}
