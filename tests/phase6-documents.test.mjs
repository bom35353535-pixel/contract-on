import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const moduleUrl = new URL("../lib/contract-document-review.ts", import.meta.url);

test("Phase 6 classifies submitted, missing, and uncertain documents with registered criteria", async () => {
  const { buildDocumentChecklist, documentReviewCounts } = await import(moduleUrl.href);
  const criteria = [
    { requiredName: "계약서", aliases: [], evidenceDocumentId: "K1", evidenceDocumentName: "계약업무 기준", evidenceYear: 2026, evidenceLocation: "제3장", evidenceExcerpt: "계약서 제출" },
    { requiredName: "청렴서약서", aliases: [], evidenceDocumentId: "K1", evidenceDocumentName: "계약업무 기준", evidenceYear: 2026, evidenceLocation: "제3장", evidenceExcerpt: "청렴서약서 제출" },
  ];
  const files = [
    { id: "F1", originalName: "공사계약서.pdf", detectedType: "계약서", detectionStatus: "EXACT", summary: null },
    { id: "F2", originalName: "확약서.pdf", detectedType: "청렴 관련 서류", detectionStatus: "UNCERTAIN", summary: null },
  ];
  const items = buildDocumentChecklist(criteria, files);
  assert.ok(items.some((item) => item.requiredName === "계약서" && item.status === "SUBMITTED"));
  assert.ok(items.some((item) => item.requiredName === "청렴서약서" && item.status === "MISSING"));
  assert.ok(items.some((item) => item.uploadedFileId === "F2" && item.status === "CHECK"));
  assert.deepEqual(documentReviewCounts(items), { submittedCount: 1, missingCount: 1, checkCount: 1 });
});

test("Phase 6 does not invent missing requirements when registered evidence is absent", async () => {
  const { buildDocumentChecklist } = await import(moduleUrl.href);
  const items = buildDocumentChecklist([], [{ id: "F1", originalName: "제출자료.pdf", detectedType: null, detectionStatus: "UNCERTAIN", summary: null }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "CHECK");
  assert.doesNotMatch(items[0].detail, /누락/);
});

test("Phase 6 accepts only requirements verified against ready registered files", async () => {
  const { verifyRequiredDocumentCriteria } = await import(moduleUrl.href);
  const candidates = [{ requiredName: "착공계", aliases: ["착공신고서"], sourceFileId: "file-ready", sourceFilename: "기준.pdf", sourceLocation: "12쪽", sourceExcerpt: "착공계", matchStatus: "EXACT" }];
  const results = [{ fileId: "file-ready", filename: "기준.pdf", text: "착공 시 착공계와 착공신고서를 제출한다." }];
  const documents = [{ id: "K1", documentName: "착공업무 기준", originalName: "기준.pdf", openaiFileId: "file-ready", year: 2026 }];
  const verified = verifyRequiredDocumentCriteria(candidates, results, documents);
  assert.equal(verified.length, 1);
  assert.equal(verified[0].evidenceDocumentId, "K1");
  assert.match(verified[0].evidenceExcerpt, /착공계/);
});

test("Phase 6 exposes origin-action and start-day guidance in the contract UI", async () => {
  const detail = await readFile(new URL("../app/contracts/[id]/page.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  const contracts = await readFile(new URL("../lib/contracts.ts", import.meta.url), "utf8");
  assert.match(detail, /에듀파인 원인행위 처리가 필요합니다\./);
  assert.match(workspace, /오늘은 착공일입니다\. 착공계를 제출하고 착공서류를 확인하세요\./);
  assert.match(workspace, /제출완료/);
  assert.match(workspace, /확인필요/);
  assert.match(contracts, /source !== "phase6-documents"/);
});

test("submitted contractor files are classified locally without OpenAI file uploads", async () => {
  const classifier = await import(new URL("../lib/submitted-document-classifier.ts", import.meta.url).href);
  const route = await readFile(new URL("../app/api/contracts/[id]/phase6-documents/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");

  assert.equal(classifier.classifySubmittedDocumentName("2026_사업자 등록증_사본.pdf", "NARA_CONTRACT").detectedType, "사업자등록증");
  assert.equal(classifier.classifySubmittedDocumentName("scan001.pdf", "NARA_CONTRACT").detectionStatus, "UNCERTAIN");
  assert.equal(classifier.classifySubmittedDocumentName("scan001.pdf", "NARA_CONTRACT", "통장사본").source, "USER_CONFIRMED");
  assert.doesNotMatch(route, /classifyContractDocuments/);
  assert.match(route, /openai_file_id[\s\S]*?null/);
  assert.match(workspace, /업체 제출 원본서류는 외부 생성형 AI로 전송하지 않습니다/);
  assert.match(workspace, /submittedTypes/);
});

test("future construction documents can be prepared without being mislabeled complete", async () => {
  const route = await readFile(new URL("../app/api/contracts/[id]/phase6-documents/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /const isFutureStage = currentStageIndex >= 0 && currentStageIndex < documentStageIndex/);
  assert.match(workspace, /const canUpload = editable \|\| isFutureStage/);
  assert.match(workspace, /사전 업로드 가능/);
  assert.match(workspace, /단계 완료 처리는 해당 업무단계에 도달한 뒤 가능합니다/);
  assert.match(route, /currentStageIndex > documentStageIndex/);
  assert.match(route, /preUploaded: currentStageIndex < documentStageIndex/);
});
