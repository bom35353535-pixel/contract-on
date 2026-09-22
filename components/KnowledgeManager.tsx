"use client";

import { useRef, useState } from "react";
import { documentNameFromFileName } from "@/lib/file-name";
import { LARGE_KNOWLEDGE_MAX_FILE_SIZE, PROTOTYPE_MAX_FILE_SIZE } from "@/lib/knowledge-constants";
import { AppDialog } from "./AppDialog";

type KnowledgeDocument = {
  id: string;
  documentName: string;
  originalName: string;
  category: string;
  year: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  uploadedAt: string;
  status: string;
  contentType: string;
  sizeBytes: number;
  sourceKind: string;
  errorMessage: string | null;
};

type Source = { documentId: string; documentName: string; filename: string };

const categories = ["계약", "노임단가", "제비율", "산업안전보건관리비", "하자", "계약서류", "착공서류", "준공서류", "공사중 체크사항", "자재가격", "기타"];

const statusLabel: Record<string, string> = {
  READY: "검색 가능",
  INDEXING: "색인 중",
  UPLOADING: "업로드 중",
  PENDING_CONFIGURATION: "API 설정 대기",
  PENDING_INDEXING: "색인 대기",
  LARGE_FILE_STORED: "대용량 원본 저장",
  FAILED: "처리 실패",
};

