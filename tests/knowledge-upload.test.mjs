import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { documentNameFromFileName } from "../lib/file-name.ts";
import { SUPPORTED_EXTENSIONS } from "../lib/knowledge-constants.ts";

test("knowledge document name defaults to the selected filename", () => {
  assert.equal(documentNameFromFileName("하자기간.pdf"), "하자기간");
  assert.equal(documentNameFromFileName("2026.5.수정 공사대장.xlsm"), "2026.5.수정 공사대장");
  assert.equal(documentNameFromFileName("README"), "README");
});

test("knowledge uploads accept the supplied macro-enabled ledgers", () => {
  assert.ok(SUPPORTED_EXTENSIONS.includes("xlsm"));
});

test("knowledge upload fills the title and appends the saved document", async () => {
  const [manager, route] = await Promise.all([
    readFile(new URL("../components/KnowledgeManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/knowledge/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(manager, /setDocumentName\(\(current\) => current\.trim\(\) \|\| documentNameFromFileName\(next\.name\)\)/);
  assert.match(manager, /setDocuments\(\(current\) => \[payload\.document!, \.\.\.current\]\)/);
  assert.match(route, /documentNameFromFileName\(file\.name\)/);
});
