import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("supplier phone number is normalized and found beside a spreadsheet label", async () => {
  const { extractSupplierPhoneNumber, normalizeSupplierPhoneNumber } = await import(new URL("../lib/estimate.ts", import.meta.url).href);
  assert.equal(normalizeSupplierPhoneNumber("02) 1234-5678"), "02-1234-5678");
  assert.equal(extractSupplierPhoneNumber("행 20: C20=전화번호 | E20=02-1234-5678"), "02-1234-5678");
});

test("quotation phone is persisted and written beneath the contractor in the ledger", async () => {
  const quotationReview = await readFile(new URL("../components/QuotationReview.tsx", import.meta.url), "utf8");
  const review = await readFile(new URL("../app/api/estimates/[id]/review/route.ts", import.meta.url), "utf8");
  const confirm = await readFile(new URL("../app/api/estimates/[id]/confirm/route.ts", import.meta.url), "utf8");
  const ledgerRoute = await readFile(new URL("../app/api/contracts/[id]/ledger/[kind]/route.ts", import.meta.url), "utf8");
  const ledgerTemplate = await readFile(new URL("../lib/xlsm-template.ts", import.meta.url), "utf8");
  assert.match(review, /extraction_json = \?/);
  assert.match(confirm, /extraction_json = \?/);
  assert.match(ledgerRoute, /supplierPhoneNumber/);
  assert.match(ledgerTemplate, /I4: contract\.supplierPhoneNumber/);
  assert.match(ledgerTemplate, /C20:contract\.supplierPhoneNumber/);
  assert.ok(quotationReview.indexOf('["companyName", "업체명", true]') < quotationReview.indexOf('["supplierPhoneNumber", "업체 전화번호", false]'));
});
