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

test("Phase 4 computes the profit formula and accepts a quote below its ceiling", async () => {
  const { applyEvidenceCandidates } = await import(moduleUrl.href);
  const target = { section: "STATUTORY", targetKey: "rate:이윤", label: "이윤", quotedValue: 5_000, comparisonKind: "RATE", context: "이윤" };
  const candidate = { targetKey: "rate:이윤", expectedValue: null, ratePercent: 15, baseKey: "LABOR_PLUS_EXPENSES_PLUS_OVERHEAD", matchStatus: "EXACT", sourceFileId: "file-rates", sourceFilename: "제비율.md", sourceLocation: "일반관리비 및 이윤", sourceExcerpt: "5억 미만 | 8.0% | 8.0% | 15.0%", note: null };
  const documents = [{ id: "doc-rates", documentName: "건축공사 간접공사비", originalName: "제비율.md", openaiFileId: "file-rates", year: 2026 }];
  const result = applyEvidenceCandidates([target], [candidate], [{ fileId: "file-rates", filename: "제비율.md", text: "| 5억 미만 | 8.0% | 8.0% | 15.0% |" }], documents, { ...amounts, overhead: 5_000 });
  assert.equal(result[0].expectedValue, 6_750);
  assert.equal(result[0].status, "NORMAL");
  assert.match(result[0].detail, /허용 상한 이내/);
});

test("Phase 4 accepts indirect labor and other expenses below their registered ceilings", async () => {
  const { applyEvidenceCandidates } = await import(moduleUrl.href);
  const targets = [
    { section: "STATUTORY", targetKey: "rate:간접노무비", label: "간접노무비", quotedValue: 4_000, comparisonKind: "RATE", context: "간접노무비" },
    { section: "STATUTORY", targetKey: "rate:기타경비", label: "기타경비", quotedValue: 4_000, comparisonKind: "RATE", context: "기타경비" },
  ];
  const candidates = [
    { targetKey: "rate:간접노무비", expectedValue: null, ratePercent: 17.5, baseKey: "DIRECT_LABOR_COST", matchStatus: "EXACT", sourceFileId: "file-rates", sourceFilename: "제비율.md", sourceLocation: "요율표", sourceExcerpt: "17.5%", note: null },
    { targetKey: "rate:기타경비", expectedValue: null, ratePercent: 5, baseKey: "MATERIAL_PLUS_LABOR", matchStatus: "EXACT", sourceFileId: "file-rates", sourceFilename: "제비율.md", sourceLocation: "요율표", sourceExcerpt: "5.0%", note: null },
  ];
  const documents = [{ id: "doc-rates", documentName: "건축공사 간접공사비", originalName: "제비율.md", openaiFileId: "file-rates", year: 2026 }];
  const results = [{ fileId: "file-rates", filename: "제비율.md", text: "| 10억 미만 | 6개월 이하 | 17.5% | 5.0% |" }];
  const reviewed = applyEvidenceCandidates(targets, candidates, results, documents, amounts);
  assert.deepEqual(reviewed.map((item) => item.status), ["NORMAL", "NORMAL"]);
  assert.ok(reviewed.every((item) => item.detail.includes("허용 상한 이내")));
});

test("Phase 4 verifies the cited rate against any retrieved chunk from that file", async () => {
  const { applyEvidenceCandidates } = await import(moduleUrl.href);
  const target = { section: "STATUTORY", targetKey: "rate:간접노무비", label: "간접노무비", quotedValue: 5_250, comparisonKind: "RATE", context: "간접노무비" };
  const candidate = { targetKey: "rate:간접노무비", expectedValue: null, ratePercent: 17.5, baseKey: "DIRECT_LABOR_COST", matchStatus: "EXACT", sourceFileId: "file-rates", sourceFilename: "제비율.md", sourceLocation: "요율표", sourceExcerpt: "10억 미만 | 6개월 이하 | 17.5%", note: null };
  const documents = [{ id: "doc-rates", documentName: "건축공사 간접공사비", originalName: "제비율.md", openaiFileId: "file-rates", year: 2026 }];
  const results = [
    { fileId: "file-rates", filename: "제비율.md", text: "간접노무비: 직접노무비 × 간접노무비율" },
    { fileId: "file-rates", filename: "제비율.md", text: "| 10억 미만 | 6개월 이하 | 17.5% | 5.0% |" },
  ];
  const reviewed = applyEvidenceCandidates([target], [candidate], results, documents, amounts);
  assert.equal(reviewed[0].expectedValue, 5_250);
  assert.equal(reviewed[0].status, "NORMAL");
});

