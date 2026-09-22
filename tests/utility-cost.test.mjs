import assert from "node:assert/strict";
import test from "node:test";

test("수도·전기료는 첨부 엑셀의 건축·6개월 이하·5억원 미만 요율로 10원 단위 절사한다", async () => {
  const { calculateUtilityCost } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  const result = calculateUtilityCost({ kind: "BOTH", trade: "BUILDING", duration: "UP_TO_6", amountExVat: 20_000_000, directMaterial: 4_000_000, directLabor: 6_000_000 });
  assert.equal(result.electricity?.amount, 30_100);
  assert.equal(result.water?.amount, 36_260);
  assert.equal(result.total, 66_360);
  assert.equal(result.reason, null);
});

test("원본 표에서 요율이 비어 있는 30억 이상 50억 미만은 확인 필요로 처리한다", async () => {
  const { calculateUtilityCost } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  const result = calculateUtilityCost({ kind: "BOTH", trade: "BUILDING", duration: "UP_TO_6", amountExVat: 4_000_000_000, directMaterial: 4_000_000, directLabor: 6_000_000 });
  assert.equal(result.total, null);
  assert.match(result.reason, /원본 표에 공란/);
});

test("전기·통신·소방·전문공사는 원본 안내대로 건축 요율을 적용한다", async () => {
  const { inferUtilityTrade } = await import(new URL("../lib/utility-cost.ts", import.meta.url).href);
  assert.equal(inferUtilityTrade("전기공사"), "BUILDING");
  assert.equal(inferUtilityTrade("소방공사"), "BUILDING");
  assert.equal(inferUtilityTrade("토목공사"), "CIVIL");
});
