import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getDeadlineForContract, formatWon, listContracts } from "@/lib/contracts";
import { getDdayLabel, getKoreanToday, isContractStage, STAGE_INFO } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const contracts = await listContracts();
  const today = getKoreanToday();

  return (
    <AppShell active="contracts" contractCount={contracts.length}>
      <header className="page-header">
        <div><span className="section-kicker">계약업무 전체보기</span><h1>계약 현황</h1><p>계약별 현재 단계와 다음 업무, 주요 일정을 한눈에 확인합니다.</p></div>
        <div className="header-badges"><span className="sample-data-label">샘플 데이터</span><span className="total-badge">전체 {contracts.length}건</span></div>
      </header>

      <section className="all-contracts-card">
        <div className="contract-table-head"><span>공사명·업체</span><span>금액</span><span>현재단계</span><span>진행률</span><span>다음 업무</span><span>D-Day</span><span /></div>
        <div className="contract-table-body">
          {contracts.map((contract) => {
            const stage = isContractStage(contract.currentStage) ? STAGE_INFO[contract.currentStage].label : "[확인 필요]";
            const deadline = getDeadlineForContract(contract);
            const dday = getDdayLabel(deadline.date, deadline.prefix, today);
            return (
              <Link href={`/contracts/${contract.id}`} className="contract-table-row" key={contract.id}>
                <span className="table-project"><strong>{contract.projectName}</strong><small>{contract.companyName} · {contract.id}</small></span>
                <strong className="amount-cell">{formatWon(contract.contractAmount)}</strong>
                <span><span className={`stage-pill stage-${contract.currentStage.toLowerCase()}`}>{stage}</span></span>
                <span className="table-progress"><span>{contract.progress}%</span><span className="progress-track"><span style={{ width: `${contract.progress}%` }} /></span></span>
                <span className="next-task-cell">{contract.nextTask ?? "[확인 필요]"}</span>
                <span className={`table-dday ${dday.includes("지남") || dday.includes("D-Day") ? "urgent" : ""}`}>{dday}</span>
                <span className="row-arrow">›</span>
              </Link>
            );
          })}
        </div>
      </section>
      <p className="data-note">현재 화면의 계약정보는 Phase 1 동작 확인을 위한 샘플 데이터입니다.</p>
    </AppShell>
  );
}
