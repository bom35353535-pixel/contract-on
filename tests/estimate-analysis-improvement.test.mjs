import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("estimate normalization preserves negative adjustment rows and cross-checks totals", async () => {
  const source = await import(new URL("../lib/estimate.ts", import.meta.url).href);
  const normalized = source.normalizeQuotationExtraction({
    totalAmount: 1090,
    supplyAmount: 1000,
    vatAmount: 100,
    items: [{ itemName: "조정", quantity: 1, unitPrice: "(50)", amount: "-50" }],
  });
  assert.equal(normalized.items[0].unitPrice, -50);
  assert.equal(normalized.items[0].amount, -50);
  assert.deepEqual(source.quotationConsistencyIssues(normalized), []);
  assert.equal(source.quotationConsistencyIssues({ ...normalized, totalAmount: 900 })[0].code, "TOTAL_MISMATCH");
});

test("estimate analysis uses versioned file-hash cache and real streamed stages", async () => {
  const route = await read("app/api/estimates/route.ts");
  const upload = await read("components/UploadPanel.tsx");
  const extractor = await read("lib/openai-estimate.ts");
  assert.match(route, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(route, /ANALYSIS_VERSION/);
  assert.match(route, /CRITERIA_VERSION/);
  assert.match(route, /estimate_analysis_cache/);
  assert.match(route, /application\/x-ndjson/);
  assert.match(upload, /response\.body\.getReader\(\)/);
  assert.match(upload, /estimate-analysis-progress/);
  assert.match(extractor, /워크시트:/);
  assert.match(extractor, /병합셀:/);
  assert.match(extractor, /\[수식=/);
});
