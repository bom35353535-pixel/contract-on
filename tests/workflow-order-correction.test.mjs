import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Quotation review is required before dashboard registration", async () => {
  const review = await readFile(new URL("../components/QuotationReview.tsx", import.meta.url), "utf8");
  const confirmRoute = await readFile(new URL("../app/api/estimates/[id]/confirm/route.ts", import.meta.url), "utf8");
  assert.match(review, /\/api\/estimates\/\$\{analysisId\}\/review/);
  assert.match(review, /\/api\/estimates\/\$\{analysisId\}\/confirm/);
  assert.ok(review.indexOf("<PreConfirmationReviewResults") < review.indexOf("estimate-final-actions"));
  assert.match(review, /disabled=\{!!busy \|\| !review \|\| !reviewFresh \|\| emptyCount > 0\}/);
  assert.match(review, /setReviewFresh\(false\)/);
  assert.match(review, /"다시 검토"/);
  assert.match(review, /이 견적으로 현황판 등록/);
  assert.doesNotMatch(review, /className=\{`confirm-bar/);
  assert.ok(confirmRoute.indexOf("SELECT id FROM quotation_reviews") < confirmRoute.indexOf("INSERT INTO contracts"));
  assert.match(confirmRoute, /먼저 견적검토를 실행하고 결과를 확인해 주세요/);
  assert.match(confirmRoute, /JSON\.stringify\(values\) !== JSON\.stringify\(reviewedValues\)/);
  assert.match(confirmRoute, /검토 후 입력값이 변경되었습니다/);
});

test("Estimate completion is announced once after navigation", async () => {
  const review = await readFile(new URL("../components/QuotationReview.tsx", import.meta.url), "utf8");
  const upload = await readFile(new URL("../components/UploadPanel.tsx", import.meta.url), "utf8");
  assert.match(upload, /\?analysis=complete/);
  assert.match(review, /window\.alert\("견적서 분석 완료"\)/);
  assert.match(review, /url\.searchParams\.delete\("analysis"\)/);
});

test("Knowledge files can be stored before indexing without spending tokens", async () => {
  const manager = await readFile(new URL("../components/KnowledgeManager.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/knowledge/route.ts", import.meta.url), "utf8");
  const uploadPanel = await readFile(new URL("../components/UploadPanel.tsx", import.meta.url), "utf8");
  assert.match(manager, /name="deferIndexing"/);
  assert.match(manager, /defaultChecked/);
  assert.match(route, /PENDING_INDEXING/);
  assert.match(route, /if \(shouldIndex\)/);
  assert.match(uploadPanel, /지식관리 먼저 열기/);
  assert.match(uploadPanel, /지식자료를 먼저 등록하세요/);
});

test("Pre-confirmation review can exist without a contract id", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const reviews = schema.slice(schema.indexOf("export const quotationReviews"), schema.indexOf("export const quotationReviewItems"));
  assert.match(reviews, /contractId: text\("contract_id"\)\.references/);
  assert.doesNotMatch(reviews, /contractId: text\("contract_id"\)\.notNull/);
  assert.match(reviews, /idx_quotation_reviews_analysis_created/);
});