export function KnowledgeManager({ initialDocuments, configured }: { initialDocuments: KnowledgeDocument[]; configured: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [testing, setTesting] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [indexingDocumentId, setIndexingDocumentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; message?: string } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingForceId, setPendingForceId] = useState<string | null>(null);
  const orderedDocuments = [...documents].sort((left, right) => left.documentName.localeCompare(right.documentName, "ko-KR", { numeric: true, sensitivity: "base" }) || left.originalName.localeCompare(right.originalName, "ko-KR", { numeric: true, sensitivity: "base" }));

  function chooseFile(next: File | null) {
    if (next && next.size > LARGE_KNOWLEDGE_MAX_FILE_SIZE) {
      setFile(null);
      setUploadMessage(`${next.name}은(는) ${(next.size / 1024 / 1024).toFixed(1)}MB입니다. 지식자료 원본은 파일별 200MB 이하만 등록할 수 있습니다.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(next);
    if (next) setDocumentName((current) => current.trim() || documentNameFromFileName(next.name));
    setUploadMessage("");
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setUploadMessage("등록할 파일을 선택해 주세요.");
    const formElement = event.currentTarget;
    setUploading(true);
    setUploadProgress(null);
    setUploadMessage("");
    const form = new FormData(formElement);
    form.set("file", file);
    try {
      let payload: { document?: KnowledgeDocument; error?: string; message?: string };
      if (file.size > PROTOTYPE_MAX_FILE_SIZE) {
        const metadata: Record<string, string | number> = {
          fileName: file.name,
          sizeBytes: file.size,
          contentType: file.type || "application/octet-stream",
        };
        for (const key of ["documentName", "category", "year", "effectiveFrom", "effectiveTo"]) {
          metadata[key] = String(form.get(key) || "");
        }
        const initResponse = await fetch("/api/knowledge/large", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(metadata),
        });
        const initialized = await initResponse.json() as { id?: string; uploadId?: string; error?: string };
        if (!initResponse.ok || !initialized.id || !initialized.uploadId) throw new Error(initialized.error || "대용량 업로드를 시작하지 못했습니다.");

        const uploadedParts: Array<{ partNumber: number; etag: string }> = [];
        const chunkSize = 8 * 1024 * 1024;
        try {
          for (let start = 0, partNumber = 1; start < file.size; start += chunkSize, partNumber += 1) {
            const end = Math.min(start + chunkSize, file.size);
            const params = new URLSearchParams({ id: initialized.id, uploadId: initialized.uploadId, fileName: file.name, partNumber: String(partNumber) });
            const partResponse = await fetch(`/api/knowledge/large/part?${params.toString()}`, {
              method: "PUT", headers: { "content-type": "application/octet-stream" }, body: file.slice(start, end),
            });
            const part = await partResponse.json() as { partNumber?: number; etag?: string; error?: string };
            if (!partResponse.ok || !part.partNumber || !part.etag) throw new Error(part.error || `${partNumber}번째 파일 조각을 전송하지 못했습니다.`);
            uploadedParts.push({ partNumber: part.partNumber, etag: part.etag });
            setUploadProgress(Math.round((end / file.size) * 100));
          }
          const completeResponse = await fetch("/api/knowledge/large/complete", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...metadata, id: initialized.id, uploadId: initialized.uploadId, parts: uploadedParts }),
          });
          payload = await completeResponse.json() as { document?: KnowledgeDocument; error?: string; message?: string };
          if (!completeResponse.ok || !payload.document) throw new Error(payload.error || "대용량 파일을 최종 저장하지 못했습니다.");
        } catch (error) {
          await fetch("/api/knowledge/large/abort", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: initialized.id, uploadId: initialized.uploadId, fileName: file.name }),
          }).catch(() => undefined);
          throw error;
        }
      } else {
        const response = await fetch("/api/knowledge", { method: "POST", body: form });
        payload = await response.json() as { document?: KnowledgeDocument; error?: string; message?: string };
        if (!response.ok || !payload.document) throw new Error(payload.error || "자료를 등록하지 못했습니다.");
      }
      if (!payload.document) throw new Error(payload.error || "자료를 등록하지 못했습니다.");
      const completionMessage = payload.message || "지식자료 등록이 완료되었습니다.";
      setDocuments((current) => [payload.document!, ...current]);
      setFile(null);
      setDocumentName("");
      formElement.reset();
      setUploadMessage(completionMessage);
      setNotice({ title: completionMessage });
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "자료를 등록하지 못했습니다.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function remove(documentId: string) {
    const response = await fetch(`/api/knowledge/${documentId}`, { method: "DELETE" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setNotice({ title: "자료를 삭제하지 못했습니다.", message: payload.error });
    setDocuments((current) => current.filter((document) => document.id !== documentId));
  }

  async function retry(documentId: string, force = false) {
    setIndexingDocumentId(documentId);
    try {
      const response = await fetch(`/api/knowledge/${documentId}/retry`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const payload = await response.json() as { document?: KnowledgeDocument; error?: string };
      if (!response.ok || !payload.document) return setNotice({ title: "색인을 다시 시도하지 못했습니다.", message: payload.error });
      setDocuments((current) => current.map((document) => document.id === documentId ? payload.document! : document));
      if (force) setNotice({ title: payload.document.status === "READY" ? "새 표 구조로 다시 색인했습니다." : "다시 색인을 시작했습니다.", message: payload.document.status === "READY" ? undefined : "잠시 후 검색 상태를 확인해 주세요." });
    } finally {
      setIndexingDocumentId(null);
    }
  }

  async function testKnowledge(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setTesting(true);
    setAnswer("");
    setSources([]);
    try {
      const response = await fetch("/api/knowledge/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const payload = await response.json() as { answer?: string; sources?: Source[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "지식 테스트를 실행하지 못했습니다.");
      setAnswer(payload.answer || "");
      setSources(payload.sources || []);
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "지식 테스트를 실행하지 못했습니다.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <AppDialog open={notice !== null} title={notice?.title || "안내"} onConfirm={() => setNotice(null)}>{notice?.message && <p>{notice.message}</p>}</AppDialog>
      <AppDialog open={pendingDeleteId !== null} title="이 자료를 지식검색에서 삭제할까요?" confirmLabel="삭제" danger busy={indexingDocumentId === pendingDeleteId} onCancel={() => setPendingDeleteId(null)} onConfirm={() => { const id = pendingDeleteId; setPendingDeleteId(null); if (id) void remove(id); }}><p>{documents.find((document) => document.id === pendingDeleteId)?.documentName}</p></AppDialog>
      <AppDialog open={pendingForceId !== null} title="기존 검색 색인을 새 표 구조로 교체할까요?" confirmLabel="다시 색인" busy={indexingDocumentId === pendingForceId} onCancel={() => setPendingForceId(null)} onConfirm={() => { const id = pendingForceId; setPendingForceId(null); if (id) void retry(id, true); }}><p>OpenAI 사용량이 발생할 수 있습니다.</p></AppDialog>
      <header className="page-header knowledge-header">
        <div>
          <span className="section-kicker">PHASE 2 · 승인된 자료만 근거로 사용</span>
          <h1>지식관리</h1>
          <p>행정자료를 등록하고, 실제 검색 근거와 답변 제한이 올바르게 작동하는지 확인합니다.</p>
        </div>
        <div className="knowledge-config">
          <span className={`config-dot ${configured ? "ready" : ""}`} />
          <span><strong>{configured ? "OpenAI 연결됨" : "OpenAI 설정 필요"}</strong><small>Responses API · File Search</small></span>
        </div>
      </header>

      {!configured && (
        <div className="config-banner">
          <strong>[확인 필요] OpenAI API 키</strong>
          <span>키 설정 전에도 파일 원본과 메타데이터는 저장되며, Vector Store 색인은 설정 후 다시 시도할 수 있습니다.</span>
        </div>
      )}

      <section className="knowledge-grid">
        <form className="knowledge-upload-card" onSubmit={upload}>
          <div className="card-title">
            <div><span className="section-kicker">01 · 자료 등록</span><h2>행정 지식자료 추가</h2></div>
            <span className="safe-badge">원본 R2 보관</span>
          </div>
          <button
            type="button"
            className={`knowledge-drop ${isDragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              chooseFile(event.dataTransfer.files[0] || null);
            }}
          >
            <span className="drop-glyph">{file ? "✓" : "＋"}</span>
            <span><strong>{file ? file.name : "파일을 끌어놓거나 선택하세요"}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)}MB · ${file.size > PROTOTYPE_MAX_FILE_SIZE ? "대용량 원본 저장" : "등록 가능"}` : "PDF · DOCX · XLSX · XLSM · CSV · TXT · MD / 원본 200MB 이하"}</small></span>
          </button>
          <input ref={inputRef} type="file" name="file" accept=".pdf,.docx,.xlsx,.xlsm,.csv,.txt,.md" hidden onChange={(event) => chooseFile(event.target.files?.[0] || null)} />

          <div className="metadata-grid">
            <label><span>문서명</span><input name="documentName" value={documentName} onChange={(event) => setDocumentName(event.target.value)} placeholder="파일을 선택하면 자동 입력됩니다" required /></label>
            <label><span>분류</span><select name="category" defaultValue="계약" required>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label><span>기준연도</span><input name="year" type="number" min="2000" max="2100" defaultValue={new Date().getFullYear()} /></label>
            <label><span>적용 시작일</span><input name="effectiveFrom" type="date" /></label>
            <label><span>적용 종료일</span><input name="effectiveTo" type="date" /></label>
          </div>
          <label className="defer-indexing-option"><input type="checkbox" name="deferIndexing" value="true" defaultChecked aria-label="지금은 원본만 저장" /><span><strong>지금은 원본만 저장</strong><small>{file && file.size > PROTOTYPE_MAX_FILE_SIZE ? "대용량 원본은 먼저 보관하고 검색용 분할 처리는 별도로 진행합니다." : "토큰을 사용하지 않고 업로드한 뒤, 나중에 ‘재시도’로 검색 색인을 진행합니다."}</small></span></label>
          <div className="form-footer">
            <span role="status" aria-live="polite">{uploading && uploadProgress !== null ? `대용량 원본 전송 중… ${uploadProgress}%` : uploadMessage || "15MB 초과 파일은 원본 저장 후 검색용 분할 처리가 필요합니다."}</span>
            <button className="primary-button" disabled={uploading || !file}>{uploading ? (uploadProgress !== null ? `${uploadProgress}% 전송 중` : "등록 중…") : "지식자료 등록"}</button>
          </div>
        </form>

        <form className="knowledge-test-card" onSubmit={testKnowledge}>
          <div className="card-title">
            <div><span className="section-kicker">02 · 지식 테스트</span><h2>근거 제한 확인</h2></div>
            <span className="guard-badge">엄격 모드</span>
          </div>
          <p className="test-helper">등록된 자료에서 직접 확인되는 내용만 답합니다. 인용 근거가 없으면 고정 문구를 반환합니다.</p>
          <label className="question-box"><span>테스트 질문</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="예: 2026년 산업안전보건관리비 적용 기준은?" rows={4} /></label>
          <button className="test-button" disabled={testing || !question.trim()}>{testing ? "근거 검색 중…" : "등록 지식으로 답변 테스트"}</button>
          <div className={`answer-box ${answer ? "visible" : ""}`}>
            <span className="answer-label">AI 답변</span>
            <p>{answer || "테스트 결과가 여기에 표시됩니다."}</p>
            {sources.length > 0 && <div className="source-list"><strong>확인 근거</strong>{sources.map((source) => <span key={source.documentId}>↳ {source.documentName} <small>{source.filename}</small></span>)}</div>}
          </div>
        </form>
      </section>

      <section className="knowledge-library">
        <div className="library-heading">
          <div><span className="section-kicker">등록 자료</span><h2>지식 라이브러리</h2></div>
          <span className="total-badge">전체 {documents.length}건</span>
        </div>
        {documents.length === 0 ? (
          <div className="empty-library"><span>□</span><strong>등록된 지식자료가 없습니다.</strong><p>위 등록 영역에서 테스트 자료를 먼저 추가해 주세요.</p></div>
        ) : (
          <div className="knowledge-table">
            <div className="knowledge-table-head"><span>문서</span><span>분류</span><span>기준/적용기간</span><span>검색 상태</span><span>등록일</span><span /></div>
            {orderedDocuments.map((document) => (
              <div className="knowledge-table-row" key={document.id}>
                <span className="document-cell"><strong>{document.documentName}</strong><small>{document.originalName} · {(document.sizeBytes / 1024).toFixed(1)}KB</small></span>
                <span><span className="category-pill">{document.category}</span></span>
                <span className="period-cell"><strong>{document.year ? `${document.year}년` : "[확인 필요]"}</strong><small>{document.effectiveFrom || "시작일 미지정"} ~ {document.effectiveTo || "종료일 미지정"}</small></span>
                <span><span className={`index-status status-${document.status.toLowerCase()}`}>{statusLabel[document.status] || document.status}</span>{document.errorMessage && <small className="row-error">{document.errorMessage}</small>}</span>
                <span className="uploaded-cell">{new Date(document.uploadedAt).toLocaleDateString("ko-KR")}</span>
                <span className="row-actions">
                  {document.status === "READY" && <button type="button" className="retry-button" disabled={indexingDocumentId === document.id} onClick={() => setPendingForceId(document.id)}>{indexingDocumentId === document.id ? "색인 중…" : "다시 색인"}</button>}
                  {document.status !== "READY" && document.status !== "LARGE_FILE_STORED" && <button type="button" className="retry-button" disabled={indexingDocumentId === document.id} onClick={() => retry(document.id)}>{indexingDocumentId === document.id ? "색인 중…" : "재시도"}</button>}
                  <button type="button" className="delete-button" onClick={() => setPendingDeleteId(document.id)} aria-label={`${document.documentName} 삭제`}>삭제</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
