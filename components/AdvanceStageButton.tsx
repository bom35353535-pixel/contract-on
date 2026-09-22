"use client";

import { useState } from "react";

export function AdvanceStageButton({ contractId, label }: { contractId: string; label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function advance() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/advance`, { method: "POST" });
      const body = (await response.json()) as { error?: string; nextStage?: string; transition?: { nextStage?: string } };
      if (!response.ok) throw new Error(body.error || "단계를 변경하지 못했습니다.");
      const nextStage = body.nextStage ?? body.transition?.nextStage;
      if (nextStage === "PRE_CONSTRUCTION") {
        window.location.assign(`/contracts/${contractId}?tab=construction-documents`);
      } else {
        window.location.assign(`/contracts/${contractId}`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "단계를 변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {confirmOpen && <div className="action-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) setConfirmOpen(false); }}>
        <section className="action-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="stage-confirm-title" aria-describedby="stage-confirm-description">
          <h2 id="stage-confirm-title">실제 행정처리를 완료하셨나요?</h2>
          <p id="stage-confirm-description">확인하면 ‘{label}’로 기록됩니다.</p>
          <div className="action-confirm-actions"><button type="button" disabled={pending} onClick={() => setConfirmOpen(false)}>취소</button><button className="primary" type="button" autoFocus disabled={pending} onClick={() => { setConfirmOpen(false); void advance(); }}>완료 확인</button></div>
        </section>
      </div>}
      <div className="advance-action">
        <button type="button" onClick={() => setConfirmOpen(true)} disabled={pending}>{pending ? "처리 중…" : label}</button>
        {error && <p role="alert">{error}</p>}
      </div>
    </>
  );
}
