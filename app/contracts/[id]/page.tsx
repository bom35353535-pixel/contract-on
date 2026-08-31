import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdvanceStageButton } from "@/components/AdvanceStageButton";
import { AdministrativeDocumentsWorkspace } from "@/components/AdministrativeDocumentsWorkspace";
import { AppShell } from "@/components/AppShell";
import { QuotationReviewDashboard } from "@/components/QuotationReviewDashboard";
import { Phase6DocumentWorkspace } from "@/components/Phase6DocumentWorkspace";
import { Phase7ConstructionWorkspace } from "@/components/Phase7ConstructionWorkspace";
import { Phase7InspectionWorkspace } from "@/components/Phase7InspectionWorkspace";
import { Phase8WarrantyWorkspace } from "@/components/Phase8WarrantyWorkspace";
import { StageTimeline } from "@/components/StageTimeline";
import { formatWon, getContract, getContractHistory, getDeadlineForContract, listContracts } from "@/lib/contracts";
import { buildInternalApprovalContent, buildPurchaseRequestContent } from "@/lib/administrative-document-content";
import { getAdministrativeDocuments } from "@/lib/administrative-documents";
import { getLatestQuotationReview, getQuotationByContract } from "@/lib/quotations";
import { getPhase6DocumentWorkspace } from "@/lib/phase6-documents";
import { getConstructionChecklist } from "@/lib/construction-checklist";
import { getWarrantyWorkspace } from "@/lib/warranty";
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
  const requestedTab = (await searchParams)?.tab;
  const availableTabs = ["estimate", "documents", "contract-documents", "construction-documents", "construction-progress", "completion-documents", "inspection", "warranty"];
  const tab = requestedTab && availableTabs.includes(requestedTab) ? requestedTab : "basic";
  const [contract, contracts, history, quotation, quotationReview, administrativeDocuments, contractDocuments, constructionDocuments, completionDocuments, constructionChecklist, warrantyWorkspace] = await Promise.all([
    getContract(id), listContracts(), getContractHistory(id), getQuotationByContract(id), getLatestQuotationReview(id), getAdministrativeDocuments(id),
    getPhase6DocumentWorkspace(id, "NARA_CONTRACT"), getPhase6DocumentWorkspace(id, "PRE_CONSTRUCTION"),
    getPhase6DocumentWorkspace(id, "COMPLETION"), getConstructionChecklist(id), getWarrantyWorkspace(id),
  ]);
  if (!contract || !isContractStage(contract.currentStage)) notFound();
  const currentStage = contract.currentStage;
  const nextStage = getNextStage(currentStage);
  const deadline = getDeadlineForContract(contract);
  const dday = getDdayLabel(deadline.date, deadline.prefix, getKoreanToday());
  const constructionDday = getDdayLabel(contract.plannedStartDate, "착공", getKoreanToday());
  const isStartDay = Boolean(contract.plannedStartDate && contract.plannedStartDate === getKoreanToday());
  const completionDday = getDdayLabel(contract.plannedCompletionDate, "준공", getKoreanToday());
  const isCompletionDay = Boolean(contract.plannedCompletionDate && contract.plannedCompletionDate === getKoreanToday());
  const details = [
    ["공사종류", contract.constructionType], ["공사목적", contract.purpose], ["공사장소", contract.location],
    ["계약방법", contract.contractMethod ?? "[확인 필요]"], ["견적금액", formatWon(contract.estimatedAmount)], ["계약금액", formatWon(contract.contractAmount)],
    ["착공예정일", formatKoreanDate(contract.plannedStartDate)], ["실제 착공일", formatKoreanDate(contract.actualStartDate)],
    ["준공예정일", formatKoreanDate(contract.plannedCompletionDate)], ["실제 준공일", formatKoreanDate(contract.actualCompletionDate)],
  ];

  return (
    <AppShell active="contracts" contractCount={contracts.length}>
      <a className="back-link" href="/contracts">← 계약 현황으로</a>
      <header className="detail-header">
        <div><span className="contract-id">{contract.id}</span><h1>{contract.projectName}</h1><p>{contract.companyName} · {formatWon(contract.contractAmount)}</p></div>
        <div className="detail-status"><span className="current-stage-chip">{STAGE_INFO[currentStage].label}</span><strong>{dday}</strong></div>
      </header>

      <section className="timeline-card"><div className="timeline-heading"><span>계약 진행단계</span><strong>{contract.progress}% 진행</strong></div><StageTimeline currentStage={currentStage} /></section>

      <nav className="detail-tabs" aria-label="계약 상세 메뉴">
        <a className={tab === "basic" ? "active" : ""} href={`/contracts/${id}`}>기본정보</a>
        {quotation ? <a className={tab === "estimate" ? "active" : ""} href={`/contracts/${id}?tab=estimate`}>견적검토</a> : <span>견적검토<small>후속</small></span>}
        <a className={tab === "documents" ? "active" : ""} href={`/contracts/${id}?tab=documents`}>품의/기안</a>
        <a className={tab === "contract-documents" ? "active" : ""} href={`/contracts/${id}?tab=contract-documents`}>계약서류</a>
        <a className={tab === "construction-documents" ? "active" : ""} href={`/contracts/${id}?tab=construction-documents`}>착공서류</a>
        <a className={tab === "construction-progress" ? "active" : ""} href={`/contracts/${id}?tab=construction-progress`}>공사진행</a>
        <a className={tab === "completion-documents" ? "active" : ""} href={`/contracts/${id}?tab=completion-documents`}>준공서류</a>
        <a className={tab === "inspection" ? "active" : ""} href={`/contracts/${id}?tab=inspection`}>검사검수</a>
        <a className={tab === "warranty" ? "active" : ""} href={`/contracts/${id}?tab=warranty`}>하자관리</a>
        <span>AI 업무비서<small>후속</small></span>
      </nav>

      {tab === "estimate" && quotation ? <QuotationReviewDashboard contractId={id} quotation={quotation} review={quotationReview} /> : tab === "documents" ? <AdministrativeDocumentsWorkspace
        contractId={id}
        currentStage={currentStage}
        purchaseDefault={buildPurchaseRequestContent(contract)}
        internalDefault={buildInternalApprovalContent(contract)}
        documents={administrativeDocuments}
        initialContractMethod={contract.contractMethod}
      /> : tab === "contract-documents" ? <Phase6DocumentWorkspace
        contractId={id} currentStage={currentStage} documentStage="NARA_CONTRACT"
        files={contractDocuments.files} review={contractDocuments.review} items={contractDocuments.items}
      /> : tab === "construction-documents" ? <Phase6DocumentWorkspace
        contractId={id} currentStage={currentStage} documentStage="PRE_CONSTRUCTION"
        files={constructionDocuments.files} review={constructionDocuments.review} items={constructionDocuments.items}
        ddayLabel={constructionDday} isStartDay={isStartDay}
      /> : tab === "construction-progress" ? <Phase7ConstructionWorkspace
        contractId={id} currentStage={currentStage} run={constructionChecklist.run} items={constructionChecklist.items}
        ddayLabel={completionDday} isCompletionDay={isCompletionDay}
      /> : tab === "completion-documents" ? <Phase6DocumentWorkspace
        contractId={id} currentStage={currentStage} documentStage="COMPLETION"
        files={completionDocuments.files} review={completionDocuments.review} items={completionDocuments.items}
        ddayLabel={completionDday} isStartDay={isCompletionDay}
      /> : tab === "inspection" ? <Phase7InspectionWorkspace
        contractId={id} currentStage={currentStage} inspectionDate={contract.inspectionDate} paymentDate={contract.paymentDate}
      /> : tab === "warranty" ? <Phase8WarrantyWorkspace
        contractId={id} currentStage={currentStage} constructionType={contract.constructionType}
        defaultStartDate={contract.inspectionDate ?? contract.actualCompletionDate}
        criteria={warrantyWorkspace.criteria} warranty={warrantyWorkspace.warranty} inspections={warrantyWorkspace.inspections}
      /> : <section className="detail-grid">
        <article className="info-card">
          <div className="card-title"><div><span className="section-kicker">기준정보</span><h2>계약 기본정보</h2></div><span className="read-once-badge">한 번 입력 · 계속 사용</span></div>
          <dl className="info-list">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </article>

        <div className="detail-side-stack">
          <article className="next-action-card">
            <span className="section-kicker">현재 단계</span><h2>{STAGE_INFO[currentStage].label}</h2><p>{STAGE_INFO[currentStage].description}</p>
            {contract.attention && <div className="attention-box">{contract.attention}</div>}
            {currentStage === "COMMITMENT" && <div className="attention-box commitment-guidance">에듀파인 원인행위 처리가 필요합니다.</div>}
            {nextStage ? currentStage === "PURCHASE_REQUEST" || currentStage === "INTERNAL_APPROVAL"
              ? <a className="stage-workspace-link" href={`/contracts/${id}?tab=documents`}>{currentStage === "PURCHASE_REQUEST" ? "품의내용 작성" : "내부기안문 작성"}</a>
              : currentStage === "NARA_CONTRACT"
                ? <a className="stage-workspace-link" href={`/contracts/${id}?tab=contract-documents`}>계약서류 업로드·분석</a>
              : currentStage === "PRE_CONSTRUCTION"
                ? <a className="stage-workspace-link" href={`/contracts/${id}?tab=construction-documents`}>착공서류 업로드·분석</a>
              : currentStage === "IN_CONSTRUCTION"
                ? <a className="stage-workspace-link" href={`/contracts/${id}?tab=construction-progress`}>공사중 확인사항 관리</a>
              : currentStage === "COMPLETION"
                ? <a className="stage-workspace-link" href={`/contracts/${id}?tab=completion-documents`}>준공서류 업로드·분석</a>
              : currentStage === "INSPECTION"
                ? <a className="stage-workspace-link" href={`/contracts/${id}?tab=inspection`}>검사검수·대금지급 확인</a>
              : <AdvanceStageButton contractId={contract.id} label={STAGE_INFO[currentStage].action} />
              : <a className="stage-workspace-link" href={`/contracts/${id}?tab=warranty`}>{warrantyWorkspace.warranty ? "하자관리 일정 확인" : "하자기간 확인·확정"}</a>}
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
