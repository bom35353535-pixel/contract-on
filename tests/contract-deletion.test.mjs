import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("contracts can be deleted only after explicit confirmation", async () => {
  const page = await read("app/contracts/page.tsx");
  const button = await read("components/DeleteContractButton.tsx");
  assert.doesNotMatch(page, /contract\.currentStage !== "FINISHED"/);
  assert.match(page, /<DeleteContractButton/);
  assert.match(button, /role="alertdialog"/);
  assert.match(button, /계약 진행정보와 제출서류가 함께 삭제되며 되돌릴 수 없습니다/);
  assert.match(button, /method: "DELETE"/);
});

test("contract deletion resolves the URL id and removes linked files and records", async () => {
  const route = await read("app/api/contracts/[id]/route.ts");
  assert.match(route, /new URL\(request\.url\)/);
  assert.match(route, /decodeURIComponent\(rawId\)/);
  assert.match(route, /contract_document_files WHERE contract_id/);
  assert.match(route, /quotation_analyses WHERE contract_id/);
  assert.match(route, /env\.FILES\.delete/);
  assert.match(route, /DELETE FROM contracts WHERE id = \?/);
});
