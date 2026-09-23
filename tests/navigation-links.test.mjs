import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceFiles = [
  "app/page.tsx",
  "app/estimates/[id]/page.tsx",
  "app/contracts/page.tsx",
  "app/contracts/[id]/page.tsx",
  "app/assistant/page.tsx",
  "components/AppShell.tsx",
  "components/QuotationReview.tsx",
  "components/UploadPanel.tsx",
];

test("internal navigation avoids the broken next/link runtime", async () => {
  const sources = await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")));

  for (const source of sources) {
    assert.doesNotMatch(source, /from ["']next\/link["']/);
    assert.doesNotMatch(source, /<\/?Link\b/);
  }
});

test("knowledge management uses its updated browser-native tab", async () => {
  const shell = await readFile("components/AppShell.tsx", "utf8");
  assert.match(shell, /<a[^>]+href="\/knowledge"/);
  assert.match(shell, />지식관리<span className="phase-chip">검색 가능<\/span><\/a>/);
  assert.doesNotMatch(shell, />행정 지식</);
});

test("AI 업무비서 is a global top-level menu next to knowledge management", async () => {
  const shell = await readFile("components/AppShell.tsx", "utf8");
  assert.match(shell, /href="\/knowledge"[\s\S]*href="\/assistant"/);
  assert.match(shell, />AI 업무비서<\/a>/);
});
