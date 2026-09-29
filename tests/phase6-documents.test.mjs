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

test("completion checklist marks zero-cost expenses and sub-100M retirement contribution documents not applicable", async () => {
  const { applyCompletionDocumentApplicability, documentReviewCounts } = await import(moduleUrl.href);
  const base = ["폐기물 처리비 정산서", "환경보전비 사용내역서", "건설근로자 퇴직공제부금 납부확인서", "준공계"].map((requiredName) => ({
    status: "MISSING", requiredName, uploadedFileId: null, detail: "누락",
    evidenceDocumentId: null, evidenceDocumentName: null, evidenceYear: null, evidenceLocation: null, evidenceExcerpt: null,
  }));
  const items = applyCompletionDocumentApplicability(base, {
    constructionAmount: 22_000_000, wasteDisposalCost: 0, environmentalPreservationCost: 0,
  });
  assert.deepEqual(items.map((item) => item.status), ["NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE", "MISSING"]);
  assert.deepEqual(documentReviewCounts(items), { submittedCount: 0, missingCount: 1, checkCount: 0 });
});

test("Phase 6 confirms an exactly classified construction document even when required-list evidence is absent", async () => {
  const { buildDocumentChecklist, documentReviewCounts } = await import(moduleUrl.href);
  const items = buildDocumentChecklist([], [{ id: "F1", originalName: "착공계.pdf", detectedType: "착공계", detectionStatus: "EXACT", summary: null }]);
  assert.equal(items[0].status, "SUBMITTED");
  assert.match(items[0].detail, /착공계 서류를 확인/);
  assert.deepEqual(documentReviewCounts(items), { submittedCount: 1, missingCount: 0, checkCount: 0 });
});

