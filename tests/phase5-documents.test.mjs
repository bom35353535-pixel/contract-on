import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const moduleUrl = new URL("../lib/administrative-document-content.ts", import.meta.url);

const contract = {
  id: "CTR-TEST",
  projectName: "본관 옥상 방수공사",
  constructionType: "방수공사",
  purpose: "옥상 누수 방지",
  location: "본관 옥상",
  estimatedAmount: 11_000_000,
  contractAmount: 11_000_000,
  companyName: "푸른건설",
  contractMethod: null,
  plannedStartDate: "2026-09-01",
  plannedCompletionDate: "2026-09-20",
};

test("Phase 5 creates reusable purchase request text from the contract record", async () => {
  const { buildPurchaseRequestContent } = await import(moduleUrl.href);
  const content = buildPurchaseRequestContent(contract);
  assert.match(content, /본관 옥상 방수공사/);
  assert.match(content, /옥상 누수 방지/);
  assert.match(content, /2026\.09\.01 ~ 2026\.09\.20/);
  assert.match(content, /11,000,000원/);
  assert.match(content, /푸른건설/);
});

test("Phase 5 keeps the final contract method as a user-editable decision", async () => {
  const { buildInternalApprovalContent, replaceContractMethod } = await import(moduleUrl.href);
  const draft = buildInternalApprovalContent(contract);
  assert.match(draft, /계약방법: 나라장터 전자계약/);
  assert.match(replaceContractMethod(draft, "수의계약(담당자 확정)"), /계약방법: 수의계약\(담당자 확정\)/);
});

test("Quotation analysis asks before creating a dashboard contract", async () => {
  const source = await readFile(new URL("../components/QuotationReview.tsx", import.meta.url), "utf8");
  assert.match(source, /이 견적으로 계속 진행하시겠습니까\?/);
  assert.match(source, /이 견적으로 현황판 등록/);
  assert.match(source, /estimate-final-actions/);
  assert.match(source, /role="alertdialog"/);
  assert.doesNotMatch(source, /window\.confirm\("이 견적으로 계속 진행하시겠습니까/);
});

test("Phase 5 uses app dialogs and formats contract-method evidence", async () => {
  const source = await readFile(new URL("../components/AdministrativeDocumentsWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /실제 \{pendingConfirmation === "PURCHASE_REQUEST" \? "품의" : "내부기안"\} 처리를 완료하셨나요/);
  assert.match(source, /role="alertdialog"/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(source, /RecommendationContent/);
  assert.match(source, /나라장터 전자계약/);
});

test("Later stage completion also avoids browser-native confirmation popups", async () => {
  const source = await readFile(new URL("../components/AdvanceStageButton.tsx", import.meta.url), "utf8");
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /실제 행정처리를 완료하셨나요/);
  assert.doesNotMatch(source, /window\.confirm/);
});
