"use client";

import { useRef, useState } from "react";

const ACCEPTED = ".pdf,.xlsx,.xls,.docx,.csv";

export function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  function selectFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setNotice("파일을 선택했습니다. 실제 문서 분석은 Phase 3에서 연결됩니다.");
  }

  return (
    <section className="upload-section" aria-labelledby="upload-title">
      <div className="upload-copy">
        <span className="section-kicker">새 계약업무 시작</span>
        <h2 id="upload-title">이곳에 견적서를 첨부해주세요.</h2>
        <p>문서에 있는 정보는 한 번만 읽고, 계약 완료와 하자관리까지 이어집니다.</p>
        <div className="upload-tags"><span>PDF</span><span>XLSX</span><span>XLS</span><span>DOCX</span><span>CSV</span></div>
      </div>
      <div
        className={`drop-zone ${fileName ? "has-file" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files[0]); }}
      >
        <span className="upload-symbol">{fileName ? "✓" : "＋"}</span>
        <div>
          <strong>{fileName ?? "파일을 끌어놓거나 선택하세요"}</strong>
          <small>{notice || "AI 분석은 Phase 3에서 연결됩니다."}</small>
        </div>
        <input ref={inputRef} type="file" accept={ACCEPTED} hidden onChange={(event) => selectFile(event.target.files?.[0])} />
        <button type="button" onClick={() => inputRef.current?.click()}>{fileName ? "다시 선택" : "견적서 선택"}</button>
      </div>
      <button className="analysis-button" type="button" disabled={!fileName} onClick={() => setNotice("Phase 1에서는 화면만 확인합니다. 분석 기능은 Phase 3에서 구현합니다.")}>견적서 분석 시작</button>
    </section>
  );
}
