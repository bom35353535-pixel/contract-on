"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ConstructionChecklistItemRecord, ConstructionChecklistRunRecord } from "@/db/schema";
import { getReviewGuidance, parseFieldChecklistDetail, type FieldCheckStatus } from "@/lib/construction-field-checklist";

type HistoryEntry = { run: ConstructionChecklistRunRecord; items: ConstructionChecklistItemRecord[] };
type Props = {
  contractId: string;
  currentStage: string;
  run: ConstructionChecklistRunRecord | null;
  items: ConstructionChecklistItemRecord[];
  history: HistoryEntry[];
  ddayLabel: string;
  isCompletionDay: boolean;
};

const STATUS_LABEL: Record<FieldCheckStatus, string> = { PENDING: "미선택", NORMAL: "정상", NEEDS_REVIEW: "확인 필요", NOT_APPLICABLE: "해당 없음" };
const SELECTABLE_STATUSES: FieldCheckStatus[] = ["NORMAL", "NEEDS_REVIEW", "NOT_APPLICABLE"];
type Draft = { memo: string; actionNote: string; resolved: boolean };

function formatInspectionDate(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}.`;
}

function statusCounts(items: ConstructionChecklistItemRecord[]) {
  return {
    total: items.length,
    normal: items.filter((item) => item.status === "NORMAL").length,
    review: items.filter((item) => item.status === "NEEDS_REVIEW").length,
    na: items.filter((item) => item.status === "NOT_APPLICABLE").length,
  };
}

export function Phase7ConstructionWorkspace({ contractId, currentStage, run, items, history, ddayLabel, isCompletionDay }: Props) {
  const router = useRouter();
  const autoStarted = useRef(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const editable = currentStage === "IN_CONSTRUCTION";
  const counts = statusCounts(items);
  const reviewItems = items.filter((item) => item.status === "NEEDS_REVIEW");
  const needsInitialChecklist = !run || items.length === 0 || items.every((item) => parseFieldChecklistDetail(item.detail).templateId === "LEGACY");

  const grouped = new Map<string, Map<string, ConstructionChecklistItemRecord[]>>();
  for (const item of items) {
    const detail = parseFieldChecklistDetail(item.detail);
    const category = grouped.get(detail.category) || new Map<string, ConstructionChecklistItemRecord[]>();
    category.set(detail.group, [...(category.get(detail.group) || []), item]);
    grouped.set(detail.category, category);
  }

  async function loadChecklist(auto = false) {
    setBusy("load"); setError(""); if (!auto) setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase7-construction-checklist`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const result = await response.json() as { error?: string; itemCount?: number; categories?: string[] };
      if (!response.ok) throw new Error(result.error || "현장 확인사항을 준비하지 못했습니다.");
      setMessage(`현장 확인사항 ${result.itemCount || 0}개를 준비했습니다.`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "현장 확인사항을 준비하지 못했습니다.");
    } finally { setBusy(""); }
  }

  useEffect(() => {
    if (!editable || !needsInitialChecklist || autoStarted.current) return;
    autoStarted.current = true;
    void loadChecklist(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, needsInitialChecklist]);

  async function patchItem(itemId: string, payload: Record<string, unknown>) {
    setBusy(itemId); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase7-construction-checklist`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId, ...payload }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "현장 확인내용을 저장하지 못했습니다.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "현장 확인내용을 저장하지 못했습니다.");
    } finally { setBusy(""); }
  }

  function updateDraft(itemId: string, initial: Draft, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [itemId]: { ...(current[itemId] || initial), ...patch } }));
  }

  async function uploadPhoto(itemId: string, file?: File) {
    if (!file) return;
    setBusy(`photo-${itemId}`); setError(""); setMessage("");
    const form = new FormData(); form.set("itemId", itemId); form.set("photo", file);
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase7-construction-checklist`, { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "사진을 첨부하지 못했습니다.");
      setMessage("현장 사진을 첨부했습니다."); router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "사진을 첨부하지 못했습니다.");
    } finally { setBusy(""); }
  }

  async function completeConstruction() {
    const pending = items.filter((item) => item.status === "PENDING").length;
    if (!window.confirm(`준공계를 접수하고 공사중 확인을 마쳤나요?${pending ? `\n미선택 항목 ${pending}건이 있습니다.` : ""}\n확인하면 준공 단계로 이동합니다.`)) return;
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
    <section className="phase7-head"><div><span className="section-kicker">Phase 7 · 공사중 관리</span><h2>공사중 확인사항</h2><p>학교 현장에서 계약내용, 자재, 기록과 안전 상태를 빠르게 확인합니다.</p></div><span className="human-check-badge">담당자 상태확인</span></section>
    <section className={`completion-day-card ${isCompletionDay ? "today" : ""}`}><div><span>준공 일정</span><strong>{ddayLabel}</strong></div><p>{isCompletionDay ? "오늘은 계약상 준공일입니다. 준공계 송부 여부를 확인해 주세요." : "준공예정일과 준공계 접수 일정을 확인해 주세요."}</p></section>
    {message && <div className="document-message success" role="status">{message}</div>}
    {error && <div className="document-message error" role="alert">{error}</div>}
    <section className="construction-check-card">
      <div className="phase6-card-heading"><div><span className="document-step">01</span><div><span className="section-kicker">현장 확인</span><h3>현재 확인할 항목</h3></div></div>{editable && <button className="checklist-reload" type="button" disabled={!!busy} onClick={() => loadChecklist(false)}>{busy === "load" ? "준비 중…" : run ? "새 점검 시작" : "현장 확인 시작"}</button>}</div>
      {needsInitialChecklist ? <div className="phase7-empty">{editable ? "공종에 맞는 현장 확인사항을 준비하고 있습니다." : "공사중 단계에서 현장 확인사항을 사용할 수 있습니다."}</div> : <>
        <div className="field-check-summary"><span>전체 <strong>{counts.total}</strong></span><span>정상 <strong>{counts.normal}</strong></span><span className="review">확인 필요 <strong>{counts.review}</strong></span><span>해당 없음 <strong>{counts.na}</strong></span></div>
        {reviewItems.length > 0 && <details className="review-items-summary" open><summary>확인 필요 {reviewItems.length}건</summary><ul>{reviewItems.map((item) => <li key={item.id}>{item.title}</li>)}</ul></details>}
        <div className="field-check-sections">{[...grouped.entries()].map(([category, groups]) => <section className="field-check-category" key={category}><h4>{category === "공통" ? "공통 확인사항" : `${category} 확인사항`}</h4>{[...groups.entries()].map(([group, groupItems]) => <details className="field-check-group" key={`${category}-${group}`} open><summary>{group}<span>{groupItems.length}개</span></summary><div className="construction-check-list">{groupItems.map((item) => {
          const detail = parseFieldChecklistDetail(item.detail);
          const initial = { memo: detail.memo, actionNote: detail.actionNote, resolved: detail.resolved };
          const draft = drafts[item.id] || initial;
          const guidance = getReviewGuidance(item.title);
          return <article className={`construction-check-item ${item.status.toLowerCase()} ${detail.importance === "high" ? "high-importance" : ""}`} key={item.id}>
            <div className="field-check-main"><strong>{item.title}</strong>{item.status === "NEEDS_REVIEW" && detail.importance === "high" && <div className="field-check-warning"><strong>⚠️ {guidance.title}</strong><p>{guidance.body}</p></div>}
              <div className="check-status-actions" role="group" aria-label={`${item.title} 상태`}>{SELECTABLE_STATUSES.map((status) => <button type="button" key={status} disabled={!editable || !!busy} className={item.status === status ? "active" : ""} onClick={() => patchItem(item.id, { status })}>{STATUS_LABEL[status]}</button>)}</div>
              {item.status === "NEEDS_REVIEW" && <div className="field-check-detail"><label>메모<textarea value={draft.memo} onChange={(event) => updateDraft(item.id, initial, { memo: event.target.value })} placeholder="확인이 필요한 내용을 기록하세요." /></label><label>조치사항<textarea value={draft.actionNote} onChange={(event) => updateDraft(item.id, initial, { actionNote: event.target.value })} placeholder="업체 요청 또는 확인 내용을 기록하세요." /></label><div className="field-check-detail-actions"><label className="photo-attach">사진 첨부<input type="file" accept="image/*" disabled={!editable || !!busy} onChange={(event) => { void uploadPhoto(item.id, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><label className="resolved-check"><input type="checkbox" checked={draft.resolved} disabled={!editable || !!busy} onChange={(event) => updateDraft(item.id, initial, { resolved: event.target.checked })} /> 조치완료</label><button type="button" disabled={!editable || !!busy} onClick={() => patchItem(item.id, draft)}>상세기록 저장</button></div>{detail.photos.length > 0 && <ul className="field-photo-list">{detail.photos.map((photo) => <li key={photo.id}><a href={`/api/contracts/${contractId}/phase7-construction-checklist?photo=${photo.id}`} target="_blank" rel="noreferrer">{photo.name}</a></li>)}</ul>}</div>}
            </div>
          </article>;
        })}</div></details>)}</section>)}</div>
      </>}
    </section>
    {history.length > 0 && <section className="field-check-history"><h3>점검 이력</h3>{history.map((entry) => { const pastCounts = statusCounts(entry.items); return <details key={entry.run.id}><summary><span>{formatInspectionDate(entry.run.createdAt)}</span><strong>{pastCounts.review ? `확인 필요 ${pastCounts.review}건` : pastCounts.normal === pastCounts.total ? "전체 정상" : `정상 ${pastCounts.normal}건`}</strong></summary><div>{entry.items.map((item) => { const detail = parseFieldChecklistDetail(item.detail); return <article className="history-check-item" key={item.id}><strong>{item.title}</strong><span>{STATUS_LABEL[item.status as FieldCheckStatus] || "미선택"}{detail.resolved ? " · 조치완료" : ""}</span>{detail.memo && <p>메모: {detail.memo}</p>}{detail.actionNote && <p>조치사항: {detail.actionNote}</p>}{detail.photos.length > 0 && <ul className="field-photo-list">{detail.photos.map((photo) => <li key={photo.id}><a href={`/api/contracts/${contractId}/phase7-construction-checklist?photo=${photo.id}`} target="_blank" rel="noreferrer">{photo.name}</a></li>)}</ul>}</article>; })}</div></details>; })}</section>}
    {editable && <section className="phase6-confirm-bar"><div><strong>준공계를 접수하고 공사중 확인을 마쳤나요?</strong><small>체크상태를 확인한 뒤 담당자 승인으로만 준공 단계로 이동합니다.</small></div><button type="button" disabled={!!busy || needsInitialChecklist} onClick={completeConstruction}>{busy === "complete" ? "단계 변경 중…" : "준공 접수 확인"}</button></section>}
  </>;
}
