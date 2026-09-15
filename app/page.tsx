import { AppShell } from "@/components/AppShell";
import { UploadPanel } from "@/components/UploadPanel";
import { getDeadlineForContract, formatWon, listContracts } from "@/lib/contracts";
import { daysBetween, getDdayLabel, getKoreanToday, isContractStage, STAGE_INFO } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function Home() {
  const contracts = await listContracts();
  const today = getKoreanToday();
  const inProgress = contracts.filter((contract) => contract.currentStage !== "FINISHED").length;
  const startingSoon = contracts.filter((contract) => contract.plannedStartDate && !contract.actualStartDate && daysBetween(today, contract.plannedStartDate) >= 0 && daysBetween(today, contract.plannedStartDate) <= 30).length;
  const completingSoon = contracts.filter((contract) => contract.plannedCompletionDate && contract.currentStage !== "FINISHED" && daysBetween(today, contract.plannedCompletionDate) >= 0 && daysBetween(today, contract.plannedCompletionDate) <= 30).length;
  const warrantySoon = contracts.filter((contract) => contract.currentStage === "FINISHED" && contract.nextTaskDate && daysBetween(today, contract.nextTaskDate) >= 0 && daysBetween(today, contract.nextTaskDate) <= 30).length;
  const summaryCards = [
    { label: "진행 중 공사", value: inProgress, note: `전체 ${contracts.length}건 중`, tone: "navy" },
    { label: "착공 예정", value: startingSoon, note: "30일 이내", tone: "blue" },
    { label: "준공 예정", value: completingSoon, note: "30일 이내", tone: "green" },
    { label: "하자검사 예정", value: warrantySoon, note: "30일 이내", tone: "amber" },
  ];
  const focusContracts = contracts
    .filter((contract) => contract.currentStage !== "FINISHED")
    .sort((a, b) => (a.nextTaskDate ?? "9999").localeCompare(b.nextTaskDate ?? "9999"))
    .slice(0, 3);
  const tasks = contracts
    .filter((contract) => contract.nextTask)
    .sort((a, b) => (a.nextTaskDate ?? "9999").localeCompare(b.nextTaskDate ?? "9999"))
    .slice(0, 3);

  return (
    <AppShell active="home" contractCount={contracts.length}>
      <UploadPanel />

      <section className="summary-grid" aria-label="계약업무 요약">
        {summaryCards.map((card) => (
          <article className={`summary-card ${card.tone}`} key={card.label}>
            <div className="summary-top"><span>{card.label}</span><span className="summary-dot" /></div>
            <div className="summary-value"><strong>{card.value}</strong><span>건</span></div>
            <p>{card.note}</p>
          </article>
        ))}
      </section>

      <section className="workspace-grid">
        <div className="contract-panel">
          <div className="panel-heading"><div><span className="section-kicker">진행 현황</span><h2>지금 확인할 계약</h2></div><a href="/contracts">전체보기 <span>→</span></a></div>
          <div className="contract-list">
            {focusContracts.map((contract) => {
              const stage = isContractStage(contract.currentStage) ? STAGE_INFO[contract.currentStage].label : "[확인 필요]";
              const deadline = getDeadlineForContract(contract);
              const dday = getDdayLabel(deadline.date, deadline.prefix, today);
              const tone = contract.currentStage === "IN_CONSTRUCTION" ? "green" : contract.currentStage === "PRE_CONSTRUCTION" ? "blue" : "amber";
              return (
                <a className="contract-row" href={`/contracts/${contract.id}`} key={contract.id}>
                  <div className="contract-main"><span className={`stage-badge ${tone}`}>{stage}</span><div><strong>{contract.projectName}</strong><small>{contract.companyName} · {formatWon(contract.contractAmount)}</small></div></div>
                  <div className="contract-progress"><div className="progress-meta"><span>{contract.nextTask ?? "[확인 필요]"}</span><strong>{contract.progress}%</strong></div><div className="progress-track"><span style={{ width: `${contract.progress}%` }} /></div></div>
                  <span className={`dday ${tone}`}>{dday}</span><span className="row-arrow">›</span>
                </a>
              );
            })}
          </div>
        </div>

        <aside className="today-panel">
          <div className="panel-heading"><div><span className="section-kicker">오늘 할 일</span><h2>놓치지 마세요</h2></div><span className="task-count">{tasks.length}</span></div>
          <ol className="task-list">
            {tasks.map((task) => {
              const days = task.nextTaskDate ? daysBetween(today, task.nextTaskDate) : null;
              const label = days === null ? "확인" : days === 0 ? "오늘" : days > 0 ? `D-${days}` : "지연";
              return <li key={task.id}><span className={`task-time ${days !== null && days <= 0 ? "urgent" : ""}`}>{label}</span><div><strong>{task.nextTask}</strong><small>{task.projectName}</small></div></li>;
            })}
          </ol>
        </aside>
      </section>
    </AppShell>
  );
}
