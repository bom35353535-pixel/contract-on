"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ACCEPTED = ".pdf,.xlsx,.xls,.docx,.csv";

export function UploadPanel({ knowledgeReadyCount, knowledgePendingCount }: { knowledgeReadyCount: number; knowledgePendingCount: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function selectFile(selected?: File) {
    if (!selected) return;
    setFile(selected);
    setNotice("파일을 선택했습니다. 분석을 시작하면 문서에 적힌 정보만 추출합니다.");
  }

  async function analyze() {
    if (!file || busy) return;
    setBusy(true);
    setNotice("AI가 견적서를 읽고 있습니다. 문서 크기에 따라 잠시 걸릴 수 있습니다.");
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/estimates", { method: "POST", body: form });
      const result = await response.json() as { analysisId?: string; error?: string };
      if (!response.ok || !result.analysisId) throw new Error(result.error || "견적서 분석에 실패했습니다.");
      router.push(`/estimates/${result.analysisId}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "견적서 분석에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <>
    <section className={`knowledge-first-home ${knowledgeReadyCount ? "ready" : "needs"}`}>
      <div className="knowledge-first-copy"><span className="workflow-step-number">1</span><div><span className="section-kicker">견적검토 준비</span><h2>지식자료를 먼저 등록하세요.</h2><p>{knowledgeReadyCount ? `검색 가능한 기준자료 ${knowledgeReadyCount}건이 준비되어 있습니다.` : knowledgePendingCount ? `원본 ${knowledgePendingCount}건은 저장되어 있으나 검색 색인이 필요합니다. 토큰이 준비되면 재시도할 수 있습니다.` : "계약·노임단가·제비율·자재가격 자료를 견적서보다 먼저 올릴 수 있습니다."}</p></div></div>
      <Link href="/knowledge">지식관리 먼저 열기</Link>
    </section>
    <section className="upload-section" aria-labelledby="upload-title">
      <div className="upload-copy">
        <span className="section-kicker">2 · 새 계약업무 시작</span>
        <h2 id="upload-title">이곳에 견적서를 첨부해주세요.</h2>
        <p>문서에 있는 정보는 한 번만 읽고, 계약 완료와 하자관리까지 이어집니다.</p>
        <div className="upload-tags"><span>PDF</span><span>XLSX</span><span>XLS</span><span>DOCX</span><span>CSV</span></div>
      </div>
      <div className={`drop-zone ${file ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files[0]); }}>
        <span className="upload-symbol">{file ? "✓" : "＋"}</span>
        <div><strong>{file?.name ?? "파일을 끌어놓거나 선택하세요"}</strong><small>{notice || "문서에 없는 값은 비워두고 담당자가 확인합니다."}</small></div>
        <input ref={inputRef} type="file" accept={ACCEPTED} hidden onChange={(event) => selectFile(event.target.files?.[0])} />
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{file ? "다시 선택" : "견적서 선택"}</button>
      </div>
      <button className="analysis-button" type="button" disabled={!file || busy} onClick={analyze}>{busy ? "분석 중…" : "견적서 분석 시작"}</button>
    </section>
    </>
  );
}
