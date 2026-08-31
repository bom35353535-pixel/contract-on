"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConstructionChecklistItemRecord, ConstructionChecklistRunRecord } from "@/db/schema";

type Props = {
  contractId: string;
  currentStage: string;
  run: ConstructionChecklistRunRecord | null;
  items: ConstructionChecklistItemRecord[];
  ddayLabel: string;
  isCompletionDay: boolean;
};

const STATUS_LABEL = { PENDING: "미완료", COMPLETED: "완료", NOT_APPLICABLE: "해당없음" } as const;

export function Phase7ConstructionWorkspace({ contractId, currentStage, run, items, ddayLabel, isCompletionDay }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editable = currentStage === "IN_CONSTRUCTION";

  async function loadChecklist() {
    setBusy("load"); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase7-construction-checklist`, { method: "POST" });
      const result = await response.json() as { error?: string; warning?: string | null };
      if (!response.ok) throw new Error(result.error || "확인사항을 불러오지 못했습니다.");
      setMessage(result.warning || "등록자료 기준 공사중 확인사항을 불러왔습니다.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "확인사항을 불러오지 못했습니다.");
    } finally { setBusy(""); }
  }

  async function setStatus(itemId: string, status: keyof typeof STATUS_LABEL) {
    setBusy(itemId); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase7-construction-checklist`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId, status }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "체크상태를 저장하지 못했습니다.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "체크상태를 저장하지 못했습니다.");
    } finally { setBusy(""); }
  }

  async function completeConstruction() {
    const pending = items.filter((item) => item.status === "PENDING").length;
    if (!window.confirm(`준공계를 접수하고 공사중 확인을 마쳤나요?${pending ? `\n미완료 항목 ${pending}건이 있습니다.` : ""}\n확인하면 준공 단계로 이동합니다.`)) return;
    setBusy("complete"); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase7-actions`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete-construction" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "준공 단계로 변경하지 못했습니다.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "준공 단계로 변경하지 못했습니다.");
    } finally { setBusy(""); }
  }

  return <>
    <section className="phase7-head"><div><span className="section-kicker">Phase 7 · 공사중 관리</span><h2>공사중 확인사항</h2><p>체크내용은 등록된 지식자료에서 직접 근거가 확인된 항목만 표시합니다.</p></div><span className="human-check-badge">담당자 상태확인</span></section>
    <section className={`completion-day-card ${isCompletionDay ? "today" : ""}`}><div><span>준공 일정</span><strong>{ddayLabel}</strong></div><p>{isCompletionDay ? "오늘은 계약상 준공일입니다. 준공계 송부 여부를 확인해 주세요." : "준공예정일과 준공계 접수 일정을 확인해 주세요."}</p></section>
    {message && <div className="document-message success" role="status">{message}</div>}
    {error && <div className="document-message error" role="alert">{error}</div>}
    <section className="construction-check-card">
      <div className="phase6-card-heading"><div><span className="document-step">01</span><div><span className="section-kicker">등록자료 근거</span><h3>현재 확인할 항목</h3></div></div>{editable && <button className="checklist-reload" type="button" disabled={!!busy} onClick={loadChecklist}>{busy === "load" ? "근거 검색 중…" : run ? "등록자료에서 다시 불러오기" : "등록자료에서 불러오기"}</button>}</div>
      {!run ? <div className="phase7-empty">아직 공사중 확인사항을 불러오지 않았습니다. 등록자료에서 먼저 근거를 확인하세요.</div> : <>
        {run.warning && <div className="review-warning">{run.warning}</div>}
        {!items.length ? <div className="phase7-empty">표시할 근거 확인 항목이 없습니다. 등록자료를 추가하거나 담당자가 직접 확인해 주세요.</div> : <div className="construction-check-list">{items.map((item) => <article className={`construction-check-item ${item.status.toLowerCase()}`} key={item.id}>
          <div><strong>{item.title}</strong><p>{item.detail}</p><details><summary>등록자료 근거</summary><div className="phase6-evidence"><strong>{item.evidenceDocumentName}{item.evidenceYear ? ` (${item.evidenceYear})` : ""}</strong>{item.evidenceLocation && <small>{item.evidenceLocation}</small>}<p>{item.evidenceExcerpt}</p></div></details></div>
          <div className="check-status-actions">{Object.entries(STATUS_LABEL).map(([status, label]) => <button type="button" key={status} disabled={!editable || !!busy} className={item.status === status ? "active" : ""} onClick={() => setStatus(item.id, status as keyof typeof STATUS_LABEL)}>{busy === item.id && item.status !== status ? "…" : label}</button>)}</div>
        </article>)}</div>}
      </>}
    </section>
    {editable && <section className="phase6-confirm-bar"><div><strong>준공계를 접수하고 공사중 확인을 마쳤나요?</strong><small>체크상태를 확인한 뒤 담당자 승인으로만 준공 단계로 이동합니다.</small></div><button type="button" disabled={!!busy || !run} onClick={completeConstruction}>{busy === "complete" ? "단계 변경 중…" : "준공 접수 확인"}</button></section>}
  </>;
}
