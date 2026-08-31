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

test("Phase 7 construction checklist only accepts direct registered evidence", async () => {
  const checklist = await readFile(new URL("../lib/construction-checklist.ts", import.meta.url), "utf8");
  const openai = await readFile(new URL("../lib/openai-knowledge.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/Phase7ConstructionWorkspace.tsx", import.meta.url), "utf8");
  assert.match(checklist, /candidate\.matchStatus !== "EXACT"/);
  assert.match(checklist, /!normalize\(result\.text\)\.includes\(key\)/);
  assert.match(openai, /일반지식, 기억, 추정, 관행, 인터넷 지식은 사용하지 마세요/);
  assert.match(component, /PENDING: "미완료", COMPLETED: "완료", NOT_APPLICABLE: "해당없음"/);
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
