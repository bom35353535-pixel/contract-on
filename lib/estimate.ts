export const ESTIMATE_EXTENSIONS = ["pdf", "xlsx", "xls", "docx", "csv"] as const;
export const ESTIMATE_MAX_FILE_SIZE = 15 * 1024 * 1024;

export type QuotationItemInput = {
  category: string | null;
  trade: string | null;
  itemName: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  sourceText: string | null;
};

export type QuotationExtraction = {
  projectName: string | null;
  constructionType: string | null;
  purpose: string | null;
  location: string | null;
  companyName: string | null;
  businessRegistrationNumber: string | null;
  quotationDate: string | null;
  totalAmount: number | null;
  supplyAmount: number | null;
  vatAmount: number | null;
  materialCost: number | null;
  directLaborCost: number | null;
  indirectLaborCost: number | null;
  expenses: number | null;
  statutoryExpenses: number | null;
  overhead: number | null;
  profit: number | null;
  safetyHealthCost: number | null;
  plannedStartDate: string | null;
  plannedCompletionDate: string | null;
  items: QuotationItemInput[];
};

const fieldNames = [
  "projectName", "constructionType", "purpose", "location", "companyName", "businessRegistrationNumber", "quotationDate",
  "totalAmount", "supplyAmount", "vatAmount", "materialCost", "directLaborCost",
  "indirectLaborCost", "expenses", "statutoryExpenses", "overhead", "profit",
  "safetyHealthCost", "plannedStartDate", "plannedCompletionDate",
] as const;

const textFields = new Set([
  "projectName", "constructionType", "purpose", "location", "companyName", "businessRegistrationNumber", "quotationDate",
  "plannedStartDate", "plannedCompletionDate",
]);

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, 500) : null;
}

function numericValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const source = String(value).trim();
  const accountingNegative = /^\(.*\)$/.test(source);
  const normalized = source.replace(/[(),원₩\s]/g, "").replace(/[−–—]/g, "-");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return accountingNegative ? -Math.abs(number) : number;
}

function cleanNumber(value: unknown) {
  const number = numericValue(value);
  return number !== null && number >= 0 ? Math.round(number) : null;
}

function cleanSignedNumber(value: unknown) {
  const number = numericValue(value);
  return number === null ? null : Math.round(number);
}

function cleanQuantity(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function normalizeQuotationExtraction(value: unknown): QuotationExtraction {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result: Record<string, unknown> = {};
  for (const field of fieldNames) {
    result[field] = textFields.has(field) ? cleanText(source[field]) : cleanNumber(source[field]);
  }
  const rows = Array.isArray(source.items) ? source.items.slice(0, 500) : [];
  result.items = rows.map((row) => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    return {
      category: cleanText(item.category),
      trade: cleanText(item.trade),
      itemName: cleanText(item.itemName),
      specification: cleanText(item.specification),
      unit: cleanText(item.unit),
      quantity: cleanQuantity(item.quantity),
      unitPrice: cleanSignedNumber(item.unitPrice),
      amount: cleanSignedNumber(item.amount),
      sourceText: cleanText(item.sourceText),
    };
  }).filter((item) => item.itemName || item.sourceText || item.amount !== null);
  return result as QuotationExtraction;
}

export type QuotationConsistencyIssue = {
  code: "TOTAL_MISMATCH" | "ITEM_CALCULATION_MISMATCH";
  message: string;
};

export function quotationConsistencyIssues(value: QuotationExtraction): QuotationConsistencyIssue[] {
  const issues: QuotationConsistencyIssue[] = [];
  if (value.totalAmount !== null && value.supplyAmount !== null && value.vatAmount !== null) {
    const difference = value.supplyAmount + value.vatAmount - value.totalAmount;
    if (Math.abs(difference) > 10) {
      issues.push({
        code: "TOTAL_MISMATCH",
        message: `공급가액과 부가가치세의 합계가 총액과 ${Math.abs(difference).toLocaleString("ko-KR")}원 차이 납니다. 원본 견적서를 확인해 주세요.`,
      });
    }
  }
  const mismatchedRows = value.items.filter((item) => {
    if (item.quantity === null || item.unitPrice === null || item.amount === null) return false;
    const calculated = item.quantity * item.unitPrice;
    return Math.abs(calculated - item.amount) > Math.max(1, Math.abs(item.amount) * 0.001);
  });
  if (mismatchedRows.length) {
    issues.push({
      code: "ITEM_CALCULATION_MISMATCH",
      message: `수량×단가와 금액이 일치하지 않는 항목이 ${mismatchedRows.length}건 있습니다.`,
    });
  }
  return issues;
}

export function missingRequiredFields(value: QuotationExtraction) {
  const missing: string[] = [];
  if (!value.projectName) missing.push("공사명");
  if (!value.constructionType) missing.push("공사종류");
  if (!value.purpose) missing.push("공사목적");
  if (!value.location) missing.push("공사장소");
  if (!value.companyName) missing.push("업체명");
  if (!value.totalAmount || value.totalAmount <= 0) missing.push("총액");
  return missing;
}

export function quotationColumns(value: QuotationExtraction) {
  return {
    projectName: value.projectName,
    constructionType: value.constructionType,
    purpose: value.purpose,
    location: value.location,
    companyName: value.companyName,
    businessRegistrationNumber: value.businessRegistrationNumber,
    quotationDate: value.quotationDate,
    totalAmount: value.totalAmount,
    supplyAmount: value.supplyAmount,
    vatAmount: value.vatAmount,
    materialCost: value.materialCost,
    directLaborCost: value.directLaborCost,
    indirectLaborCost: value.indirectLaborCost,
    expenses: value.expenses,
    statutoryExpenses: value.statutoryExpenses,
    overhead: value.overhead,
    profit: value.profit,
    safetyHealthCost: value.safetyHealthCost,
    plannedStartDate: value.plannedStartDate,
    plannedCompletionDate: value.plannedCompletionDate,
  };
}
