"use client";

import { useRef, useState } from "react";

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
  FAILED: "처리 실패",
};

export function KnowledgeManager({ initialDocuments, configured }: { initialDocuments: KnowledgeDocument[]; configured: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [testing, setTesting] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);

  function chooseFile(next: File | null) {
    setFile(next);
    setUploadMessage("");
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setUploadMessage("등록할 파일을 선택해 주세요.");
    setUploading(true);
    setUploadMessage("");
    const form = new FormData(event.currentTarget);
    form.set("file", file);
    try {
      const response = await fetch("/api/knowledge", { method: "POST", body: form });
      const payload = await response.json() as { document?: KnowledgeDocument; error?: string; message?: string };
      if (!response.ok || !payload.document) throw new Error(payload.error || "자료를 등록하지 못했습니다.");
      setDocuments((current) => [payload.document!, ...current]);
      setFile(null);
      event.currentTarget.reset();
      setUploadMessage(payload.message || "지식자료를 등록했습니다.");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "자료를 등록하지 못했습니다.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(documentId: string) {
    if (!window.confirm("이 자료를 지식검색에서 삭제할까요?")) return;
    const response = await fetch(`/api/knowledge/${documentId}`, { method: "DELETE" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return window.alert(payload.error || "자료를 삭제하지 못했습니다.");
    setDocuments((current) => current.filter((document) => document.id !== documentId));
  }

  async function retry(documentId: string) {
    const response = await fetch(`/api/knowledge/${documentId}/retry`, { method: "POST" });
    const payload = await response.json() as { document?: KnowledgeDocument; error?: string };
    if (!response.ok || !payload.document) return window.alert(payload.error || "색인을 다시 시도하지 못했습니다.");
    setDocuments((current) => current.map((document) => document.id === documentId ? payload.document! : document));
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
            <span><strong>{file ? file.name : "파일을 끌어놓거나 선택하세요"}</strong><small>PDF · DOCX · XLSX · CSV · TXT / 프로토타입 15MB 제한</small></span>
          </button>
          <input ref={inputRef} type="file" name="file" accept=".pdf,.docx,.xlsx,.csv,.txt" hidden onChange={(event) => chooseFile(event.target.files?.[0] || null)} />

          <div className="metadata-grid">
            <label><span>문서명</span><input name="documentName" placeholder={file?.name.replace(/\.[^.]+$/, "") || "예: 2026년 시설공사 제비율"} required /></label>
            <label><span>분류</span><select name="category" defaultValue="계약" required>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label><span>기준연도</span><input name="year" type="number" min="2000" max="2100" defaultValue={new Date().getFullYear()} /></label>
            <label><span>적용 시작일</span><input name="effectiveFrom" type="date" /></label>
            <label><span>적용 종료일</span><input name="effectiveTo" type="date" /></label>
          </div>
          <div className="form-footer">
            <span>{uploadMessage || "표 파일은 검색용 텍스트 사본도 함께 생성합니다."}</span>
            <button className="primary-button" disabled={uploading || !file}>{uploading ? "등록 중…" : "지식자료 등록"}</button>
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
            {documents.map((document) => (
              <div className="knowledge-table-row" key={document.id}>
                <span className="document-cell"><strong>{document.documentName}</strong><small>{document.originalName} · {(document.sizeBytes / 1024).toFixed(1)}KB</small></span>
                <span><span className="category-pill">{document.category}</span></span>
                <span className="period-cell"><strong>{document.year ? `${document.year}년` : "[확인 필요]"}</strong><small>{document.effectiveFrom || "시작일 미지정"} ~ {document.effectiveTo || "종료일 미지정"}</small></span>
                <span><span className={`index-status status-${document.status.toLowerCase()}`}>{statusLabel[document.status] || document.status}</span>{document.errorMessage && <small className="row-error">{document.errorMessage}</small>}</span>
                <span className="uploaded-cell">{new Date(document.uploadedAt).toLocaleDateString("ko-KR")}</span>
                <span className="row-actions">
                  {document.status !== "READY" && <button type="button" className="retry-button" onClick={() => retry(document.id)}>재시도</button>}
                  <button type="button" className="delete-button" onClick={() => remove(document.id)} aria-label={`${document.documentName} 삭제`}>삭제</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
