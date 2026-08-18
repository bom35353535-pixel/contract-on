import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Phase 1 주요 화면과 메뉴가 구성되어 있다", async () => {
  const [home, contracts, detail, shell] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/contracts/page.tsx", root), "utf8"),
    readFile(new URL("app/contracts/[id]/page.tsx", root), "utf8"),
    readFile(new URL("components/AppShell.tsx", root), "utf8"),
  ]);
  assert.match(home, /멋진 주무관님/);
  assert.match(home, /UploadPanel/);
  assert.match(contracts, /계약 현황/);
  assert.match(detail, /StageTimeline/);
  assert.match(shell, /지식관리/);
});

test("계약 DB와 허용된 단계변경이 코드로 관리된다", async () => {
  const [schema, workflow, action] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("lib/workflow.ts", root), "utf8"),
    readFile(new URL("app/api/contracts/[id]/advance/route.ts", root), "utf8"),
  ]);
  assert.match(schema, /contractStageHistory/);
  assert.match(workflow, /PURCHASE_REQUEST/);
  assert.match(workflow, /FINISHED/);
  assert.match(action, /advanceContractStage/);
});
