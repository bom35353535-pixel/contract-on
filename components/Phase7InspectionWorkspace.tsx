"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppDialog } from "./AppDialog";

export function Phase7InspectionWorkspace({ contractId, currentStage, inspectionDate, paymentDate }: { contractId: string; currentStage: string; inspectionDate: string | null; paymentDate: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<"complete-inspection" | "complete-payment" | null>(null);

  async function act(action: "complete-inspection" | "complete-payment") {
    const label = action === "complete-inspection" ? "검사·검수" : "대금지급";
    setPendingAction(null);
    setBusy(action); setError("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase7-actions`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `${label} 완료를 저장하지 못했습니다.`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `${label} 완료를 저장하지 못했습니다.`);
    } finally { setBusy(""); }
  }

  return <>
    <AppDialog open={pendingAction !== null} title={`실제 ${pendingAction === "complete-inspection" ? "검사·검수" : "대금지급"} 처리를 완료하셨나요?`} confirmLabel="완료 확인" busy={!!busy} onCancel={() => setPendingAction(null)} onConfirm={() => pendingAction && void act(pendingAction)}><p>완료일이 오늘 날짜로 저장됩니다.</p></AppDialog>
    <section className="phase7-head"><div><span className="section-kicker">Phase 7 · 검사검수/대금지급</span><h2>공사완료 처리</h2><p>검사·검수와 대금지급을 각각 실제 처리한 뒤 순서대로 확인합니다.</p></div><span className="human-check-badge">담당자 완료확인</span></section>
    {error && <div className="document-message error" role="alert">{error}</div>}
    <section className="inspection-flow">
      <article className={inspectionDate ? "done" : "current"}><span>01</span><div><h3>에듀파인 검사·검수</h3><p>{inspectionDate ? `${inspectionDate} 완료` : "에듀파인 검사·검수 처리가 필요합니다."}</p></div>{currentStage === "INSPECTION" && !inspectionDate && <button type="button" disabled={!!busy} onClick={() => setPendingAction("complete-inspection")}>{busy === "complete-inspection" ? "저장 중…" : "검사·검수 완료"}</button>}</article>
      <article className={paymentDate ? "done" : inspectionDate ? "current" : "waiting"}><span>02</span><div><h3>대금지급</h3><p>{paymentDate ? `${paymentDate} 완료` : inspectionDate ? "대금지급 완료 여부를 확인해 주세요." : "검사·검수 완료 후 진행할 수 있습니다."}</p></div>{currentStage === "INSPECTION" && inspectionDate && !paymentDate && <button type="button" disabled={!!busy} onClick={() => setPendingAction("complete-payment")}>{busy === "complete-payment" ? "완료 처리 중…" : "대금지급 완료"}</button>}</article>
      <article className={currentStage === "FINISHED" ? "done" : "waiting"}><span>03</span><div><h3>공사완료</h3><p>{currentStage === "FINISHED" ? "계약업무가 완료되었습니다. 다음 Phase에서 하자관리로 연결합니다." : "대금지급 완료 후 자동으로 공사완료 상태가 됩니다."}</p></div></article>
    </section>
  </>;
}
