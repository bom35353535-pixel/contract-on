"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { maskEstimateFileInBrowser, type BrowserMaskResult } from "@/lib/browser-privacy-mask";

const ACCEPTED = ".pdf,.xlsx,.xls,.docx,.csv";

export function UploadPanel({ knowledgeReadyCount, knowledgePendingCount }: { knowledgeReadyCount: number; knowledgePendingCount: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [masking, setMasking] = useState(false);
  const [maskResult, setMaskResult] = useState<Extract<BrowserMaskResult, { supported: true }> | null>(null);
  const [maskNotice, setMaskNotice] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  function selectFile(selected?: File) {
    if (!selected) return;
    setFile(selected);
    setMaskResult(null);
    setMaskNotice("");
    setPreviewOpen(false);
    setNotice("파일을 선택했습니다. 분석을 시작하면 문서에 적힌 정보만 추출합니다.");
  }

  async function maskPrivacy() {
    if (!file || busy || masking) return;
    setMasking(true);
    setMaskResult(null);
    setMaskNotice("브라우저에서 개인정보를 확인하고 있습니다.");
    try {
      const result = await maskEstimateFileInBrowser(file);
      if (!result.supported) {
        setMaskNotice(result.reason);
        return;
      }
      setMaskResult(result);
      const total = result.counts.mobile + result.counts.email;
      setMaskNotice(total
        ? `개인정보 마스킹 완료 · 휴대전화번호 ${result.counts.mobile}건, 이메일 ${result.counts.email}건 마스킹`
        : "마스킹할 휴대전화번호 또는 이메일이 발견되지 않았습니다.");
    } catch (error) {
      setMaskNotice(error instanceof Error ? `브라우저에서 파일을 처리하지 못했습니다: ${error.message}` : "브라우저에서 파일을 처리하지 못했습니다.");
    } finally {
      setMasking(false);
    }
  }

  async function analyze() {
    if (!file || busy) return;
    setBusy(true);
    setNotice("AI가 견적서를 읽고 있습니다. 문서 크기에 따라 잠시 걸릴 수 있습니다.");
    const form = new FormData();
    form.set("file", maskResult?.file ?? file);
    try {
      const response = await fetch("/api/estimates", { method: "POST", body: form });
      const result = await response.json() as { analysisId?: string; error?: string };
      if (!response.ok || !result.analysisId) throw new Error(result.error || "견적서 분석에 실패했습니다.");
      router.push(`/estimates/${result.analysisId}?analysis=complete`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "견적서 분석에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <>
    <section className={`knowledge-first-home ${knowledgeReadyCount ? "ready" : "needs"}`}>
      <div className="knowledge-first-copy"><span className="workflow-step-number">1</span><div><span className="section-kicker">견적검토 준비</span><h2>지식자료를 먼저 등록하세요.</h2><p>{knowledgeReadyCount ? `검색 가능한 기준자료 ${knowledgeReadyCount}건이 준비되어 있습니다.` : knowledgePendingCount ? `원본 ${knowledgePendingCount}건은 저장되어 있으나 검색 색인이 필요합니다. 토큰이 준비되면 재시도할 수 있습니다.` : "계약·노임단가·제비율·자재가격 자료를 견적서보다 먼저 올릴 수 있습니다."}</p></div></div>
      <a href="/knowledge">지식관리 먼저 열기</a>
    </section>
    <section className="upload-section" aria-labelledby="upload-title">
      <div className="upload-copy">
        <span className="section-kicker">2 · 새 계약업무 시작</span>
        <h2 id="upload-title">이곳에 견적서를 첨부해주세요.</h2>
        <p>문서에 있는 정보는 한 번만 읽고, 계약 완료와 하자관리까지 이어집니다.</p>
        <div className="upload-tags"><span>PDF</span><span>XLSX</span><span>XLS</span><span>DOCX</span><span>CSV</span></div>
      </div>
      <div className="upload-workflow">
        <div className={`drop-zone ${file ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files[0]); }}>
          <span className="upload-symbol">{file ? "✓" : "＋"}</span>
          <div><strong>{file?.name ?? "파일을 끌어놓거나 선택하세요"}</strong><small>{notice || "문서에 없는 값은 비워두고 담당자가 확인합니다."}</small></div>
          <input ref={inputRef} type="file" accept={ACCEPTED} hidden onChange={(event) => selectFile(event.target.files?.[0])} />
          <button type="button" disabled={busy || masking} onClick={() => inputRef.current?.click()}>{file ? "다시 선택" : "견적서 선택"}</button>
        </div>
        <div className="privacy-mask-panel">
          <p>견적서에 휴대전화번호나 이메일 등 개인정보가 포함된 경우, 분석 전에 먼저 개인정보 마스킹을 진행해 주세요.</p>
          <div className="privacy-mask-actions">
            <button className="mask-button" type="button" disabled={!file || busy || masking} onClick={maskPrivacy}>{masking ? "마스킹 중…" : "개인정보 마스킹하기"}</button>
            <button className="preview-button" type="button" disabled={!maskResult || busy || masking} onClick={() => setPreviewOpen(true)}>마스킹된 견적서 확인</button>
            <button className="analysis-button" type="button" disabled={!file || busy || masking} onClick={analyze}>{busy ? "분석 중…" : "견적서 분석하기"}</button>
          </div>
          {maskNotice && <div className={`privacy-mask-result ${maskResult ? "complete" : "notice"}`} role="status">{maskNotice}</div>}
          {maskResult && <small className="privacy-mask-security">분석 시 원본 대신 브라우저에서 만든 마스킹 사본만 전송됩니다.</small>}
        </div>
      </div>
    </section>
    {previewOpen && maskResult && <div className="mask-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPreviewOpen(false); }}>
      <section className="mask-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="mask-preview-title">
        <div className="mask-preview-heading"><div><span className="section-kicker">브라우저 내부 미리보기</span><h2 id="mask-preview-title">마스킹된 견적서 확인</h2></div><button type="button" aria-label="미리보기 닫기" onClick={() => setPreviewOpen(false)}>×</button></div>
        <p>휴대전화번호와 이메일의 마스킹 상태를 확인해 주세요. 이 화면을 여는 동안 파일은 외부로 전송되지 않습니다.</p>
        <div className="mask-preview-summary"><strong>휴대전화번호 {maskResult.counts.mobile}건</strong><strong>이메일 {maskResult.counts.email}건</strong></div>
        <pre>{maskResult.preview || "표시할 텍스트가 없습니다. 원본 파일의 내용을 직접 확인해 주세요."}</pre>
        <div className="mask-preview-footer"><button type="button" onClick={() => setPreviewOpen(false)}>확인하고 닫기</button></div>
      </section>
    </div>}
    </>
  );
}
