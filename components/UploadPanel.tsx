"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { maskEstimateFileInBrowser, type BrowserMaskResult } from "@/lib/browser-privacy-mask";

const ACCEPTED = ".pdf,.xlsx,.xls,.docx,.csv";

export function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [masking, setMasking] = useState(false);
  const [maskResult, setMaskResult] = useState<Extract<BrowserMaskResult, { supported: true }> | null>(null);
  const [maskNotice, setMaskNotice] = useState("");

  function selectFile(selected?: File) {
    if (!selected) return;
    setFile(selected);
    setMaskResult(null);
    setMaskNotice("");
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
    <section className="upload-section" aria-labelledby="upload-title">
      <div className="upload-copy">
        <span className="section-kicker">새 계약업무 시작</span>
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
            <button className="analysis-button" type="button" disabled={!file || busy || masking} onClick={analyze}>{busy ? "분석 중…" : "견적서 분석하기"}</button>
          </div>
          {maskNotice && <div className={`privacy-mask-result ${maskResult ? "complete" : "notice"}`} role="status">{maskNotice}</div>}
          {maskResult && <small className="privacy-mask-security">분석 시 원본 대신 브라우저에서 만든 마스킹 사본만 전송됩니다.</small>}
        </div>
      </div>
    </section>
  );
}
