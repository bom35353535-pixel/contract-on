import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdvanceStageButton } from "@/components/AdvanceStageButton";
import { AppShell } from "@/components/AppShell";
import { StageTimeline } from "@/components/StageTimeline";
import { formatWon, getContract, getContractHistory, getDeadlineForContract, listContracts } from "@/lib/contracts";
import { getQuotationByContract } from "@/lib/quotations";
import { formatKoreanDate, getDdayLabel, getKoreanToday, getNextStage, isContractStage, STAGE_INFO } from "@/lib/workflow";

export const dynamic = "force-dynamic";

type DetailProps = { params: Promise<{ id: string }>; searchParams?: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: DetailProps): Promise<Metadata> {
  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) return { title: "계약을 찾을 수 없음 | AI 공사계약 통합지원" };
  const stage = isContractStage(contract.currentStage) ? STAGE_INFO[contract.currentStage].label : "단계 확인 필요";
  const title = `${contract.projectName} | AI 공사계약 통합지원`;
  const description = `${contract.projectName}의 현재 단계는 ${stage}입니다.`;
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default async function ContractDetailPage({ params, searchParams }: DetailProps) {
  const { id } = await params;
  const tab = (await searchParams)?.tab === "estimate" ? "estimate" : "basic";
  const [contract, contracts, history, quotation] = await Promise.all([getContract(id), listContracts(), getContractHistory(id), getQuotationByContract(id)]);
  if (!contract || !isContractStage(contract.currentStage)) notFound();
  const currentStage = contract.currentStage;
  const nextStage = getNextStage(currentStage);
  const deadline = getDeadlineForContract(contract);
  const dday = getDdayLabel(deadline.date, deadline.prefix, getKoreanToday());
  const details = [
    ["공사종류", contract.constructionType], ["공사목적", contract.purpose], ["공사장소", contract.location],
    ["계약방법", contract.contractMethod ?? "[확인 필요]"], ["견적금액", formatWon(contract.estimatedAmount)], ["계약금액", formatWon(contract.contractAmount)],
    ["착공예정일", formatKoreanDate(contract.plannedStartDate)], ["실제 착공일", formatKoreanDate(contract.actualStartDate)],
    ["준공예정일", formatKoreanDate(contract.plannedCompletionDate)], ["실제 준공일", formatKoreanDate(contract.actualCompletionDate)],
  ];

  return (
    <AppShell active="contracts" contractCount={contracts.length}>
      <Link className="back-link" href="/contracts">← 계약 현황으로</Link>
      <header className="detail-header">
        <div><span className="contract-id">{contract.id} · 샘플 데이터</span><h1>{contract.projectName}</h1><p>{contract.companyName} · {formatWon(contract.contractAmount)}</p></div>
        <div className="detail-status"><span className="current-stage-chip">{STAGE_INFO[currentStage].label}</span><strong>{dday}</strong></div>
      </header>

      <section className="timeline-card"><div className="timeline-heading"><span>계약 진행단계</span><strong>{contract.progress}% 진행</strong></div><StageTimeline currentStage={currentStage} /></section>

      <nav className="detail-tabs" aria-label="계약 상세 메뉴">
        <Link className={tab === "basic" ? "active" : ""} href={`/contracts/${id}`}>기본정보</Link>
        {quotation ? <Link className={tab === "estimate" ? "active" : ""} href={`/contracts/${id}?tab=estimate`}>견적검토</Link> : <span>견적검토<small>후속</small></span>}
        {["품의/기안", "계약서류", "착공서류", "공사진행", "준공서류", "검사검수", "하자관리", "AI 업무비서"].map((label) => <span key={label}>{label}<small>후속</small></span>)}
      </nav>

      {tab === "estimate" && quotation ? <section className="review-card contract-estimate-card">
        <div className="review-heading"><div><span className="section-kicker">담당자 확정본</span><h2>견적서 추출정보</h2></div><span className="phase4-badge">검산은 Phase 4</span></div>
        <p className="estimate-source">원본: {quotation.analysis.originalName} · {quotation.analysis.confirmedAt?.slice(0, 10)} 확정</p>
        <dl className="info-list">
          {[
            ["총액", quotation.analysis.totalAmount === null ? "[확인 필요]" : formatWon(quotation.analysis.totalAmount)],
            ["공급가액", quotation.analysis.supplyAmount === null ? "[확인 필요]" : formatWon(quotation.analysis.supplyAmount)],
            ["부가가치세", quotation.analysis.vatAmount === null ? "[확인 필요]" : formatWon(quotation.analysis.vatAmount)],
            ["재료비", quotation.analysis.materialCost === null ? "[확인 필요]" : formatWon(quotation.analysis.materialCost)],
            ["직접노무비", quotation.analysis.directLaborCost === null ? "[확인 필요]" : formatWon(quotation.analysis.directLaborCost)],
            ["경비", quotation.analysis.expenses === null ? "[확인 필요]" : formatWon(quotation.analysis.expenses)],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {quotation.items.length > 0 && <div className="quotation-table-wrap"><table className="quotation-table readonly"><thead><tr><th>구분</th><th>공종/직종</th><th>품명</th><th>규격</th><th>단위</th><th>수량</th><th>단가</th><th>금액</th></tr></thead><tbody>{quotation.items.map((item) => <tr key={item.id}><td>{item.category ?? "-"}</td><td>{item.trade ?? "-"}</td><td>{item.itemName ?? "-"}</td><td>{item.specification ?? "-"}</td><td>{item.unit ?? "-"}</td><td>{item.quantity ?? "-"}</td><td>{item.unitPrice === null ? "-" : formatWon(item.unitPrice)}</td><td>{item.amount === null ? "-" : formatWon(item.amount)}</td></tr>)}</tbody></table></div>}
      </section> : <section className="detail-grid">
        <article className="info-card">
          <div className="card-title"><div><span className="section-kicker">기준정보</span><h2>계약 기본정보</h2></div><span className="read-once-badge">한 번 입력 · 계속 사용</span></div>
          <dl className="info-list">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </article>

        <div className="detail-side-stack">
          <article className="next-action-card">
            <span className="section-kicker">현재 단계</span><h2>{STAGE_INFO[currentStage].label}</h2><p>{STAGE_INFO[currentStage].description}</p>
            {contract.attention && <div className="attention-box">{contract.attention}</div>}
            {nextStage ? <AdvanceStageButton contractId={contract.id} label={STAGE_INFO[currentStage].action} /> : <div className="finished-box">계약업무 완료 · 하자관리 연결 준비</div>}
            <small className="confirmation-note">중요한 단계변경은 담당자가 확인해야만 처리됩니다.</small>
          </article>

          <article className="history-card">
            <div className="card-title"><div><span className="section-kicker">감사 추적</span><h2>최근 단계 기록</h2></div></div>
            <ol>{history.slice(0, 4).map((item) => <li key={item.id}><span className="history-dot" /><div><strong>{isContractStage(item.toStage) ? STAGE_INFO[item.toStage].label : item.toStage}</strong><small>{item.action} · {item.actor}<br />{item.occurredAt.slice(0, 10)}</small></div></li>)}</ol>
          </article>
        </div>
      </section>}
    </AppShell>
  );
}
