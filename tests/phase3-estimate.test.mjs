import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../lib/estimate.ts", import.meta.url);

test("Phase 3 source keeps unknown values null and sanitizes exact amounts", async () => {
  const source = await import(moduleUrl.href);
  const result = source.normalizeQuotationExtraction({
    projectName: "  본관 도장공사  ",
    companyName: "",
    businessRegistrationNumber: "123-45-67890",
    totalAmount: "12,345,000원",
    items: [{ itemName: "수성페인트", quantity: "10", unitPrice: "20,000", amount: "200,000" }],
  });
  assert.equal(result.projectName, "본관 도장공사");
  assert.equal(result.companyName, null);
  assert.equal(result.businessRegistrationNumber, "123-45-67890");
  assert.equal(result.totalAmount, 12_345_000);
  assert.equal(result.items[0].quantity, 10);
  assert.equal(result.items[0].amount, 200_000);
});

test("Phase 3 confirmation reports only contract-required missing fields", async () => {
  const source = await import(moduleUrl.href);
  const result = source.normalizeQuotationExtraction({ projectName: "체육관 공사", totalAmount: 1_000_000, items: [] });
  assert.deepEqual(source.missingRequiredFields(result), ["공사종류", "공사목적", "공사장소", "업체명"]);
});
