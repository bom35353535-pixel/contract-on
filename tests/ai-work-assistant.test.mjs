import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI 업무비서 provides the official workflow and registered-knowledge-only chatbot", async () => {
  const page = await readFile(new URL("../app/assistant/page.tsx", import.meta.url), "utf8");
  const contractPage = await readFile(new URL("../app/contracts/[id]/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/AiWorkAssistant.tsx", import.meta.url), "utf8");
  const floating = await readFile(new URL("../components/FloatingKnowledgeChat.tsx", import.meta.url), "utf8");
  const shell = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  const knowledge = await readFile(new URL("../lib/openai-knowledge.ts", import.meta.url), "utf8");
  assert.match(page, /<AiWorkAssistant \/>/);
  assert.match(page, /AI 업무비서/);
  assert.match(shell, /href="\/assistant"/);
  assert.match(shell, />AI 업무비서<\/a>/);
  assert.doesNotMatch(contractPage, /tab=assistant/);
  assert.match(component, /전체 업무흐름도/);
  assert.match(component, /계약 의뢰 전/);
  assert.match(component, /계약 체결/);
  assert.match(component, /사업 진행·완료/);
  assert.match(component, /대금 지급/);
  assert.match(component, /\/api\/knowledge\/query/);
  assert.match(component, /등록 지식만 답변/);
  assert.match(component, /MI000000000000000326/);
  assert.match(component, /MI000000000000000327/);
  assert.match(component, /MI000000000000000328/);
  assert.match(component, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(floating, /\/api\/knowledge\/query/);
  assert.match(floating, /플로팅 지식자료 챗봇/);
  assert.match(floating, /event\.currentTarget\.form\?\.requestSubmit\(\)/);
  assert.match(floating, /Enter 전송 · Shift\+Enter 줄바꿈/);
  assert.match(shell, /<FloatingKnowledgeChat \/>/);
  assert.match(knowledge, /동의어·유사 표현·행정용어/);
  assert.match(knowledge, /일반 지식, 추론, 추정, 외부 지식은 사용하지 마세요/);
});

test("completion documents require browser privacy masking before upload", async () => {
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/contracts/[id]/phase6-documents/route.ts", import.meta.url), "utf8");
  assert.match(workspace, /const requiresPrivacyMask = isContract \|\| isCompletion/);
  assert.match(workspace, /개인정보 자동 마스킹/);
  assert.match(route, /stage === "NARA_CONTRACT" \|\| stage === "COMPLETION"/);
});
