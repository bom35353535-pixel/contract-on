import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("material alias database is centralized and keeps extensible metadata", async () => {
  const aliases = JSON.parse(await read("data/material-aliases.json"));
  assert.ok(aliases.length >= 90);
  assert.ok(aliases.every((entry) => entry.standardName && Array.isArray(entry.aliases) && entry.aliases.length && entry.category));
  assert.equal(aliases.find((entry) => entry.aliases.includes("철파이프"))?.standardName, "강관");
  assert.equal(aliases.find((entry) => entry.aliases.includes("레미콘"))?.standardName, "레디믹스트콘크리트");
  assert.equal(aliases.find((entry) => entry.aliases.includes("CD관"))?.standardName, "CD전선관");
});

test("G2B material route uses verified price fields and server-side environment keys", async () => {
  const route = await read("app/api/g2b/material-prices/route.ts");
  assert.match(route, /PriceInfoService/);
  assert.match(route, /getPriceInfoListFcltyCmmnMtrilTotal/);
  assert.match(route, /getPriceInfoListFcltyCmmnMtrilBildng/);
  assert.match(route, /DATA_GO_KR_SERVICE_KEY/);
  assert.match(route, /DATA_GO_KR_API_KEY/);
  for (const field of ["prdctClsfcNoNm", "krnPrdctNm", "unit", "prce", "nticeDt", "bsnsDivNm", "prceDiv", "dlvryCndtnNm"]) assert.match(route, new RegExp(field));
  assert.match(route, /cache = new Map/);
  assert.match(route, /AUTH_CODES/);
  assert.match(route, /호출 한도/);
});

test("material lookup is user-triggered and added to both quotation result screens", async () => {
  const component = await read("components/MaterialPriceLookup.tsx");
  const preConfirmation = await read("components/QuotationReview.tsx");
  const dashboard = await read("components/QuotationReviewDashboard.tsx");
  assert.match(component, /기준가격 조회/);
  assert.match(component, /onClick=\{\(\) => void lookup\(item\)\}/);
  assert.doesNotMatch(component, /useEffect/);
  assert.match(component, /sessionStorage/);
  assert.match(component, /조달청 시설공사 원가계산에 활용되는 참고가격/);
  assert.match(preConfirmation, /<MaterialPriceLookup items=\{data\.items\}/);
  assert.match(dashboard, /<MaterialPriceLookup items=\{quotation\.items\}/);
});

test("normalization preserves numbers and recognizes important construction specifications", async () => {
  const source = await read("lib/material-price.ts");
  assert.match(source, /\[㎜\]/);
  assert.match(source, /\[ΦØ⌀\]/);
  assert.match(source, /\[×xX\*\]/);
  assert.match(source, /extractSpecificationTokens/);
  assert.match(source, /상세규격 일치/);
  assert.match(source, /주요규격 일치/);
  assert.match(source, /견적서 원문/);
});

test("material matching prioritizes the official product-name field and rejects specification-only false positives", async () => {
  const route = await read("app/api/g2b/material-prices/route.ts");
  const source = await read("lib/material-price.ts");
  assert.match(route, /\{ prdctClsfcNoNm: query \}/);
  assert.match(route, /filter\(isReliableMaterialPriceMatch\)/);
  assert.match(source, /const productName = comparable\(row\.productName\)/);
  assert.match(source, /row\.matchLabel !== "관련 품목"/);
});

test("manual searches are ranked with the manual term instead of the original estimate item", async () => {
  const route = await read("app/api/g2b/material-prices/route.ts");
  assert.match(route, /const rankingName = manualQuery \|\| originalName/);
  assert.match(route, /scoreMaterialPrice\(rankingName, rankingSpecification/);
});

test("field-specific results are always merged so an exact specification is not truncated by the total endpoint", async () => {
  const route = await read("app/api/g2b/material-prices/route.ts");
  assert.match(route, /분야별 품명 결과를 항상 합친다/);
  assert.match(route, /let fieldRowsFound = false/);
  assert.match(route, /if \(!fieldRowsFound\)/);
});

test("a dimension without a written unit matches the same official millimetre specification", async () => {
  const source = await read("lib/material-price.ts");
  assert.match(source, /specificationTokensEqual/);
  assert.match(source, /right === `\$\{left\}MM`/);
  assert.match(source, /rowTokens\.some\(\(rowToken\) => specificationTokensEqual/);
});