test("one combined contract file can satisfy several submitted document types", async () => {
  const { buildDocumentChecklist, documentReviewCounts } = await import(moduleUrl.href);
  const criteria = ["통장사본", "청렴서약서", "사용인감계"].map((requiredName) => ({
    requiredName, aliases: [], evidenceDocumentId: "K1", evidenceDocumentName: "계약 기준", evidenceYear: 2026, evidenceLocation: null, evidenceExcerpt: `${requiredName} 제출`,
  }));
  const files = [{ id: "BUNDLE", originalName: "계약서류일괄.pdf", detectedTypes: ["통장사본", "청렴서약서", "사용인감계"], detectionStatus: "EXACT", summary: null }];
  const items = buildDocumentChecklist(criteria, files);
  assert.deepEqual(items.map((item) => item.status), ["SUBMITTED", "SUBMITTED", "SUBMITTED"]);
  assert.ok(items.every((item) => item.uploadedFileId === "BUNDLE"));
  assert.deepEqual(documentReviewCounts(items), { submittedCount: 3, missingCount: 0, checkCount: 0 });
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

test("combined contract files are classified from the full masked file without manual type selection", async () => {
  const classifier = await import(new URL("../lib/submitted-document-classifier.ts", import.meta.url).href);
  const route = await readFile(new URL("../app/api/contracts/[id]/phase6-documents/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  const contentClassifier = await readFile(new URL("../lib/submitted-document-content-classifier.ts", import.meta.url), "utf8");

  assert.equal(classifier.classifySubmittedDocumentName("2026_사업자 등록증_사본.pdf", "NARA_CONTRACT").detectedType, "사업자등록증");
  assert.match(route, /classifySubmittedDocumentContents/);
  assert.match(route, /decodeDetectedTypes/);
  assert.match(route, /openai_file_id[\s\S]*?null/);
  assert.match(contentClassifier, /전체 페이지를 끝까지 확인하세요/);
  assert.match(contentClassifier, /한 파일에 여러 서류가 합쳐져 있으면/);
  assert.match(workspace, /마스킹 사본의 전체 페이지를 읽어/);
  assert.doesNotMatch(workspace, /submittedTypes|문서 종류 확인 필요<\/option>/);
  assert.doesNotMatch(workspace, /나라장터 계약서류/);
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

test("construction checklist comes from the registered construction markdown stage table", async () => {
  const { findLocalRequiredDocumentCriteria } = await import(new URL("../lib/required-document-markdown.ts", import.meta.url).href);
  const text = `### 5. 착공 단계
| 서류명 | 법적 / 규정 근거 | 비고 및 세부 기준 |
| :--- | :--- | :--- |
| **착공신고서 (착공계)** | - | 1천만원 미만 생략 가능 |
| **현장기술자 지정신고서** | - | 현장대리인계, 재직증명서, 자격증 사본 포함 |
| **공사공정예정표** | - | 예정공정표 |
| **착공 전 현장사진** | - | 준공사진으로 대체 가능 |
| **직접시공계획서** | 법령 | 조건부 제출 |
| **전기, 수도료 납부 합의서**<br>(또는 미사용 각서) | 지침 | 조건부 제출 |
| **노무비 구분관리 및 지급확인제 합의서** | 집행기준 | 조건부 제출 |
| **공사(용역) 안전·보건 체크리스트** | 지침 | 제출 |

### 6. 준공 단계
| 서류명 | 근거 |
| 준공계 | - |`;
  const criteria = findLocalRequiredDocumentCriteria("PRE_CONSTRUCTION", [{ id: "K1", documentName: "계약구비서류_공사", originalName: "계약구비서류_공사.md", year: 2026, text }]);
  assert.deepEqual(criteria.map((item) => item.requiredName), [
    "착공계", "현장기술자 지정신고서", "공사공정예정표", "직접시공계획서",
    "전기, 수도료 납부 합의서", "노무비 구분관리 및 지급확인제 합의서", "공사(용역) 안전·보건 체크리스트",
  ]);
  assert.ok(criteria.find((item) => item.requiredName === "현장기술자 지정신고서")?.aliases.includes("현장대리인계"));
  assert.ok(criteria.find((item) => item.requiredName === "공사공정예정표")?.aliases.includes("예정공정표"));
  assert.ok(!criteria.some((item) => item.requiredName.includes("현장사진")));
  assert.ok(!criteria.some((item) => item.requiredName.includes("장비투입")));
  assert.ok(!criteria.some((item) => item.requiredName.includes("품질관리계획")));
});

test("construction PDFs use full-file classification and only registered checklist document types", async () => {
  const classifier = await import(new URL("../lib/submitted-document-classifier.ts", import.meta.url).href);
  const route = await readFile(new URL("../app/api/contracts/[id]/phase6-documents/route.ts", import.meta.url), "utf8");
  const contentClassifier = await readFile(new URL("../lib/submitted-document-content-classifier.ts", import.meta.url), "utf8");
  const options = classifier.submittedDocumentTypeOptions("PRE_CONSTRUCTION");
  assert.ok(options.includes("현장대리인계"));
  assert.ok(options.includes("공사공정예정표"));
  assert.ok(!options.includes("안전관리계획서"));
  assert.doesNotMatch(route, /LOCAL_FILENAME_RULES/);
  assert.match(route, /for \(const file of files\) classified\.push\(await classifySubmittedDocumentContents\(file, stage\)\)/);
  assert.match(route, /findLocalRequiredDocumentCriteria/);
  assert.match(route, /storedKnowledgeDocuments/);
  assert.match(route, /status === "READY"/);
  assert.match(contentClassifier, /공정별 인력·장비투입계획서/);
  assert.match(contentClassifier, /착공 전 현장사진은 선택 가능한 문서 종류가 아니므로 결과에 포함하지 마세요/);
});

test("document analysis completion uses an app dialog without the site-address prefix", async () => {
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /showCompletionNotice/);
  assert.match(workspace, /서류 확인이 완료되었습니다\./);
  assert.match(workspace, /role="dialog"/);
  assert.doesNotMatch(workspace, /window\.alert/);
});

test("uploaded contract document files can be deleted and stale reviews are cleared", async () => {
  const route = await readFile(new URL("../app/api/contracts/[id]/phase6-documents/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  assert.match(route, /export async function DELETE/);
  assert.match(route, /DELETE FROM contract_document_review_items/);
  assert.match(route, /DELETE FROM contract_document_reviews/);
  assert.match(route, /DELETE FROM contract_document_files/);
  assert.match(route, /env\.FILES\.delete\(file\.storageKey\)/);
  assert.match(workspace, /pendingDelete/);
  assert.match(workspace, /method: "DELETE"/);
  assert.match(workspace, /업로드된 파일을 삭제할까요\?/);
  assert.match(workspace, /파일 삭제/);
});

test("stored uploaded files can be reviewed again without selecting another local file", async () => {
  const route = await readFile(new URL("../app/api/contracts/[id]/phase6-documents/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  assert.match(route, /export async function PUT/);
  assert.match(route, /method: "STORED_FILE_REVIEW"/);
  assert.match(route, /buildDocumentChecklist\(criteria, classifiedFiles\)/);
  assert.match(workspace, /!selected\.length && files\.length/);
  assert.match(workspace, /method: "PUT"/);
  assert.match(workspace, /업로드된 서류 다시 확인/);
  assert.match(workspace, /\(!selected\.length && !files\.length\)/);
});

test("uploaded file list shows only the filename and delete action", async () => {
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(workspace, /displayDetectedTypes/);
  assert.doesNotMatch(workspace, /문서 종류 확인 필요/);
  assert.match(workspace, /업로드된 파일 \{files\.length\}개/);
  assert.match(workspace, /aria-label=\{`\$\{file\.originalName\} 삭제`\}/);
});

test("construction document aliases match the same submitted documents", async () => {
  const { buildDocumentChecklist } = await import(new URL("../lib/contract-document-review.ts", import.meta.url).href);
  const criterion = (requiredName, aliases) => ({
    requiredName, aliases, evidenceDocumentId: "K1", evidenceDocumentName: "계약구비서류_공사",
    evidenceYear: 2026, evidenceLocation: "5. 착공 단계", evidenceExcerpt: `${requiredName} 제출`,
  });
  const criteria = [
    criterion("착공신고서", []),
    criterion("공사공정예정표", []),
    criterion("현장기술자 지정신고서", []),
  ];
  const files = [{
    id: "F1", originalName: "착공서류묶음.pdf",
    detectedTypes: ["착공계", "예정공정표", "현장대리인계"], detectionStatus: "EXACT", summary: null,
  }];
  const items = buildDocumentChecklist(criteria, files);
  assert.deepEqual(items.map((item) => item.status), ["SUBMITTED", "SUBMITTED", "SUBMITTED"]);
  assert.ok(items.every((item) => item.uploadedFileId === "F1"));
});

test("reviewing stored files rereads the saved PDF before rebuilding the checklist", async () => {
  const route = await readFile(new URL("../app/api/contracts/[id]/phase6-documents/route.ts", import.meta.url), "utf8");
  assert.match(route, /env\.FILES\.get\(storedFile\.storageKey\)/);
  assert.match(route, /new File\(\[await storedObject\.arrayBuffer\(\)\]/);
  assert.match(route, /classifySubmittedDocumentContents\(file, stage\)/);
  assert.match(route, /UPDATE contract_document_files/);
  assert.match(route, /encodeDetectedTypes\(classification\.detectedTypes\)/);
});

test("contract and commitment completion navigate to the newly active work stage", async () => {
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  const advance = await readFile(new URL("../components/AdvanceStageButton.tsx", import.meta.url), "utf8");
  const commitment = await readFile(new URL("../components/CommitmentWorkspace.tsx", import.meta.url), "utf8");
  const detail = await readFile(new URL("../app/contracts/[id]/page.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/contracts/[id]/phase6-documents/route.ts", import.meta.url), "utf8");
  assert.match(workspace, /result\.nextStage === "COMMITMENT"/);
  assert.match(workspace, /\?tab=g2b/);
  assert.match(workspace, /isCompletion && files\.length > 0/);
  assert.match(route, /completionFilesConfirmed/);
  assert.match(detail, /tab === "commitment"/);
  assert.match(commitment, /원인행위 완료 확인/);
  assert.match(advance, /body\.nextStage \?\? body\.transition\?\.nextStage/);
  assert.match(advance, /window\.location\.assign\(`\/contracts\/\$\{contractId\}\?tab=construction-documents`\)/);
});

test("contract completion uses an app dialog without the site-address prefix", async () => {
  const workspace = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /completionConfirmOpen/);
  assert.match(workspace, /role="alertdialog"/);
  assert.match(workspace, /phase6-complete-confirm-title/);
  assert.doesNotMatch(workspace, /window\.confirm/);
});
