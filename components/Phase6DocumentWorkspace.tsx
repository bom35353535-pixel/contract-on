"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ContractDocumentFileRecord, ContractDocumentReviewItemRecord, ContractDocumentReviewRecord } from "@/db/schema";
import type { DocumentStage } from "@/lib/contract-document-review";
import { maskContractDocumentInBrowser, type PrivacyMaskCounts } from "@/lib/browser-privacy-mask";
import { CONTRACT_STAGES, isContractStage, STAGE_INFO } from "@/lib/workflow";
import { ManualPdfRedactor } from "@/components/ManualPdfRedactor";

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

type PrivacyState = {
  status: "pending" | "masked" | "review-required" | "reviewed" | "manual-required" | "manual-confirmed";
  file?: File;
  counts?: PrivacyMaskCounts;
  reason?: string;
};

export function Phase6DocumentWorkspace({ contractId, currentStage, documentStage, files, review, items, ddayLabel, isStartDay }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File[]>([]);
  const [privacyStates, setPrivacyStates] = useState<PrivacyState[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showCompletionNotice, setShowCompletionNotice] = useState(false);
  const [completionConfirmOpen, setCompletionConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ContractDocumentFileRecord | null>(null);
  const [manualMaskIndex, setManualMaskIndex] = useState<number | null>(null);
  const editable = currentStage === documentStage;
  const currentStageIndex = isContractStage(currentStage) ? CONTRACT_STAGES.indexOf(currentStage) : -1;
  const documentStageIndex = CONTRACT_STAGES.indexOf(documentStage);
  const isFutureStage = currentStageIndex >= 0 && currentStageIndex < documentStageIndex;
  const isPastStage = currentStageIndex > documentStageIndex;
  const canUpload = editable || isFutureStage;
  const isContract = documentStage === "NARA_CONTRACT";
  const isCompletion = documentStage === "COMPLETION";
  const requiresPrivacyMask = true;
  const privacyDocumentLabel = isContract ? "계약서류" : isCompletion ? "준공서류" : "착공서류";
  const title = isContract ? "계약서류" : isCompletion ? "준공계·준공서류" : "착공계·착공서류";
  const completeLabel = isContract ? "계약 완료" : isCompletion ? "준공서류 확인 완료" : "착공 확인 완료";

  function selectFiles(files: File[]) {
    setSelected(files);
    setPrivacyStates(files.map(() => ({ status: "pending" })));
  }

  async function maskSensitiveFiles() {
    if (!selected.length || busy) return;
    setBusy("mask"); setError(""); setMessage("");
    try {
      const next = await Promise.all(selected.map(async (file): Promise<PrivacyState> => {
        const result = await maskContractDocumentInBrowser(file, privacyDocumentLabel, (progress) => setMessage(`${file.name} · ${progress}`));
        if (!result.supported) return { status: "manual-required", reason: result.reason };
        return { status: result.requiresReview ? "review-required" : "masked", file: result.file, counts: result.counts };
      }));
      setPrivacyStates(next);
      const maskedCount = next.filter((state) => state.status === "masked" || state.status === "review-required").length;
      const manualCount = next.filter((state) => state.status === "manual-required").length;
      const reviewCount = next.filter((state) => state.status === "review-required").length;
      setMessage(manualCount
        ? `자동 마스킹 ${maskedCount}개 완료 · 직접 가린 사본 확인이 필요한 파일 ${manualCount}개`
        : reviewCount
          ? `PDF 자동 마스킹 ${reviewCount}개 완료 · 마스킹된 PDF를 열어 확인해 주세요.`
          : `${privacyDocumentLabel} 개인정보 보호 확인을 완료했습니다. 분석 시 보호 처리된 사본만 전송됩니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "개인정보 마스킹에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  function confirmManualMask(index: number, checked: boolean) {
    setPrivacyStates((current) => current.map((state, stateIndex) => stateIndex === index
      ? { ...state, status: checked ? "manual-confirmed" : "manual-required" }
      : state));
  }

  function confirmAutoMask(index: number, checked: boolean) {
    setPrivacyStates((current) => current.map((state, stateIndex) => stateIndex === index
      ? { ...state, status: checked ? "reviewed" : "review-required" }
      : state));
  }

  function openMaskedPdf(index: number) {
    const file = privacyStates[index]?.file;
    if (!file) return;
    const url = URL.createObjectURL(file);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function applyManualMask(index: number, file: File, regionCount: number) {
    setPrivacyStates((current) => current.map((state, stateIndex) => stateIndex === index
      ? { ...state, status: "manual-confirmed", file, reason: undefined }
      : state));
    setManualMaskIndex(null);
    setMessage(`${file.name} · 직접 지정한 개인정보 영역 ${regionCount}개를 마스킹했습니다.`);
  }

  async function analyze() {
    if (!selected.length && !files.length) { setError("분석할 서류를 한 개 이상 선택해 주세요."); return; }
    if (!selected.length && files.length) {
      setBusy("analyze"); setError(""); setMessage("");
      try {
        const response = await fetch(`/api/contracts/${contractId}/phase6-documents`, {
          method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentStage }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "업로드된 서류를 다시 확인하지 못했습니다.");
        setMessage("업로드된 서류를 다시 확인했습니다.");
        setShowCompletionNotice(true);
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "업로드된 서류를 다시 확인하지 못했습니다.");
      } finally {
        setBusy("");
      }
      return;
    }
    const unprotected = requiresPrivacyMask ? selected.findIndex((_file, index) => !["masked", "reviewed", "manual-confirmed"].includes(privacyStates[index]?.status)) : -1;
    if (unprotected >= 0) { setError(`${selected[unprotected].name}: 개인정보 마스킹을 완료하거나 이미 가린 사본임을 확인해 주세요.`); return; }
    setBusy("analyze"); setError(""); setMessage("");
    const form = new FormData();
    form.set("documentStage", documentStage);
    if (requiresPrivacyMask) form.set("privacyConfirmed", "true");
    selected.forEach((file, index) => form.append("files", privacyStates[index]?.file ?? file));
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase6-documents`, { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "서류를 분석하지 못했습니다.");
      setSelected([]);
      setPrivacyStates([]);
      if (inputRef.current) inputRef.current.value = "";
      setMessage(`마스킹 사본의 전체 페이지를 읽어 포함된 ${privacyDocumentLabel} 종류를 확인했습니다.`);
      setShowCompletionNotice(true);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "서류를 분석하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function complete() {
    if (!review && !isContract) { setError("먼저 서류를 업로드하고 분석 결과를 확인해 주세요."); return; }
    setCompletionConfirmOpen(false);
    setBusy("complete"); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase6-documents`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentStage }),
      });
      const result = await response.json() as { error?: string; nextStage?: string };
      if (!response.ok) throw new Error(result.error || "단계를 변경하지 못했습니다.");
      if (result.nextStage === "COMMITMENT") {
        window.location.assign(`/contracts/${contractId}?tab=commitment`);
      } else if (result.nextStage === "IN_CONSTRUCTION") {
        window.location.assign(`/contracts/${contractId}?tab=construction`);
      } else if (result.nextStage === "INSPECTION") {
        window.location.assign(`/contracts/${contractId}?tab=inspection`);
      } else {
        window.location.reload();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "단계를 변경하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function deleteUploadedFile() {
    if (!pendingDelete || busy) return;
    setBusy("delete"); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase6-documents`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: pendingDelete.id, documentStage }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "파일을 삭제하지 못했습니다.");
      setPendingDelete(null);
      setMessage("업로드된 파일을 삭제했습니다. 남은 파일을 다시 확인해 주세요.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "파일을 삭제하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  return <>
    {manualMaskIndex !== null && selected[manualMaskIndex] && <ManualPdfRedactor file={selected[manualMaskIndex]} onCancel={() => setManualMaskIndex(null)} onApply={(file, count) => applyManualMask(manualMaskIndex, file, count)} />}
    {pendingDelete && <div className="action-confirm-backdrop" role="presentation" onMouseDown={() => !busy && setPendingDelete(null)}><section className="action-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-uploaded-file-title" onMouseDown={(event) => event.stopPropagation()}><h2 id="delete-uploaded-file-title">업로드된 파일을 삭제할까요?</h2><p><strong>{pendingDelete.originalName}</strong></p><p>파일을 삭제하면 이 단계의 기존 서류 확인 결과도 초기화됩니다.</p><div className="action-confirm-actions"><button type="button" disabled={!!busy} onClick={() => setPendingDelete(null)}>취소</button><button className="danger" type="button" disabled={!!busy} onClick={deleteUploadedFile}>{busy === "delete" ? "삭제 중…" : "파일 삭제"}</button></div></section></div>}
    {completionConfirmOpen && <div className="action-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setCompletionConfirmOpen(false); }}><section className="action-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="phase6-complete-confirm-title" aria-describedby="phase6-complete-confirm-description"><h2 id="phase6-complete-confirm-title">{completeLabel}</h2><p id="phase6-complete-confirm-description">{review ? "분석 결과를 확인하고 실제 행정처리를 완료한 경우에만 진행해 주세요." : "계약서류 분석 결과는 없습니다. 실제 계약 체결을 완료한 경우에만 진행해 주세요."}</p>{review && (review.missingCount > 0 || review.checkCount > 0) && <p>누락 {review.missingCount}건, 확인필요 {review.checkCount}건이 있습니다.</p>}<div className="action-confirm-actions"><button type="button" disabled={!!busy} onClick={() => setCompletionConfirmOpen(false)}>취소</button><button className="primary" type="button" autoFocus disabled={!!busy} onClick={() => void complete()}>{busy === "complete" ? "처리 중…" : "완료 확인"}</button></div></section></div>}
    {showCompletionNotice && <div className="action-confirm-backdrop" role="presentation" onMouseDown={() => setShowCompletionNotice(false)}><section className="action-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="document-check-complete-title" onMouseDown={(event) => event.stopPropagation()}><h2 id="document-check-complete-title">서류 확인이 완료되었습니다.</h2><div className="action-confirm-actions"><button className="primary" type="button" autoFocus onClick={() => setShowCompletionNotice(false)}>확인</button></div></section></div>}
    <section className="phase6-workspace-head">
      <div><span className="section-kicker">{isCompletion ? "Phase 7 · 준공 관리" : `Phase 6 · ${isContract ? "계약" : "착공"} 관리`}</span><h2>{title}</h2><p>묶음 파일의 전체 페이지를 읽어 포함된 여러 서류를 자동으로 구분하고 등록자료의 제출 기준과 비교합니다.</p></div>
      <span className="human-check-badge">담당자 최종확정</span>
    </section>

    {!isContract && <section className={`start-day-card ${isStartDay ? "today" : ""}`}>
      <div><span className="start-day-label">{isCompletion ? "준공 일정" : "착공 일정"}</span><strong>{ddayLabel || "일정 확인 필요"}</strong></div>
      <p>{isCompletion
        ? isStartDay ? "오늘은 계약상 준공일입니다. 준공계 송부 여부와 준공서류를 확인하세요." : "준공계 접수 후 등록자료 기준에 따라 준공서류를 확인하세요."
        : isStartDay ? "오늘은 착공일입니다. 착공계를 제출하고 착공서류를 확인하세요." : "착공계 제출 후 등록자료 기준에 따라 착공서류를 확인하세요."}</p>
    </section>}

    {message && <div className="document-message success" role="status">{message}</div>}
    {error && <div className="document-message error" role="alert">{error}</div>}
    <div className="private-document-notice" role="note"><strong>🔒 {privacyDocumentLabel} 분석에는 개인정보를 가린 사본만 사용합니다.</strong><span>원본을 직접 선택하더라도 마스킹 확인 전에는 저장소나 분석 서비스로 전송하지 않습니다.</span></div>

    <section className={`phase6-upload-card ${!canUpload ? "locked" : ""}`}>
      <div className="phase6-card-heading"><div><span className="document-step">01</span><div><span className="section-kicker">복수 업로드</span><h3>{title} 분석</h3></div></div><span className={`document-status ${editable ? "current" : isFutureStage ? "upcoming" : "confirmed"}`}>{editable ? "업로드 가능" : isFutureStage ? "사전 업로드 가능" : isPastStage ? "단계 완료" : "단계 확인 필요"}</span></div>
      {isFutureStage && <div className="phase6-upcoming-notice"><strong>현재 단계: {STAGE_INFO[currentStage as keyof typeof STAGE_INFO].label}</strong><span>{title}는 미리 업로드·분석할 수 있습니다. 단계 완료 처리는 해당 업무단계에 도달한 뒤 가능합니다.</span></div>}
      {canUpload ? <>
        <label className="phase6-file-picker">
          <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.xlsx,.xls,.csv,.txt" onChange={(event) => selectFiles(Array.from(event.target.files || []))} />
          <span>PDF·문서·표 파일 선택</span><small>최대 10개 · 파일당 20MB · 전체 50MB · 전송 전 개인정보 보호 확인</small>
        </label>
        {selected.length > 0 && <ul className="selected-document-list">{selected.map((file, index) => { const privacy = privacyStates[index]; const autoReview = privacy?.status === "review-required" || privacy?.status === "reviewed"; const isPdf = file.name.toLowerCase().endsWith(".pdf"); return <li key={`${file.name}-${index}`}><span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)}MB{requiresPrivacyMask ? " · 묶음 전체 판독" : ""}</small>{requiresPrivacyMask && privacy?.status === "masked" && <small className="privacy-inline-ok">자동 마스킹 완료 · 계좌번호 {privacy.counts?.account || 0}건 · 주민등록번호 {privacy.counts?.residentRegistration || 0}건</small>}{requiresPrivacyMask && autoReview && <small className="privacy-inline-ok">PDF 자동 마스킹 완료 · 계좌번호 {privacy.counts?.account || 0}건 · 주민등록번호 {privacy.counts?.residentRegistration || 0}건</small>}{requiresPrivacyMask && privacy?.status === "manual-required" && <small className="privacy-inline-warning">{privacy.reason}</small>}{requiresPrivacyMask && privacy?.status === "manual-confirmed" && <small className="privacy-inline-ok">직접 지정한 영역 마스킹 완료</small>}</span>{requiresPrivacyMask && isPdf && <button className="manual-redact-open" type="button" disabled={!!busy} onClick={() => setManualMaskIndex(index)}>직접 드래그 마스킹</button>}{requiresPrivacyMask && autoReview && <div className="auto-mask-review"><button type="button" onClick={() => openMaskedPdf(index)}>마스킹된 PDF 확인</button><label><input type="checkbox" checked={privacy.status === "reviewed"} onChange={(event) => confirmAutoMask(index, event.target.checked)} /><span>마스킹 결과를 확인했습니다</span></label></div>}{requiresPrivacyMask && !isPdf && (privacy?.status === "manual-required" || privacy?.status === "manual-confirmed") && <label className="manual-mask-confirm"><input type="checkbox" checked={privacy.status === "manual-confirmed"} onChange={(event) => confirmManualMask(index, event.target.checked)} /><span>계좌번호·주민등록번호를 직접 가린 사본입니다</span></label>}</li>; })}</ul>}
        <div className="contract-privacy-panel" role="note"><div><strong>업로드 전 개인정보 보호</strong><p>자동 탐지를 사용하거나, PDF에서 개인정보 부분을 마우스로 직접 드래그해 가릴 수 있습니다. 선택한 원본은 마스킹 확인 전까지 브라우저 밖으로 전송되지 않습니다.</p>{!selected.length && <small>먼저 PDF 또는 문서 파일을 선택해 주세요.</small>}</div><button type="button" disabled={!!busy || !selected.length} onClick={maskSensitiveFiles}>{busy === "mask" ? "PDF 마스킹 중…" : "개인정보 자동 마스킹"}</button></div>
        <button className="phase6-analyze-button" type="button" disabled={!!busy || (!selected.length && !files.length)} onClick={analyze}>{busy === "analyze" ? "서류 확인 중…" : selected.length ? "선택한 서류 확인" : "업로드된 서류 다시 확인"}</button>
      </> : <p className="phase6-readonly-note">{isPastStage ? "이 업무단계는 완료되었습니다. 기존 분석 결과는 계속 확인할 수 있습니다." : "현재 계약단계를 확인한 뒤 다시 시도해 주세요."}</p>}
      {files.length > 0 && <details className="uploaded-document-details"><summary>업로드된 파일 {files.length}개</summary><ul>{files.map((file) => <li key={file.id}><strong>{file.originalName}</strong>{canUpload && <div className="uploaded-document-actions"><button type="button" disabled={!!busy} onClick={() => setPendingDelete(file)} aria-label={`${file.originalName} 삭제`}>삭제</button></div>}</li>)}</ul></details>}
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
            <div className="phase6-check-detail"><p>{item.detail}</p>{item.evidenceDocumentName ? <div className="phase6-evidence"><strong>등록자료 근거 · {item.evidenceDocumentName}{item.evidenceYear ? ` (${item.evidenceYear})` : ""}</strong>{item.evidenceLocation && <small>{item.evidenceLocation}</small>}<p>{item.evidenceExcerpt}</p></div> : <div className="phase6-evidence no-evidence">{item.status === "SUBMITTED" ? "업로드 및 문서 종류 확인 완료 · 필수 제출 기준 근거는 미확인" : "등록자료 직접 근거 없음 · 담당자 확인 필요"}</div>}</div>
          </details>;
        })}</div>
      </>}
    </section>

    {editable && <section className="phase6-confirm-bar"><div><strong>{review ? "확인 결과 검토 후 실제 행정처리를 완료하셨나요?" : "실제 계약 체결을 완료하셨나요?"}</strong><small>{review ? "자동분류는 보조자료이며 최종 단계변경은 담당자가 확인합니다." : "계약서류 분석 결과가 없어도 담당자가 실제 계약 체결 여부를 확인하여 다음 단계로 이동할 수 있습니다."}</small></div><button type="button" disabled={!!busy || (!review && !isContract)} onClick={() => setCompletionConfirmOpen(true)}>{busy === "complete" ? "처리 중…" : completeLabel}</button></section>}
  </>;
}
