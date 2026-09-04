import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("estimate review loads the registered building-rate Markdown source from R2", async () => {
  const page = await read("app/estimates/[id]/page.tsx");
  assert.match(page, /env\.FILES\.get\(rateReferenceDocument\.storageKey\)/);
  assert.match(page, /name\.includes\("건축공사"\).*name\.includes\("간접공사비"\)/s);
  assert.match(page, /rateReferenceText=\{rateReferenceText\}/);
});

test("current-rate reference displays registered formulas and separates rate conditions", async () => {
  const component = await read("components/CurrentRateReference.tsx");
  assert.match(component, /직접노무비 × 요율/);
  assert.match(component, /\(재료비 \+ 노무비\) × 요율/);
  assert.match(component, /\(노무비 \+ 경비 \+ 일반관리비\) × 요율/);
  assert.match(component, /amountMatches\(row\[0\], amount\).*periodMatches\(row\[1\], days\)/s);
  assert.match(component, /견적 총액을 직접공사비·추정가격에 대입한 참고 계산/);
});

test("supplier sanction lookup validates an exact business number and explains current-only coverage", async () => {
  const route = await read("app/api/g2b/sanctions/route.ts");
  const component = await read("components/SupplierSanctionCheck.tsx");
  assert.match(route, /\^\\d\{10\}\$/);
  assert.match(route, /k-skill-proxy\.nomadamas\.org\/v1\/g2b\/sanctioned-supplier/);
  assert.match(route, /status: 503/);
  assert.match(component, /0건은 과거 제재 이력이 없다는 뜻이 아니며/);
  assert.match(component, /조달청 나라장터 부정당제재업체정보/);
});
