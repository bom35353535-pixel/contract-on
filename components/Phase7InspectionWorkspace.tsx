"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppDialog } from "./AppDialog";
import { calculateUtilityCost, inferUtilityDuration, inferUtilityTrade, type UtilityCostKind, type UtilityDuration, type UtilityTrade } from "@/lib/utility-cost";

type CompletionAction = "complete-inspection" | "complete-utility-notice" | "complete-payment" | "complete-finish";
const ACTION_LABELS: Record<CompletionAction, string> = {
  "complete-inspection": "에듀파인 검사·검수", "complete-utility-notice": "수도광열비 안내공문 발송",
  "complete-payment": "대금지급", "complete-finish": "공사완료",
};
function numberValue(value: string) { return Math.max(0, Number(value.replaceAll(",", "")) || 0); }
function formatWon(value: number | null) { return value === null ? "[확인 필요]" : `${value.toLocaleString("ko-KR")}원`; }

export function Phase7InspectionWorkspace({ contractId, currentStage, inspectionDate, utilityNoticeDate, paymentDate, projectName, constructionType, contractAmount, supplyAmount, materialCost, directLaborCost, plannedStartDate, plannedCompletionDate }: {
  contractId: string; currentStage: string; inspectionDate: string | null; utilityNoticeDate: string | null; paymentDate: string | null;
  projectName: string; constructionType: string; contractAmount: number; supplyAmount: number | null; materialCost: number | null; directLaborCost: number | null;
  plannedStartDate: string | null; plannedCompletionDate: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<CompletionAction | null>(null);
  const [kind, setKind] = useState<UtilityCostKind>("BOTH");
  const [trade, setTrade] = useState<UtilityTrade>(() => inferUtilityTrade(constructionType));
  const [duration, setDuration] = useState<UtilityDuration>(() => inferUtilityDuration(plannedStartDate, plannedCompletionDate));
  const [amountExVat, setAmountExVat] = useState(String(supplyAmount ?? Math.round(contractAmount / 1.1)));
  const [directMaterial, setDirectMaterial] = useState(String(materialCost ?? 0));
  const [directLabor, setDirectLabor] = useState(String(directLaborCost ?? 0));
  const utility = useMemo(() => calculateUtilityCost({ kind, trade, duration, amountExVat: numberValue(amountExVat), directMaterial: numberValue(directMaterial), directLabor: numberValue(directLabor) }), [kind, trade, duration, amountExVat, directMaterial, directLabor]);

  async function act(action: CompletionAction) {
    const label = ACTION_LABELS[action]; setPendingAction(null); setBusy(action); setError("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/phase7-actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `${label} 완료를 저장하지 못했습니다.`);
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : `${label} 완료를 저장하지 못했습니다.`); }
    finally { setBusy(""); }
  }
  const finished = currentStage === "FINISHED";
  const button = (action: CompletionAction, enabled: boolean, done: boolean) => <button type="button" disabled={!!busy || !enabled || done} onClick={() => setPendingAction(action)}>{busy === action ? "저장 중…" : done ? "완료됨" : `${ACTION_LABELS[action]} 완료`}</button>;

  return <>
    <AppDialog open={pendingAction !== null} title={`${pendingAction ? ACTION_LABELS[pendingAction] : "업무"} 처리를 완료하셨나요?`} confirmLabel="완료 확인" busy={!!busy} onCancel={() => setPendingAction(null)} onConfirm={() => pendingAction && void act(pendingAction)}><p>완료일이 오늘 날짜로 저장됩니다.</p></AppDialog>
    <section className="phase7-head"><div><span className="section-kicker">Phase 7 · 검사검수·대금지급</span><h2>공사완료 처리</h2><p>각 업무를 실제 처리한 순서대로 완료해 주세요.</p></div><span className="human-check-badge">담당자 완료확인</span></section>
    {error && <div className="document-message error" role="alert">{error}</div>}
    <section className="inspection-flow">
      <article className={inspectionDate ? "done" : "current"}><span>01</span><div><h3>에듀파인 검사·검수</h3><p>{inspectionDate ? `${inspectionDate} 완료` : "에듀파인에서 검사·검수를 처리한 후 완료해 주세요."}</p></div>{button("complete-inspection", currentStage === "INSPECTION", Boolean(inspectionDate))}</article>
      <article className={utilityNoticeDate ? "done utility-step" : inspectionDate ? "current utility-step" : "waiting utility-step"}>
        <span>02</span><div><h3>수도광열비 안내공문 발송</h3><p>{utilityNoticeDate ? `${utilityNoticeDate} 완료` : inspectionDate ? "계산 결과를 확인하고 업체에 안내공문을 발송해 주세요." : "에듀파인 검사·검수 완료 후 진행할 수 있습니다."}</p></div>{button("complete-utility-notice", currentStage === "INSPECTION" && Boolean(inspectionDate), Boolean(utilityNoticeDate))}
        <section className="utility-calculator">
          <div className="utility-calculator-head"><div><strong>수도·전기료 계산</strong><small>{projectName}</small></div><span>첨부 엑셀 31.수도전기료계산식 기준</span></div>
          <div className="utility-input-grid">
            <label>사용 구분<select value={kind} onChange={(e) => setKind(e.target.value as UtilityCostKind)}><option value="BOTH">수도·전기 모두 사용</option><option value="ELECTRICITY">전기만 사용</option><option value="WATER">수도만 사용</option></select></label>
            <label>공사 종류<select value={trade} onChange={(e) => setTrade(e.target.value as UtilityTrade)}><option value="BUILDING">건축(전기·통신·소방·전문 포함)</option><option value="CIVIL">토목</option><option value="INDUSTRIAL">산업설비</option><option value="LANDSCAPE">조경</option></select></label>
            <label>공사 기간<select value={duration} onChange={(e) => setDuration(e.target.value as UtilityDuration)}><option value="UP_TO_6">6개월 이하</option><option value="UP_TO_12">6개월 초과 12개월 이하</option><option value="UP_TO_36">12개월 초과 36개월 이하</option><option value="OVER_36">36개월 초과</option></select></label>
            <label>계약금액(부가세 제외)<input inputMode="numeric" value={amountExVat} onChange={(e) => setAmountExVat(e.target.value)} /></label>
            <label>직접재료비<input inputMode="numeric" value={directMaterial} onChange={(e) => setDirectMaterial(e.target.value)} /></label>
            <label>직접노무비<input inputMode="numeric" value={directLabor} onChange={(e) => setDirectLabor(e.target.value)} /></label>
          </div>
          <div className="utility-result-grid"><div><span>전기료</span><strong>{formatWon(utility.electricity?.amount ?? null)}</strong></div><div><span>수도료</span><strong>{formatWon(utility.water?.amount ?? null)}</strong></div><div className="total"><span>합계</span><strong>{formatWon(utility.total)}</strong></div></div>
          {utility.reason && <p className="utility-warning">[확인 필요] {utility.reason}</p>}
          <p className="utility-formula">계산식: (직접재료비 + 직접노무비) × (공종별 요율 + 공사기간별 요율 + 공사금액별 요율) ÷ 3, 10원 단위 절사</p>
          <small className="utility-source">원본 표 기준: 2024년도 완성공사 원가통계(대한건설협회, 2025.9 발표). 입력값과 적용 구간은 담당자가 최종 확인해 주세요.</small>
        </section>
      </article>
      <article className={paymentDate ? "done" : utilityNoticeDate ? "current" : "waiting"}><span>03</span><div><h3>대금지급</h3><p>{paymentDate ? `${paymentDate} 완료` : utilityNoticeDate ? "대금지급 처리 후 완료해 주세요." : "수도광열비 안내공문 발송 완료 후 진행할 수 있습니다."}</p></div>{button("complete-payment", currentStage === "INSPECTION" && Boolean(utilityNoticeDate), Boolean(paymentDate))}</article>
      <article className={finished ? "done" : paymentDate ? "current" : "waiting"}><span>04</span><div><h3>공사완료</h3><p>{finished ? "공사완료 처리되었습니다. 하자관리 단계로 연결됩니다." : paymentDate ? "모든 선행 업무를 확인한 후 공사완료 처리해 주세요." : "대금지급 완료 후 진행할 수 있습니다."}</p></div>{button("complete-finish", currentStage === "INSPECTION" && Boolean(paymentDate), finished)}</article>
    </section>
  </>;
}
