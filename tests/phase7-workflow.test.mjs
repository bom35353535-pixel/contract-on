import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Phase 7 exposes construction, completion documents, and inspection workspaces", async () => {
  const detail = await readFile(new URL("../app/contracts/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(detail, /tab=construction-progress/);
  assert.match(detail, /tab=completion-documents/);
  assert.match(detail, /tab=inspection/);
  assert.match(detail, /Phase7ConstructionWorkspace/);
  assert.match(detail, /Phase7InspectionWorkspace/);
});

test("Phase 7 completion documents reuse evidence-limited document review", async () => {
  const types = await readFile(new URL("../lib/contract-document-review.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/contracts/[id]/phase6-documents/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  assert.match(types, /"COMPLETION"/);
  assert.match(route, /stage === "COMPLETION" \? "PHASE7_COMPLETION_DOCUMENT_REVIEW"/);
  assert.match(workspace, /오늘은 계약상 준공일입니다\. 준공계 송부 여부와 준공서류를 확인하세요\./);
  assert.match(workspace, /준공서류 확인 완료/);
});

test("Phase 7 construction checklist combines common and inferred trade checks without another menu", async () => {
  const { getApplicableFieldChecklist } = await import(new URL("../lib/construction-field-checklist.ts", import.meta.url).href);
  const bathroom = getApplicableFieldChecklist("건축공사", "화장실 환경개선공사");
  assert.ok(bathroom.categories.includes("건축·인테리어"));
  assert.ok(bathroom.categories.includes("기계·설비"));
  assert.ok(bathroom.categories.includes("전기"));
  assert.ok(bathroom.items.some((item) => item.group === "공정"));
  assert.equal(new Set(bathroom.items.map((item) => item.title.replace(/[^0-9a-z가-힣]/gi, ""))).size, bathroom.items.length);
  const detail = await readFile(new URL("../app/contracts/[id]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(detail, /tab=field-inspection|tab=site-inspection/);
});

test("Phase 7 field checks provide three states, detail records, photos, summaries, and history", async () => {
  const component = await readFile(new URL("../components/Phase7ConstructionWorkspace.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/contracts/[id]/phase7-construction-checklist/route.ts", import.meta.url), "utf8");
  assert.match(component, /NORMAL: "정상"/);
  assert.match(component, /NEEDS_REVIEW: "확인 필요"/);
  assert.match(component, /NOT_APPLICABLE: "해당 없음"/);
  assert.match(component, /메모/);
  assert.match(component, /사진 첨부/);
  assert.match(component, /조치사항/);
  assert.match(component, /조치완료/);
  assert.match(component, /점검 이력/);
  assert.match(route, /construction-checklist\/\$\{contractId\}/);
  assert.doesNotMatch(route, /findConstructionChecklistCriteria|getVectorStoreId|isOpenAIConfigured/);
});

test("Phase 7 records inspection and payment as separate user confirmations", async () => {
  const actions = await readFile(new URL("../app/api/contracts/[id]/phase7-actions/route.ts", import.meta.url), "utf8");
  const contracts = await readFile(new URL("../lib/contracts.ts", import.meta.url), "utf8");
  assert.ok(actions.indexOf('body.action === "complete-inspection"') < actions.indexOf('body.action === "complete-payment"'));
  assert.match(contracts, /if \(!contract\.inspectionDate\) throw new Error\("먼저 검사·검수 완료를 확인해 주세요\."\)/);
  assert.match(contracts, /payment_date = \?/);
  assert.match(contracts, /current_stage = 'FINISHED'/);
  assert.match(contracts, /source !== "phase7"/);
});
