import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../lib/quotation-review.ts", import.meta.url);

const amounts = {
  totalAmount: 110_000,
  supplyAmount: 100_000,
  vatAmount: 10_000,
  materialCost: 60_000,
  directLaborCost: 30_000,
  indirectLaborCost: 5_000,
  expenses: 5_000,
  statutoryExpenses: null,
  overhead: null,
  profit: null,
  safetyHealthCost: null,
};

test("Phase 4 arithmetic review detects correct and mismatched line amounts", async () => {
  const { buildArithmeticReview } = await import(moduleUrl.href);
  const rows = [
    { id: 1, category: "재료비", trade: null, itemName: "페인트", specification: null, unit: "통", quantity: 2, unitPrice: 10_000, amount: 20_000 },
    { id: 2, category: "재료비", trade: null, itemName: "붓", specification: null, unit: "개", quantity: 3, unitPrice: 1_000, amount: 4_000 },
  ];
  const items = buildArithmeticReview(amounts, rows);
  assert.equal(items.find((item) => item.targetKey === "line:1")?.status, "NORMAL");
  assert.equal(items.find((item) => item.targetKey === "line:2")?.status, "ERROR");
  assert.equal(items.find((item) => item.targetKey === "line:2")?.expectedValue, 3_000);
});

test("Phase 4 arithmetic review flags a supply plus VAT total mismatch", async () => {
  const { buildArithmeticReview } = await import(moduleUrl.href);
  const items = buildArithmeticReview({ ...amounts, totalAmount: 111_000 }, []);
  const total = items.find((item) => item.targetKey === "total:supply_plus_vat");
  assert.equal(total?.status, "ERROR");
  assert.equal(total?.difference, 1_000);
});

test("Phase 4 rejects an AI evidence number not present in retrieved registered text", async () => {
  const { applyEvidenceCandidates } = await import(moduleUrl.href);
  const target = { section: "LABOR", targetKey: "labor:1", label: "도장공", quotedValue: 150_000, comparisonKind: "UNIT_PRICE", context: "도장공" };
  const candidate = { targetKey: "labor:1", expectedValue: 150_000, ratePercent: null, baseKey: "UNKNOWN", matchStatus: "EXACT", sourceFileId: "file-1", sourceFilename: "노임자료.pdf", sourceLocation: "3쪽", sourceExcerpt: "도장공", note: null };
  const documents = [{ id: "doc-1", documentName: "2026 노임자료", originalName: "노임자료.pdf", openaiFileId: "file-1", year: 2026 }];
  const result = applyEvidenceCandidates([target], [candidate], [{ fileId: "file-1", filename: "노임자료.pdf", text: "도장공 기준 노임은 149,000원" }], documents, amounts);
  assert.equal(result[0].status, "NO_BASIS");
  assert.equal(result[0].evidenceDocumentId, null);
});

test("Phase 4 computes a registered rate comparison in code", async () => {
  const { applyEvidenceCandidates } = await import(moduleUrl.href);
  const target = { section: "STATUTORY", targetKey: "rate:일반관리비", label: "일반관리비", quotedValue: 10_000, comparisonKind: "RATE", context: "일반관리비" };
  const candidate = { targetKey: "rate:일반관리비", expectedValue: null, ratePercent: 10, baseKey: "SUPPLY_AMOUNT", matchStatus: "EXACT", sourceFileId: "file-2", sourceFilename: "제비율.pdf", sourceLocation: "2쪽", sourceExcerpt: "일반관리비 10%", note: null };
  const documents = [{ id: "doc-2", documentName: "2026 제비율", originalName: "제비율.pdf", openaiFileId: "file-2", year: 2026 }];
  const result = applyEvidenceCandidates([target], [candidate], [{ fileId: "file-2", filename: "제비율.pdf", text: "일반관리비 적용률 10%" }], documents, amounts);
  assert.equal(result[0].expectedValue, 10_000);
  assert.equal(result[0].status, "NORMAL");
  assert.equal(result[0].calculation, "100000 × 10% = 10000");
});
