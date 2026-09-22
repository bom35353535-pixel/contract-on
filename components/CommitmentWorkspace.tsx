import { AdvanceStageButton } from "@/components/AdvanceStageButton";
import { CONTRACT_STAGES, isContractStage, STAGE_INFO } from "@/lib/workflow";

export function CommitmentWorkspace({ contractId, currentStage }: { contractId: string; currentStage: string }) {
  const currentIndex = isContractStage(currentStage) ? CONTRACT_STAGES.indexOf(currentStage) : -1;
  const commitmentIndex = CONTRACT_STAGES.indexOf("COMMITMENT");
  const isCurrent = currentStage === "COMMITMENT";
  const isFuture = currentIndex >= 0 && currentIndex < commitmentIndex;
  const isPast = currentIndex > commitmentIndex;

  return <>
    <section className="phase6-workspace-head">
      <div><span className="section-kicker">Phase 6 · 원인행위 관리</span><h2>원인행위</h2><p>계약 체결 후 에듀파인 원인행위 처리를 담당자가 확인하고 착공 단계로 이동합니다.</p></div>
      <span className="human-check-badge">담당자 최종확정</span>
    </section>

    <section className={`phase6-upload-card ${isFuture ? "locked" : ""}`}>
      <div className="phase6-card-heading"><div><span className="document-step">01</span><div><span className="section-kicker">에듀파인 처리 확인</span><h3>원인행위 완료 확인</h3></div></div><span className={`document-status ${isCurrent ? "current" : isFuture ? "upcoming" : "confirmed"}`}>{isCurrent ? "처리 가능" : isFuture ? "계약 완료 후 가능" : isPast ? "단계 완료" : "단계 확인 필요"}</span></div>
      {isCurrent ? <>
        <div className="attention-box commitment-guidance">에듀파인에서 해당 계약의 원인행위 등록을 완료한 뒤 아래 버튼을 눌러 주세요.</div>
        <section className="phase6-confirm-bar"><div><strong>실제 원인행위 처리를 완료하셨나요?</strong><small>확인하면 계약 진행단계가 착공으로 변경되고 착공서류 화면으로 이동합니다.</small></div><AdvanceStageButton contractId={contractId} label={STAGE_INFO.COMMITMENT.action} /></section>
      </> : isFuture ? <div className="phase6-upcoming-notice"><strong>현재 단계: {isContractStage(currentStage) ? STAGE_INFO[currentStage].label : "확인 필요"}</strong><span>계약 완료 처리 후 원인행위 완료 버튼이 활성화됩니다.</span></div> : <p className="phase6-readonly-note">원인행위 단계가 완료되어 착공 단계로 이동했습니다.</p>}
    </section>
  </>;
}
