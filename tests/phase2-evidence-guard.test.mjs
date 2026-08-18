import assert from "node:assert/strict";
import test from "node:test";
import { finalizeKnowledgeAnswer } from "../lib/evidence-guard.ts";

const readyDocuments = [{
  id: "doc-1",
  documentName: "승인된 시험자료",
  originalName: "approved.txt",
  openaiFileId: "file-approved",
}];

test("등록 자료 검색결과와 파일 인용이 모두 있으면 답변과 출처를 허용한다", () => {
  const result = finalizeKnowledgeAnswer({
    id: "resp-1",
    output: [
      { type: "file_search_call", results: [{ file_id: "file-approved", filename: "approved.txt", score: 0.9 }] },
      { type: "message", content: [{ type: "output_text", text: "시험용 확인코드는 EDU-260818입니다.", annotations: [{ type: "file_citation", file_id: "file-approved", filename: "approved.txt" }] }] },
    ],
  }, readyDocuments);

  assert.equal(result.evidenceStatus, "SUPPORTED");
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].documentName, "승인된 시험자료");
});

test("검색결과만 있고 파일 인용이 없으면 고정 미확인 문구를 반환한다", () => {
  const result = finalizeKnowledgeAnswer({
    output: [
      { type: "file_search_call", results: [{ file_id: "file-approved", filename: "approved.txt" }] },
      { type: "message", content: [{ type: "output_text", text: "모델이 추정한 답변", annotations: [] }] },
    ],
  }, readyDocuments);

  assert.equal(result.answer, "등록된 지식자료에서 확인할 수 없습니다.");
  assert.equal(result.evidenceStatus, "NO_EVIDENCE");
  assert.deepEqual(result.sources, []);
});

test("등록되지 않은 파일 인용은 근거로 인정하지 않는다", () => {
  const result = finalizeKnowledgeAnswer({
    output: [
      { type: "file_search_call", results: [{ file_id: "file-unknown" }] },
      { type: "message", content: [{ type: "output_text", text: "외부 답변", annotations: [{ type: "file_citation", file_id: "file-unknown" }] }] },
    ],
  }, readyDocuments);

  assert.equal(result.answer, "등록된 지식자료에서 확인할 수 없습니다.");
});
