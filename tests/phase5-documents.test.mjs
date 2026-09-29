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

test("Phase 5 builds the construction plan from the registered Markdown template", async () => {
  const { buildConstructionPlanContent } = await import(moduleUrl.href);
  const reference = "수신: 내부결재\n(경유)\n제목: 예시 공사 추진 계획(안)\n보충설명\n작성 시 참고사항";
  const content = buildConstructionPlanContent(contract, reference);
  assert.match(content, /^제목: 본관 옥상 방수 사업 추진 계획\(안\)/);
  assert.match(content, /1\. 관련: 000/);
  assert.match(content, /2\. 우리학교 본관 옥상 방수 사업계획을 다음과 같이 수립하고자 합니다\./);
  assert.match(content, /가\. 사 업 명: 본관 옥상 방수공사/);
  assert.match(content, /나\. 예 산 액: 금11,000,000원/);
  assert.match(content, /1\) 공 사 비: 금11,000,000원/);
  assert.match(content, /2\) 일반수용비: 금000원/);
  assert.match(content, /3\) 비 품 비: 금000원/);
  assert.match(content, /다\. 사업내용/);
  assert.match(content, /1\) \(공사\) 옥상 누수 방지/);
  assert.match(content, /2\) \(물품\) 000/);
  assert.match(content, /붙임  성립전예산요구서 1부\.  끝\./);
  assert.doesNotMatch(content, /수신|경유|보충설명|작성 시 참고사항|\*\*|^#/m);
});

test("Phase 5 exposes a source-backed editable construction plan without advancing the workflow", async () => {
  const component = await readFile(new URL("../components/AdministrativeDocumentsWorkspace.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/contracts/[id]/administrative-documents/route.ts", import.meta.url), "utf8");
  const source = await readFile(new URL("../lib/construction-plan-source.ts", import.meta.url), "utf8");
  assert.match(component, /공사계획서/);
  assert.match(component, /CONSTRUCTION_PLAN/);
  assert.match(component, /isLegacyConstructionPlan/);
  assert.match(route, /공사계획서는 작성내용 저장만 가능합니다/);
  assert.match(source, /공사계약 Q&A 및 사례연습\(2025\. 6\.\)_공사계획수립 내부기안문\.md/);
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
