import assert from "node:assert/strict";
import test from "node:test";

test("수도·전기료는 31번 시트의 건축·6개월 이하·5억원 미만 요율로 10원 단위 절사한다", async () => {
  const { calculateUtilityCost } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  const result = calculateUtilityCost({ kind: "BOTH", trade: "BUILDING", duration: "UP_TO_6", amountExVat: 26_469_000, directMaterial: 7_915_000, directLabor: 11_421_438 });
  assert.equal(result.electricity?.amount, 52_980);
  assert.equal(result.water?.amount, 55_750);
  assert.equal(result.total, 108_730);
  assert.equal(result.reason, null);
});

test("제공된 산출내역의 30억 이상 50억 미만 요율도 계산한다", async () => {
  const { calculateUtilityCost } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  const result = calculateUtilityCost({ kind: "BOTH", trade: "BUILDING", duration: "UP_TO_6", amountExVat: 4_000_000_000, directMaterial: 4_000_000, directLabor: 6_000_000 });
  assert.equal(result.electricity?.rates.amount, .269);
  assert.equal(result.water?.rates.amount, .331);
  assert.equal(result.reason, null);
});

test("내부기안문은 산출기초 없이 오늘부터 10일 후 납부기한을 만든다", async () => {
  const { buildUtilityNoticeDraft } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  const draft = buildUtilityNoticeDraft({ projectName: "스마트팩토리과 실습시설 개선 공사", companyName: "주식회사 한결씨엔씨", directMaterial: 7_915_000, directLabor: 11_421_000, electricity: 52_980, water: 55_750, total: 108_730, today: new Date("2026-09-24T00:00:00Z") });
  assert.match(draft, /전 기 료: 52,980원/);
  assert.match(draft, /수 도 료: 55,750원/);
  assert.match(draft, /납부금액: 금108,730원/);
  assert.match(draft, /납부계좌: 000/);
  assert.match(draft, /납부기한: 2026\. 10\. 4\./);
  assert.doesNotMatch(draft, /산출기초/);
  assert.match(draft, /붙임  전기수도료 산출내역 1부/);
  assert.doesNotMatch(draft, /\|/);
});

test("31번 시트 양식의 전기수도료 산출내역 엑셀을 만든다", async () => {
  const { unzipSync, strFromU8 } = await import("fflate");
  const { calculateUtilityCost } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  const { buildUtilityCostWorkbook } = await import(new URL("../lib/utility-cost-xlsx.ts", import.meta.url).href);
  const result = calculateUtilityCost({ kind: "BOTH", trade: "BUILDING", duration: "UP_TO_6", amountExVat: 26_469_000, directMaterial: 7_915_000, directLabor: 11_421_438 });
  const bytes = buildUtilityCostWorkbook({ projectName: "스마트팩토리과 실습시설 개선 공사", kind: "BOTH", trade: "BUILDING", duration: "UP_TO_6", amountBand: result.amountBand, amountExVat: 26_469_000, directMaterial: 7_915_000, directLabor: 11_421_438, electricity: result.electricity, water: result.water, total: result.total });
  const files = unzipSync(bytes);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(workbook, /31\.수도전기료계산식/);
  assert.match(sheet, /스마트팩토리과 실습시설 개선 공사/);
  assert.match(sheet, /ROUNDDOWN/);
  assert.match(sheet, /108730/);
});

test("전기·통신·소방·전문공사는 원본 안내대로 건축 요율을 적용한다", async () => {
  const { inferUtilityTrade } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  assert.equal(inferUtilityTrade("전기공사"), "BUILDING");
  assert.equal(inferUtilityTrade("소방공사"), "BUILDING");
  assert.equal(inferUtilityTrade("토목공사"), "CIVIL");
});
