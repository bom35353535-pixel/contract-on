import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { documentNameFromFileName } from "../lib/file-name.ts";
import { LARGE_KNOWLEDGE_MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from "../lib/knowledge-constants.ts";

test("knowledge document name defaults to the selected filename", () => {
  assert.equal(documentNameFromFileName("하자기간.pdf"), "하자기간");
  assert.equal(documentNameFromFileName("2026.5.수정 공사대장.xlsm"), "2026.5.수정 공사대장");
  assert.equal(documentNameFromFileName("README"), "README");
});

test("knowledge uploads accept the supplied macro-enabled ledgers", () => {
  assert.ok(SUPPORTED_EXTENSIONS.includes("xlsm"));
});

test("knowledge uploads accept Markdown sources", async () => {
  assert.ok(SUPPORTED_EXTENSIONS.includes("md"));

  const [manager, route] = await Promise.all([
    readFile(new URL("../components/KnowledgeManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/knowledge/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(manager, /accept="[^"]*\.md[^"]*"/);
  assert.match(manager, /CSV · TXT · MD/);
  assert.match(route, /CSV, TXT, MD 파일만 등록/);
});

test("knowledge storage accepts the observed 185 MB request", () => {
  assert.ok(185_055_987 < LARGE_KNOWLEDGE_MAX_FILE_SIZE);
});

test("knowledge upload fills the title and appends the saved document", async () => {
  const [manager, route, largeRoute] = await Promise.all([
    readFile(new URL("../components/KnowledgeManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/knowledge/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/knowledge/large/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(manager, /setDocumentName\(\(current\) => current\.trim\(\) \|\| documentNameFromFileName\(next\.name\)\)/);
  assert.match(manager, /next\.size > LARGE_KNOWLEDGE_MAX_FILE_SIZE/);
  assert.match(manager, /setDocuments\(\(current\) => \[payload\.document!, \.\.\.current\]\)/);
  assert.match(manager, /setNotice\(\{ title: completionMessage \}\)/);
  assert.match(manager, /<AppDialog/);
  assert.match(route, /documentNameFromFileName\(file\.name\)/);
  assert.match(route, /contentLength > PROTOTYPE_MAX_FILE_SIZE/);
  assert.match(route, /413/);
  assert.match(manager, /chunkSize = 8 \* 1024 \* 1024/);
  assert.match(manager, /\/api\/knowledge\/large/);
  assert.match(manager, /\/api\/knowledge\/large\/part/);
  assert.match(manager, /\/api\/knowledge\/large\/complete/);
  assert.match(largeRoute, /createMultipartUpload/);
  const partRoute = await readFile(new URL("../app/api/knowledge/large/part/route.ts", import.meta.url), "utf8");
  const completeRoute = await readFile(new URL("../app/api/knowledge/large/complete/route.ts", import.meta.url), "utf8");
  assert.match(partRoute, /uploadPart/);
  assert.match(completeRoute, /upload\.complete/);
  assert.match(completeRoute, /LARGE_FILE_STORED/);
});

test("knowledge library displays documents in Korean alphabetical order", async () => {
  const manager = await readFile(new URL("../components/KnowledgeManager.tsx", import.meta.url), "utf8");
  assert.match(manager, /orderedDocuments/);
  assert.match(manager, /localeCompare\(right\.documentName, "ko-KR"/);
  assert.match(manager, /orderedDocuments\.map/);
});
