import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("construction type is selected and purpose is proposed from the project name", async () => {
  const form = await read("components/QuotationReview.tsx");
  assert.match(form, /\["건축공사", "전기공사", "소방공사", "방송통신공사", "기타공사"\]/);
  assert.match(form, /field === "constructionType" \? <select/);
  assert.match(form, /purposeFromProjectName\(initial\.projectName\)/);
  assert.match(form, /purposeManuallyEdited/);
  assert.match(form, /name\.includes\("방송"\).*"방송통신공사"/s);
  assert.match(form, /name\.includes\("소방"\).*"소방공사"/s);
  assert.match(form, /name\.includes\("전기"\).*"전기공사"/s);
  assert.match(form, /return "건축공사"/);
});

test("a stored estimate can be reanalyzed before dashboard confirmation", async () => {
  const form = await read("components/QuotationReview.tsx");
  const route = await read("app/api/estimates/[id]/reanalyze/route.ts");
  assert.match(form, /견적서 다시 분석하기/);
  assert.match(form, /\/api\/estimates\/\$\{analysisId\}\/reanalyze/);
  assert.match(route, /env\.FILES\.get\(String\(analysis\.storage_key\)\)/);
  assert.match(route, /extractQuotation\(file\)/);
  assert.match(route, /QUOTATION_REEXTRACTION/);
  assert.match(route, /analysis\.status === "CONFIRMED"/);
});

test("xlsx and csv estimates use the fast cell-text extraction path", async () => {
  const source = await read("lib/openai-estimate.ts");
  assert.match(source, /fastSpreadsheetText/);
  assert.match(source, /unzipSync/);
  assert.match(source, /견적서 셀 값을 행과 열 순서대로 추출/);
  assert.match(source, /reasoning: \{ effort: "minimal" \}/);
  assert.match(source, /slice\(0, 100_000\)/);
  assert.doesNotMatch(source, /inputFile\.detail = "high"/);
});
