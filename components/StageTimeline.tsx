import { CONTRACT_STAGES, STAGE_INFO, type ContractStage } from "@/lib/workflow";

export function StageTimeline({ currentStage }: { currentStage: ContractStage }) {
  const currentIndex = CONTRACT_STAGES.indexOf(currentStage);
  return (
    <ol className="stage-timeline" aria-label="계약 업무단계">
      {CONTRACT_STAGES.map((stage, index) => {
        const status = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
        return (
          <li className={status} key={stage} aria-current={status === "current" ? "step" : undefined}>
            <span className="stage-node">{status === "complete" ? "✓" : index + 1}</span>
            <span className="stage-name">{STAGE_INFO[stage].label}</span>
          </li>
        );
      })}
    </ol>
  );
}
