import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("나라장터 안내는 계약서류와 원인행위 사이에서 첨부 교재의 업무 순서를 보여준다", async () => {
  const detail = await readFile(new URL("../app/contracts/[id]/page.tsx", import.meta.url), "utf8");
  const guide = await readFile(new URL("../components/G2bGuideWorkspace.tsx", import.meta.url), "utf8");
  assert.ok(detail.indexOf("tab=contract-documents") < detail.indexOf("tab=g2b"));
  assert.ok(detail.indexOf("tab=g2b") < detail.indexOf("tab=commitment"));
  assert.match(detail, /G2bGuideWorkspace/);
  assert.match(guide, /발주계획 등록/);
  assert.match(guide, /시설공사 입찰공고/);
  assert.match(guide, /개찰/);
  assert.match(guide, /사후판정/);
  assert.match(guide, /낙찰자 선정/);
  assert.match(guide, /계약서 작성·송신/);
  assert.match(guide, /계약보증서 접수/);
  assert.match(guide, /검사검수/);
  assert.match(guide, /대금지급/);
  assert.match(guide, /나라장터 실습하기/);
  assert.match(guide, /화면 개편 시 실제 나라장터 메뉴와 다를 수 있습니다\. \[확인 필요\]/);
});
