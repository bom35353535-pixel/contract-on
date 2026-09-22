import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("registered audit cases are parsed and matched without generative AI", async () => {
  const { parseAuditCases, selectRelevantAuditCases } = await import(new URL("../lib/audit-cases.ts", import.meta.url).href);
  const source = `# 감사사례\n\n# 사례 10. 전기공사 분리발주 업무 부적정\n## 관련 규정\n전기공사 관련 규정\n## 실제 감사사례\nOO초등학교에서 전기공사를 적절히 분리하지 않고 계약한 사례입니다.\n\n## 사례 16. 설계변경 업무 부적정\n### 관련 규정\n계약 관련 규정\n### 실제 감사사례\n공사범위가 변경되었음에도 정식 설계변경 없이 진행한 사례입니다.\n\n## 사례 17. 건설폐기물 업무처리 부적정\n### 실제 감사사례\n철거 폐기물을 관련 절차에 따라 처리하지 않은 사례입니다.`;
  const cases = parseAuditCases(source);
  assert.equal(cases.length, 3);
  assert.equal(cases[0].sourceCaseNumber, 10);
  assert.match(cases[0].relatedRegulations, /전기공사 관련 규정/);
  const electrical = selectRelevantAuditCases(cases, { projectName: "교실 LED 조명 교체공사", constructionType: "전기공사", totalAmount: 25_000_000, plannedStartDate: "2026-09-01", plannedCompletionDate: "2026-09-20" });
  assert.equal(electrical[0].title, "전기공사 분리발주 업무 부적정");
  const demolition = selectRelevantAuditCases(cases, { projectName: "기존 시설 철거공사", constructionType: "건축공사", totalAmount: 8_000_000, plannedStartDate: null, plannedCompletionDate: null });
  assert.ok(demolition.some((item) => item.title === "건설폐기물 업무처리 부적정"));
});

test("quotation review adds only a compact related-audit section", async () => {
  const dashboard = await readFile(new URL("../components/QuotationReviewDashboard.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/RelatedAuditCases.tsx", import.meta.url), "utf8");
  const source = await readFile(new URL("../lib/audit-case-source.ts", import.meta.url), "utf8");
  assert.match(dashboard, /RelatedAuditCases/);
  assert.match(component, /관련 감사사례/);
  assert.match(component, /현재 공사정보와 직접 관련된 감사사례가 없습니다/);
  assert.match(component, /이 사례를 보여주는 이유/);
  assert.doesNotMatch(component, /<p>{item\.summary}<\/p>/);
  assert.match(component, /관련 규정/);
  assert.match(component, /실제 감사사례/);
  assert.match(source, /공사계약 Q&A 및 사례연습\(2025\. 6\.\)_감사사례만\.md/);
  assert.doesNotMatch(source, /openai|generate|chat/i);
});

test("22 million won contract prioritizes the design and contracting audit case", async () => {
  const { parseAuditCases, selectRelevantAuditCases } = await import(new URL("../lib/audit-cases.ts", import.meta.url).href);
  const source = `# 1. 시설공사 설계 계약업무 처리 소홀
## 관련 규정
추정가격이 2천만 원 이하가 아닌 경우 전자조달시스템을 이용하여 2인 이상으로부터 견적서를 제출받아야 함.
## 〈사례〉
설계금액이 23,088,000원임에도 적용률을 줄여 1인 수기견적으로 계약한 사례입니다.

# 16. 설계변경 업무 부적정
## 관련 규정
설계변경 관련 규정
## 〈사례〉
정식 설계변경 절차 없이 공사를 진행한 사례입니다.`;
  const cases = parseAuditCases(source);
  const selected = selectRelevantAuditCases(cases, {
    projectName: "교실 환경개선공사", constructionType: "건축공사",
    totalAmount: 22_000_000, supplyAmount: 20_000_000,
    plannedStartDate: null, plannedCompletionDate: null,
  });
  assert.equal(selected[0].title, "시설공사 설계 계약업무 처리 소홀");
  assert.match(selected[0].matchReason, /공사금액|추정가격/);
});
