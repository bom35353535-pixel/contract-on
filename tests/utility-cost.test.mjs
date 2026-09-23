import assert from "node:assert/strict";
import test from "node:test";

test("수도·전기료는 제공된 산출내역의 건축·6개월 이하·5억원 미만 요율로 10원 단위 절사한다", async () => {
  const { calculateUtilityCost } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  const result = calculateUtilityCost({ kind: "BOTH", trade: "BUILDING", duration: "UP_TO_6", amountExVat: 26_469_000, directMaterial: 7_915_000, directLabor: 11_421_000 });
  assert.equal(result.electricity?.amount, 40_600);
  assert.equal(result.water?.amount, 71_340);
  assert.equal(result.total, 111_940);
  assert.equal(result.reason, null);
});

test("제공된 산출내역의 30억 이상 50억 미만 요율도 계산한다", async () => {
  const { calculateUtilityCost } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  const result = calculateUtilityCost({ kind: "BOTH", trade: "BUILDING", duration: "UP_TO_6", amountExVat: 4_000_000_000, directMaterial: 4_000_000, directLabor: 6_000_000 });
  assert.equal(result.electricity?.rates.amount, .246);
  assert.equal(result.water?.rates.amount, .425);
  assert.equal(result.reason, null);
});

test("산출 결과를 표 없는 복사용 내부기안문으로 만든다", async () => {
  const { buildUtilityNoticeDraft } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  const draft = buildUtilityNoticeDraft({ projectName: "스마트팩토리과 실습시설 개선 공사", companyName: "주식회사 한결씨엔씨", directMaterial: 7_915_000, directLabor: 11_421_000, electricity: 40_600, water: 71_340, total: 111_940 });
  assert.match(draft, /전 기 료: 40,600원/);
  assert.match(draft, /수 도 료: 71,340원/);
  assert.match(draft, /납부금액: 금111,940원/);
  assert.match(draft, /납부계좌: 000/);
  assert.match(draft, /붙임  전기수도료 산출내역 1부/);
  assert.doesNotMatch(draft, /\|/);
});

test("전기·통신·소방·전문공사는 원본 안내대로 건축 요율을 적용한다", async () => {
  const { inferUtilityTrade } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  assert.equal(inferUtilityTrade("전기공사"), "BUILDING");
  assert.equal(inferUtilityTrade("소방공사"), "BUILDING");
  assert.equal(inferUtilityTrade("토목공사"), "CIVIL");
});
