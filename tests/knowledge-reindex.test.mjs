import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("XLSX normalization preserves worksheet names and merged-row context", async () => {
  const normalizer = await readFile(new URL("../lib/table-normalizer.ts", import.meta.url), "utf8");
  assert.match(normalizer, /xl\/workbook\.xml/);
  assert.match(normalizer, /mergeCell/);
  assert.match(normalizer, /<si/);
  assert.match(normalizer, /rPh/);
  assert.match(normalizer, /행 \$\{rowNumber\}/);
});

test("ready knowledge files can be force reindexed", async () => {
  const route = await readFile(new URL("../app/api/knowledge/[id]/retry/route.ts", import.meta.url), "utf8");
  const manager = await readFile(new URL("../components/KnowledgeManager.tsx", import.meta.url), "utf8");
  assert.match(route, /body\.force/);
  assert.match(route, /deleteKnowledgeFile/);
  assert.match(manager, /다시 색인/);
  assert.match(manager, /JSON\.stringify\(\{ force \}\)/);
});
