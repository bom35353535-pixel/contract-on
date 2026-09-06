import type { QuotationAnalysisRecord, QuotationItemRecord, QuotationReviewItemRecord, QuotationReviewRecord } from "@/db/schema";
import { formatWon } from "@/lib/contracts";
import { RunQuotationReviewButton } from "./RunQuotationReviewButton";

const statusInfo = {
  NORMAL: { icon: "✓", label: "정상", className: "normal" },
  CHECK: { icon: "!", label: "확인 필요", className: "check" },
  ERROR: { icon: "×", label: "계산 오류 가능성", className: "error" },
  NO_BASIS: { icon: "−", label: "기준자료 없음", className: "no-basis" },
} as const;

const sectionLabels = { ARITHMETIC: "산술검산", LABOR: "노무비", MATERIAL: "재료비", STATUTORY: "법정경비·제비율" } as const;

type Quotation = { analysis: QuotationAnalysisRecord; items: QuotationItemRecord[] };
type Review = { review: QuotationReviewRecord; items: QuotationReviewItemRecord[] } | null;

function shownMoney(value: number | null) { return value === null ? "[확인 필요]" : formatWon(Math.round(value)); }

export function QuotationReviewDashboard({ contractId, quotation, review }: { contractId: string; quotation: Quotation; review: Review }) {
  if (!review) return <section className="review-start-card"><span className="review-start-icon">⌕</span><h2>등록자료 기반 견적검토를 시작하세요.</h2><p>수량×단가와 합계는 코드로 다시 계산하고, 노임·자재·제비율은 지식관리에 등록된 자료에서만 기준을 찾습니다.</p><RunQuotationReviewButton contractId={contractId} /></section>;

  const summary = [
    ["NORMAL", "정상", review.review.normalCount], ["CHECK", "확인 필요", review.review.checkCount],
    ["ERROR", "계산 오류 가능성", review.review.errorCount], ["NO_BASIS", "기준자료 없음", review.review.noBasisCount],
  ] as const;

  return <>
    <section className="review-dashboard-head">
      <div><span className="section-kicker">견적검토 결과</span><h2>AI는 근거를 찾고, 계산은 코드가 수행했습니다.</h2><p>최종 적정·부적정 판단은 담당자가 확정합니다. · 최근 검토 {review.review.createdAt.slice(0, 10)}</p></div>
      <RunQuotationReviewButton contractId={contractId} rerun />
    </section>
    {review.review.warning && <div className="review-warning">{review.review.warning}</div>}
    <section className="review-summary-grid" aria-label="견적검토 요약">
      {summary.map(([status, label, count]) => { const info = statusInfo[status]; return <article className={`review-summary ${info.className}`} key={status}><span>{info.icon}</span><div><strong>{count}</strong><small>{label}</small></div></article>; })}
    </section>
    <section className="review-results">
      {(Object.keys(sectionLabels) as Array<keyof typeof sectionLabels>).map((section) => {
        const items = review.items.filter((item) => item.section === section);
        if (!items.length) return null;
        return <article className="review-result-section" key={section}><div className="review-section-heading"><h3>{sectionLabels[section]}</h3><span>{items.length}건</span></div><div className="review-result-list">{items.map((item) => {
          const info = statusInfo[item.status as keyof typeof statusInfo] || statusInfo.CHECK;
          const isCeiling = item.section === "STATUTORY" && ["간접노무비", "기타경비", "일반관리비", "이윤"].some((label) => item.label.includes(label));
          return <details className={`review-result-row ${info.className}`} key={item.id}><summary><span className="result-icon">{info.icon}</span><div className="result-name"><strong>{item.label}</strong><small>{item.detail}</small></div><span className="result-value">{shownMoney(item.quotedValue)}</span><span className={`result-status ${info.className}`}>{info.label}</span><span className="result-open">⌄</span></summary><div className="result-detail-grid"><div><span>견적서 값</span><strong>{shownMoney(item.quotedValue)}</strong></div><div><span>{isCeiling ? "허용 상한액" : "기준/계산 값"}</span><strong>{shownMoney(item.expectedValue)}</strong></div><div><span>{isCeiling ? "상한 대비" : "차이"}</span><strong>{item.difference === null ? "-" : `${item.difference > 0 ? "+" : ""}${formatWon(Math.round(item.difference))}${item.differenceRate === null ? "" : ` (${item.differenceRate > 0 ? "+" : ""}${item.differenceRate}%)`}`}</strong></div><div><span>계산내용</span><strong>{item.calculation || "-"}</strong></div>{item.evidenceDocumentName ? <div className="evidence-detail"><span>등록 근거자료</span><strong>{item.evidenceDocumentName}{item.evidenceYear ? ` · ${item.evidenceYear}년` : ""}</strong><small>{item.evidenceLocation || "검색된 위치 [확인 필요]"}{item.evidenceExcerpt ? ` · ${item.evidenceExcerpt}` : ""}</small></div> : <div className="evidence-detail no-evidence"><span>등록 근거자료</span><strong>등록자료에서 확인 불가</strong><small>지식관리에 관련 기준자료를 추가하거나 담당자가 직접 확인해 주세요.</small></div>}</div></details>;
        })}</div></article>;
      })}
    </section>
    <details className="confirmed-quotation-details"><summary>담당자가 확정한 견적서 추출정보 보기</summary><div className="review-card contract-estimate-card"><p className="estimate-source">원본: {quotation.analysis.originalName} · {quotation.analysis.confirmedAt?.slice(0, 10)} 확정</p><dl className="info-list">{[["총액", quotation.analysis.totalAmount], ["공급가액", quotation.analysis.supplyAmount], ["부가가치세", quotation.analysis.vatAmount], ["재료비", quotation.analysis.materialCost], ["직접노무비", quotation.analysis.directLaborCost], ["경비", quotation.analysis.expenses]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{shownMoney(value as number | null)}</dd></div>)}</dl>{quotation.items.length > 0 && <div className="quotation-table-wrap"><table className="quotation-table readonly"><thead><tr><th>구분</th><th>공종/직종</th><th>품명</th><th>규격</th><th>단위</th><th>수량</th><th>단가</th><th>금액</th></tr></thead><tbody>{quotation.items.map((item) => <tr key={item.id}><td>{item.category ?? "-"}</td><td>{item.trade ?? "-"}</td><td>{item.itemName ?? "-"}</td><td>{item.specification ?? "-"}</td><td>{item.unit ?? "-"}</td><td>{item.quantity ?? "-"}</td><td>{shownMoney(item.unitPrice)}</td><td>{shownMoney(item.amount)}</td></tr>)}</tbody></table></div>}</div></details>
  </>;
}
