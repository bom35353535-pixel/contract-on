import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../lib/quotation-review.ts", import.meta.url);

test("labor remains a review target without a classification or readable price", async () => {
  const { buildEvidenceTargets } = await import(moduleUrl.href);
  const rows = [
    { id: 81, category: null, trade: null, itemName: "철공", specification: null, unit: "인", quantity: 1, unitPrice: 239_808, amount: 239_808 },
    { id: 82, category: "노무비", trade: null, itemName: "보통인부", specification: null, unit: null, quantity: 1, unitPrice: null, amount: null },
  ];
  const targets = buildEvidenceTargets(amounts, rows).filter((target) => target.section === "LABOR");
  assert.equal(targets.length, 2);
  assert.equal(targets[0].quotedValue, 239_808);
  assert.equal(targets[1].quotedValue, null);
});

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

test("Phase 4 reviews labor unit prices but does not judge material prices", async () => {
  const { buildEvidenceTargets } = await import(moduleUrl.href);
  const rows = [
    { id: 1, category: "1.설치공사", trade: "재료비", itemName: "각파이프", specification: "50*50", unit: "본", quantity: 4, unitPrice: 35_232, amount: 140_928 },
    { id: 2, category: "1.설치공사", trade: "노무비", itemName: "용접공", specification: null, unit: "인", quantity: 2, unitPrice: 282_536, amount: 565_072 },
  ];
  const targets = buildEvidenceTargets(amounts, rows);
  assert.equal(targets.find((target) => target.targetKey === "labor:2")?.section, "LABOR");
  assert.equal(targets.some((target) => target.section === "MATERIAL"), false);
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

test("Phase 4 review uses local text first and only searches the index for missing labor", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../lib/run-quotation-review.ts", import.meta.url), "utf8"));
  assert.match(source, /findLocalQuotationEvidence/);
  assert.match(source, /md\|txt\|csv/);
  assert.match(source, /missingLaborTargets/);
  assert.match(source, /findQuotationReviewCriteria\(missingLaborTargets/);
});

test("Phase 4 labor review compares only the occupation unit price", async () => {
  const { buildEvidenceTargets } = await import(moduleUrl.href);
  const targets = buildEvidenceTargets(amounts, [{ id: 9, category: "철거 작업", trade: "노무비", itemName: "보통인부", specification: "현장 정리", unit: "인", quantity: 2, unitPrice: 172_068, amount: 344_136 }]);
  const labor = targets.find((target) => target.targetKey === "labor:9");
  assert.equal(labor?.label, "보통인부");
  assert.equal(labor?.context, "보통인부");
  assert.equal(labor?.quotedValue, 172_068);
});

test("Phase 4 derives a missing expense total for management and profit formulas", async () => {
  const { deriveExpenseAmount } = await import(moduleUrl.href);
  const rows = [
    { category: "원가계산", trade: "경비", itemName: "기타경비", amount: 205_924 },
    { category: "원가계산", trade: "경비", itemName: "산재보험료", amount: 0 },
  ];
  assert.equal(deriveExpenseAmount(rows), 205_924);
});

test("Phase 4 local markdown lookup accepts rows without outer pipes", async () => {
  const { findLocalQuotationEvidence } = await import(new URL("../lib/local-quotation-evidence.ts", import.meta.url).href);
  const targets = [
    { section: "LABOR", targetKey: "labor:1", label: "철공", quotedValue: 239_808, comparisonKind: "UNIT_PRICE", context: "철공" },
    { section: "STATUTORY", targetKey: "rate:일반관리비", label: "일반관리비", quotedValue: 167_866, comparisonKind: "RATE", context: "일반관리비" },
    { section: "STATUTORY", targetKey: "rate:이윤", label: "이윤", quotedValue: 235_554, comparisonKind: "RATE", context: "이윤" },
  ];
  const documents = [
    { id: "labor", documentName: "2026년 상반기 건설업 시중노임단가", originalName: "노임단가.md", openaiFileId: null, year: 2026, category: "계약", text: "1009 | **철공** | - | 239,808" },
    { id: "rates", documentName: "건축공사 간접공사비", originalName: "제비율.md", openaiFileId: null, year: 2026, category: "계약", text: "5억 미만 | 8.0 | 8.0 | 15.0" },
  ];
  const evidence = findLocalQuotationEvidence(targets, documents, { constructionType: "기타공사", totalAmount: 4_136_000, plannedStartDate: "2026-06-01", plannedCompletionDate: "2026-06-10" });
  assert.equal(evidence.candidates.find((item) => item.targetKey === "labor:1")?.expectedValue, 239_808);
  assert.equal(evidence.candidates.find((item) => item.targetKey === "rate:일반관리비")?.ratePercent, 8);
  assert.equal(evidence.candidates.find((item) => item.targetKey === "rate:이윤")?.ratePercent, 15);
});

test("Phase 4 reads item-oriented rate rows and the formatted 2026 ironworker price", async () => {
  const { findLocalQuotationEvidence } = await import(new URL("../lib/local-quotation-evidence.ts", import.meta.url).href);
  const { applyEvidenceCandidates } = await import(moduleUrl.href);
  const targets = [
    { section: "LABOR", targetKey: "labor:1", label: "철공", quotedValue: 239_808, comparisonKind: "UNIT_PRICE", context: "철공" },
    { section: "STATUTORY", targetKey: "rate:일반관리비", label: "일반관리비", quotedValue: 235_554, comparisonKind: "RATE", context: "일반관리비" },
    { section: "STATUTORY", targetKey: "rate:이윤", label: "이윤", quotedValue: 300_000, comparisonKind: "RATE", context: "이윤" },
  ];
  const documents = [
    { id: "labor", documentName: "2026년 상반기 건설업 시중노임단가", originalName: "2026_노임단가.md", openaiFileId: null, year: 2026, category: "계약", text: "| 직종번호 | 직종명 | 2026년 상반기 |\n| 1009 | **철공(일반)** | **239,808원** |" },
    { id: "rates", documentName: "건축공사 간접공사비 적용기준", originalName: "제비율.md", openaiFileId: null, year: 2026, category: "계약", text: "| 항목 | 요율(%) | 설명 |\n| 일반관리비 | **8.0** | 5억원 미만 · (재료비+노무비+경비) × 비율 |\n| 이윤 | **15.0** | 5억원 미만 · (노무비+경비+일반관리비) × 비율 |" },
  ];
  const context = { constructionType: "건축공사", totalAmount: 4_136_000, plannedStartDate: "2026-06-01", plannedCompletionDate: "2026-06-10" };
  const evidence = findLocalQuotationEvidence(targets, documents, context);
  const analysis = { ...amounts, materialCost: 907_928, directLaborCost: 2_077_296, indirectLaborCost: 166_184, expenses: null, overhead: 235_554 };
  const reviewed = applyEvidenceCandidates(targets, evidence.candidates, evidence.results, documents, analysis);
  assert.equal(reviewed.find((item) => item.targetKey === "labor:1")?.expectedValue, 239_808);
  assert.equal(reviewed.find((item) => item.targetKey === "labor:1")?.status, "NORMAL");
  assert.equal(reviewed.find((item) => item.targetKey === "rate:일반관리비")?.expectedValue, 252_113);
  assert.equal(reviewed.find((item) => item.targetKey === "rate:일반관리비")?.status, "NORMAL");
  assert.equal(reviewed.find((item) => item.targetKey === "rate:이윤")?.expectedValue, 371_855);
  assert.equal(reviewed.find((item) => item.targetKey === "rate:이윤")?.status, "NORMAL");
});

test("Phase 4 reads each occupation from its exact row and the 2026.1.1 column", async () => {
  const { findLocalQuotationEvidence } = await import(new URL("../lib/local-quotation-evidence.ts", import.meta.url).href);
  const targets = [
    { section: "LABOR", targetKey: "labor:ordinary", label: "보통인부", quotedValue: 172_068, comparisonKind: "UNIT_PRICE", context: "보통인부" },
    { section: "LABOR", targetKey: "labor:welder", label: "용접공", quotedValue: 282_536, comparisonKind: "UNIT_PRICE", context: "용접공" },
    { section: "LABOR", targetKey: "labor:iron", label: "철공", quotedValue: 239_808, comparisonKind: "UNIT_PRICE", context: "철공" },
  ];
  const text = [
    "| 직종번호 | 직종명 | 신뢰표시 | 2026.1.1 | 2025.9.1 | 2025.1.1 | 2024.9.1 |",
    "| ---: | ---- | :--: | -------: | -------: | -------: | -------: |",
    "| 1001 | 작업반장 | - | 215,907 | 214,661 | 213,033 | 209,949 |",
    "| 1002 | 보통인부 | - | 172,068 | 171,037 | 169,804 | 167,081 |",
    "| 1009 | 철공 | - | 239,808 | 237,686 | 237,754 | 237,480 |",
    "| 1012 | 용접공 | - | 282,536 | 280,178 | 278,326 | 270,724 |",
  ].join("\n");
  const documents = [{ id: "labor-table", documentName: "2026년 상반기 건설업 시중노임단가 Codex지식", originalName: "2026년_상반기_건설업_시중노임단가_Codex지식.md", openaiFileId: null, year: 2026, category: "계약", text }];
  const evidence = findLocalQuotationEvidence(targets, documents, { constructionType: "건축공사", totalAmount: 4_136_000, plannedStartDate: "2026-06-01", plannedCompletionDate: "2026-06-10" });
  assert.deepEqual(Object.fromEntries(evidence.candidates.map((item) => [item.targetKey, item.expectedValue])), {
    "labor:ordinary": 172_068,
    "labor:welder": 282_536,
    "labor:iron": 239_808,
  });
  assert.equal(evidence.candidates.some((item) => item.expectedValue === 215_907), false);
});

test("Phase 4 prefers the 2026 second-half labor table and its latest rate column", async () => {
  const { findLocalQuotationEvidence } = await import(new URL("../lib/local-quotation-evidence.ts", import.meta.url).href);
  const targets = [
    ["interior", "내장공", 258_904],
    ["ordinary", "보통인부", 172_698],
    ["special", "특별인부", 228_717],
    ["painter", "도장공", 268_225],
    ["electric", "내선전공", 276_108],
  ].map(([key, label, quotedValue]) => ({ section: "LABOR", targetKey: `labor:${key}`, label, quotedValue, comparisonKind: "UNIT_PRICE", context: label }));
  const firstHalf = [
    "| 직종명 | 2026년 상반기 | 2025년 하반기 |",
    "| 보통인부 | 172,068 | 171,037 |",
    "| 도장공 | 265,000 | 260,000 |",
  ].join("\n");
  const secondHalf = [
    "| 직종번호 | 직종명 | 2025년 하반기 | 2026년 하반기 |",
    "| 1014 | 내장공 | 250,000 | 258,904 |",
    "| 1002 | 보통인부 | 171,037 | 172,698 |",
    "| 1003 | 특별인부 | 224,490 | 228,717 |",
    "| 1020 | 도장공 | 260,000 | 268,225 |",
    "| 1040 | 내선전공 | 270,000 | 276,108 |",
  ].join("\n");
  const documents = [
    { id: "first", documentName: "2026년 상반기 건설업 시중노임단가", originalName: "상반기.md", openaiFileId: null, year: 2026, effectiveFrom: "2026-01-01", category: "노임단가", text: firstHalf },
    { id: "second", documentName: "2026년 하반기 건설업 시중노임단가", originalName: "하반기.md", openaiFileId: null, year: 2026, effectiveFrom: "2026-09-01", category: "노임단가", text: secondHalf },
  ];
  const evidence = findLocalQuotationEvidence(targets, documents, { constructionType: "건축공사", totalAmount: 10_000_000, plannedStartDate: "2026-09-20", plannedCompletionDate: "2026-10-20" });
  assert.deepEqual(Object.fromEntries(evidence.candidates.map((item) => [item.targetKey, item.expectedValue])), {
    "labor:interior": 258_904,
    "labor:ordinary": 172_698,
    "labor:special": 228_717,
    "labor:painter": 268_225,
    "labor:electric": 276_108,
  });
});

test("Phase 4 overrides a wrong first-row AI match with each exact occupation row", async () => {
  const { applyEvidenceCandidates } = await import(moduleUrl.href);
  const targets = [
    { section: "LABOR", targetKey: "labor:ordinary", label: "보통인부", quotedValue: 172_068, comparisonKind: "UNIT_PRICE", context: "보통인부" },
    { section: "LABOR", targetKey: "labor:welder", label: "용접공", quotedValue: 282_536, comparisonKind: "UNIT_PRICE", context: "용접공" },
    { section: "LABOR", targetKey: "labor:iron", label: "철공", quotedValue: 239_808, comparisonKind: "UNIT_PRICE", context: "철공" },
  ];
  const text = [
    "| 직종번호 | 직종명 | 신뢰표시 | 2026.1.1 | 2025.9.1 |",
    "| ---: | ---- | :--: | -------: | -------: |",
    "| 1001 | 작업반장 | - | 215,907 | 214,661 |",
    "| 1002 | 보통인부 | - | 172,068 | 171,037 |",
    "| 1009 | 철공 | - | 239,808 | 237,686 |",
    "| 1012 | 용접공 | - | 282,536 | 280,178 |",
  ].join("\n");
  const document = { id: "labor-table", documentName: "2026년 상반기 건설업 시중노임단가", originalName: "노임단가.md", openaiFileId: "file-labor", year: 2026 };
  const results = [{ fileId: "file-labor", filename: "노임단가.md", text }];
  const wrongCandidates = targets.map((target) => ({
    targetKey: target.targetKey, expectedValue: 215_907, ratePercent: null, baseKey: "UNKNOWN", matchStatus: "EXACT",
    sourceFileId: "file-labor", sourceFilename: "노임단가.md", sourceLocation: "직종별 노임단가 표 · 작업반장",
    sourceExcerpt: "| 1001 | 작업반장 | - | 215,907 | 214,661 |", note: null,
  }));
  const reviewed = applyEvidenceCandidates(targets, wrongCandidates, results, [document], amounts);
  assert.deepEqual(Object.fromEntries(reviewed.map((item) => [item.label, item.expectedValue])), {
    "보통인부": 172_068,
    "용접공": 282_536,
    "철공": 239_808,
  });
  assert.equal(reviewed.every((item) => item.status === "NORMAL"), true);
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