test("Phase 4 reports missing duration as a found-but-unresolved basis", async () => {
  const { applyEvidenceCandidates } = await import(moduleUrl.href);
  const target = { section: "STATUTORY", targetKey: "rate:기타경비", label: "기타경비", quotedValue: 5_000, comparisonKind: "RATE", context: "기타경비" };
  const candidate = { targetKey: "rate:기타경비", expectedValue: null, ratePercent: null, baseKey: "MATERIAL_PLUS_LABOR", matchStatus: "UNCERTAIN", sourceFileId: "file-rates", sourceFilename: "제비율.md", sourceLocation: "요율표", sourceExcerpt: "직접공사비 | 공사기간 | 간접노무비율 | 기타경비율", note: "공사기간이 없어 요율 구간을 확정할 수 없습니다." };
  const documents = [{ id: "doc-rates", documentName: "건축공사 간접공사비", originalName: "제비율.md", openaiFileId: "file-rates", year: 2026 }];
  const results = [{ fileId: "file-rates", filename: "제비율.md", text: "| 직접공사비 | 공사기간 | 간접노무비율 | 기타경비율 |" }];
  const reviewed = applyEvidenceCandidates([target], [candidate], results, documents, amounts);
  assert.equal(reviewed[0].status, "CHECK");
  assert.equal(reviewed[0].expectedValue, null);
  assert.equal(reviewed[0].evidenceDocumentId, "doc-rates");
  assert.match(reviewed[0].detail, /공사기간/);
});

test("Phase 4 separates material and labor targets before knowledge search", async () => {
  const { buildEvidenceTargets } = await import(moduleUrl.href);
  const rows = [
    { id: 1, category: "1.설치공사", trade: "재료비", itemName: "각파이프", specification: "50*50", unit: "본", quantity: 4, unitPrice: 35_232, amount: 140_928 },
    { id: 2, category: "1.설치공사", trade: "노무비", itemName: "용접공", specification: null, unit: "인", quantity: 2, unitPrice: 282_536, amount: 565_072 },
  ];
  const targets = buildEvidenceTargets(amounts, rows);
  assert.equal(targets.find((target) => target.targetKey === "material:1")?.section, "MATERIAL");
  assert.equal(targets.find((target) => target.targetKey === "labor:2")?.section, "LABOR");
  assert.equal(targets.some((target) => target.targetKey === "labor:1"), false);
});

test("Phase 4 applies one registered labor table row to repeated job titles", async () => {
  const { applyEvidenceCandidates } = await import(moduleUrl.href);
  const targets = [
    { section: "LABOR", targetKey: "labor:1", label: "보통인부", quotedValue: 172_068, comparisonKind: "UNIT_PRICE", context: "노무비 보통인부" },
    { section: "LABOR", targetKey: "labor:2", label: "보통인부", quotedValue: 172_068, comparisonKind: "UNIT_PRICE", context: "노무비 보통인부" },
  ];
  const documents = [{ id: "doc-labor", documentName: "2026년 상반기 노임단가", originalName: "노임단가.md", openaiFileId: "file-labor", year: 2026 }];
  const results = [{ fileId: "file-labor", filename: "노임단가.md", text: "| 번호 | 직종명 | 구분 | 2026.1.1 |\n| 1001 | 보통인부 | - | 172,068 |" }];
  const reviewed = applyEvidenceCandidates(targets, [], results, documents, amounts);
  assert.deepEqual(reviewed.map((item) => item.status), ["NORMAL", "NORMAL"]);
  assert.deepEqual(reviewed.map((item) => item.expectedValue), [172_068, 172_068]);
  assert.ok(reviewed.every((item) => item.evidenceDocumentId === "doc-labor"));
});

test("Phase 4 knowledge search separates statutory, labor, and material requests", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../lib/openai-knowledge.ts", import.meta.url), "utf8"));
  assert.match(source, /\["STATUTORY", "LABOR", "MATERIAL"\]/);
  assert.match(source, /우선 검색어/);
  assert.match(source, /공사 및 견적 조건/);
});

test("Phase 4 requires construction dates before review and hides quotation date input", async () => {
  const { readFile } = await import("node:fs/promises");
  const [component, route] = await Promise.all([
    readFile(new URL("../components/QuotationReview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/estimates/[id]/review/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(component, /\["quotationDate", "견적일자"/);
  assert.match(component, /\["plannedStartDate", "착공예정일", true\]/);
  assert.match(component, /\["plannedCompletionDate", "준공예정일", true\]/);
  assert.match(component, /disabled=\{!!busy \|\| emptyCount > 0\}/);
  assert.match(route, /status: 422/);
  assert.match(route, /준공예정일은 착공예정일보다 빠를 수 없습니다/);
});
