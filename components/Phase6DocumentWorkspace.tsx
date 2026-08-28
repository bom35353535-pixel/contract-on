"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ContractDocumentFileRecord, ContractDocumentReviewItemRecord, ContractDocumentReviewRecord } from "@/db/schema";
import type { DocumentStage } from "@/lib/contract-document-review";

type Props = {
  contractId: string;
  currentStage: string;
  documentStage: DocumentStage;
  files: ContractDocumentFileRecord[];
  review: ContractDocumentReviewRecord | null;
  items: ContractDocumentReviewItemRecord[];
  ddayLabel?: string;
  isStartDay?: boolean;
};

const STATUS_INFO = {
  SUBMITTED: { icon: "✓", label: "제출완료", className: "submitted" },
  MISSING: { icon: "!", label: "누락", className: "missing" },
  CHECK: { icon: "?", label: "확인필요", className: "check" },
} as const;

export function Phase6DocumentWorkspace({ contractId, currentStage, documentStage, files, review, items, ddayLabel, isStartDay }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editable = currentStage === documentStage;
  const isContract = documentStage === "NARA_CONTRACT";
  const title = isContract ? "나라장터 계약서류" : "착공계·착공서류";
  const completeLabel = isContract ? "나라장터 계약 완료" : "착공 확인 완료";

  async function analyze() {
    if (!selected.length) { setError("분석할 서류를 한 개 이상 선택해 주세요."); return; }
    setBusy("analyze"); setError(""); setMessage("");
    const form = new FormData();
    form.set("documentStage", documentStage);
    selected.forEach((file) => form.append("files", file));
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase6-documents`, { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "서류를 분석하지 못했습니다.");
      setSelected([]);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("서류 판독과 등록자료 기준 비교를 완료했습니다.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "서류를 분석하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function complete() {
    if (!review) { setError("먼저 서류를 업로드하고 분석 결과를 확인해 주세요."); return; }
    const caution = review.missingCount || review.checkCount
      ? `\n누락 ${review.missingCount}건, 확인필요 ${review.checkCount}건이 있습니다.`
      : "";
    if (!window.confirm(`분석 결과를 담당자가 확인하셨나요?${caution}\n실제 행정처리를 완료한 경우에만 '${completeLabel}'를 선택하세요.`)) return;
    setBusy("complete"); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase6-documents`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentStage }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "단계를 변경하지 못했습니다.");
      setMessage("담당자 확인과 업무단계 변경을 저장했습니다.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "단계를 변경하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  return <>
    <section className="phase6-workspace-head">
      <div><span className="section-kicker">Phase 6 · {isContract ? "계약" : "착공"} 관리</span><h2>{title}</h2><p>여러 서류를 한 번에 올리면 AI가 문서 종류를 판독하고, 등록된 지식자료의 제출 기준과 비교합니다.</p></div>
      <span className="human-check-badge">담당자 최종확정</span>
    </section>

    {!isContract && <section className={`start-day-card ${isStartDay ? "today" : ""}`}>
      <div><span className="start-day-label">착공 일정</span><strong>{ddayLabel || "일정 확인 필요"}</strong></div>
      <p>{isStartDay ? "오늘은 착공일입니다. 착공계를 제출하고 착공서류를 확인하세요." : "착공계 제출 후 등록자료 기준에 따라 착공서류를 확인하세요."}</p>
    </section>}

    {message && <div className="document-message success" role="status">{message}</div>}
    {error && <div className="document-message error" role="alert">{error}</div>}

    <section className={`phase6-upload-card ${!editable ? "locked" : ""}`}>
      <div className="phase6-card-heading"><div><span className="document-step">01</span><div><span className="section-kicker">복수 업로드</span><h3>{title} 분석</h3></div></div><span className={`document-status ${editable ? "current" : "confirmed"}`}>{editable ? "업로드 가능" : "단계 완료"}</span></div>
      {editable ? <>
        <label className="phase6-file-picker">
          <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.xlsx,.xls,.csv,.txt" onChange={(event) => setSelected(Array.from(event.target.files || []))} />
          <span>PDF·문서·표 파일 선택</span><small>최대 10개 · 파일당 20MB · 전체 50MB</small>
        </label>
        {selected.length > 0 && <ul className="selected-document-list">{selected.map((file, index) => <li key={`${file.name}-${index}`}><span>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(2)}MB</small></li>)}</ul>}
        <button className="phase6-analyze-button" type="button" disabled={!!busy || !selected.length} onClick={analyze}>{busy === "analyze" ? "서류 판독 중…" : "선택한 서류 분석"}</button>
      </> : <p className="phase6-readonly-note">이 업무단계는 완료되었습니다. 기존 분석 결과는 계속 확인할 수 있습니다.</p>}
      {files.length > 0 && <details className="uploaded-document-details"><summary>업로드된 서류 {files.length}개</summary><ul>{files.map((file) => <li key={file.id}><div><strong>{file.originalName}</strong><small>{file.detectedType || "문서 종류 확인 필요"}</small></div><span className={file.detectionStatus === "EXACT" ? "exact" : "uncertain"}>{file.detectionStatus === "EXACT" ? "판독완료" : "확인필요"}</span></li>)}</ul></details>}
    </section>

    <section className="phase6-results-card">
      <div className="phase6-card-heading"><div><span className="document-step">02</span><div><span className="section-kicker">등록자료 기준 비교</span><h3>제출서류 확인 결과</h3></div></div>{review && <small className="review-time">{review.createdAt.slice(0, 10)} 분석</small>}</div>
      {!review ? <div className="phase6-empty-result">서류를 업로드하면 제출완료·누락·확인필요로 구분해 표시합니다.</div> : <>
        {review.warning && <div className="review-warning">{review.warning}</div>}
        <div className="phase6-summary-grid">
          <div className="phase6-summary submitted"><span>✓</span><div><strong>{review.submittedCount}</strong><small>제출완료</small></div></div>
          <div className="phase6-summary missing"><span>!</span><div><strong>{review.missingCount}</strong><small>누락</small></div></div>
          <div className="phase6-summary check"><span>?</span><div><strong>{review.checkCount}</strong><small>확인필요</small></div></div>
        </div>
        <div className="phase6-checklist">{items.map((item) => {
          const status = STATUS_INFO[item.status as keyof typeof STATUS_INFO] || STATUS_INFO.CHECK;
          const uploaded = files.find((file) => file.id === item.uploadedFileId);
          return <details className={`phase6-check-row ${status.className}`} key={item.id}>
            <summary><span className="phase6-status-icon">{status.icon}</span><div><strong>{item.requiredName}</strong><small>{uploaded ? `업로드: ${uploaded.originalName}` : item.detail}</small></div><span className="phase6-status-label">{status.label}</span><span className="result-open">⌄</span></summary>
            <div className="phase6-check-detail"><p>{item.detail}</p>{item.evidenceDocumentName ? <div className="phase6-evidence"><strong>등록자료 근거 · {item.evidenceDocumentName}{item.evidenceYear ? ` (${item.evidenceYear})` : ""}</strong>{item.evidenceLocation && <small>{item.evidenceLocation}</small>}<p>{item.evidenceExcerpt}</p></div> : <div className="phase6-evidence no-evidence">등록자료 직접 근거 없음 · 담당자 확인 필요</div>}</div>
          </details>;
        })}</div>
      </>}
    </section>

    {editable && <section className="phase6-confirm-bar"><div><strong>분석 결과 확인 후 실제 행정처리를 완료하셨나요?</strong><small>AI 판독은 보조자료이며 최종 단계변경은 담당자가 확인합니다.</small></div><button type="button" disabled={!!busy || !review} onClick={complete}>{busy === "complete" ? "처리 중…" : completeLabel}</button></section>}
  </>;
}
