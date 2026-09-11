import type { QuotationReviewItemRecord, QuotationReviewRecord } from "@/db/schema";
import type { ReviewItem } from "@/lib/quotation-review";

const statusInfo = {
  NORMAL: { icon: "✓", label: "정상", className: "normal" },
  CHECK: { icon: "!", label: "확인 필요", className: "check" },
  ERROR: { icon: "×", label: "계산 오류 가능성", className: "error" },
  NO_BASIS: { icon: "−", label: "기준자료 없음", className: "no-basis" },
} as const;

const sectionLabels = { ARITHMETIC: "산술검산", LABOR: "노무비" } as const;
type Review = { review: Pick<QuotationReviewRecord, "warning">; items: Array<QuotationReviewItemRecord | ReviewItem> };

function formatWon(value: number) { return `${new Intl.NumberFormat("ko-KR").format(value)}원`; }
function shownMoney(value: number | null) { return value === null ? "[확인 필요]" : formatWon(Math.round(value)); }

export function PreConfirmationReviewResults({ result }: { result: Review }) {
  const visibleItems = result.items.filter((item) => item.section === "ARITHMETIC" || item.section === "LABOR");
  const summary = [
    ["NORMAL", "정상", visibleItems.filter((item) => item.status === "NORMAL").length],
    ["CHECK", "확인 필요", visibleItems.filter((item) => item.status === "CHECK").length],
    ["ERROR", "계산 오류 가능성", visibleItems.filter((item) => item.status === "ERROR").length],
    ["NO_BASIS", "기준자료 없음", visibleItems.filter((item) => item.status === "NO_BASIS").length],
  ] as const;

  return <>
    <section className="review-dashboard-head pre-confirmation-review-head">
      <div><span className="section-kicker">현황판 등록 전 견적검토 결과</span><h2>결과를 먼저 확인한 뒤 진행 여부를 결정하세요.</h2><p>산술계산과 직종별 견적 단가를 확인합니다. 제비율 판정은 위의 현재 적용 제비율표에서 확인할 수 있습니다.</p></div>
      <span className="human-check-badge">사용자 판단 대기</span>
    </section>
    {result.review.warning && <div className="review-warning">{result.review.warning}</div>}
    <section className="review-summary-grid" aria-label="현황판 등록 전 견적검토 요약">
      {summary.map(([status, label, count]) => { const info = statusInfo[status]; return <article className={`review-summary ${info.className}`} key={status}><span>{info.icon}</span><div><strong>{count}</strong><small>{label}</small></div></article>; })}
    </section>
    <section className="review-results">
      {(Object.keys(sectionLabels) as Array<keyof typeof sectionLabels>).map((section) => {
        const items = visibleItems.filter((item) => item.section === section);
        if (!items.length) return section === "LABOR" ? <article className="review-result-section" key={section}><div className="review-section-heading"><h3>노무비</h3><span>추출 확인 필요</span></div><p>견적서에서 직종별 노무비를 추출하지 못했습니다. 원본에 노무비가 있으면 견적서 다시 분석하기를 실행해 주세요.</p></article> : null;
        return <article className="review-result-section" key={section}><div className="review-section-heading"><h3>{sectionLabels[section]}</h3><span>{items.length}건</span></div><div className="review-result-list">{items.map((item) => {
          const info = statusInfo[item.status as keyof typeof statusInfo] || statusInfo.CHECK;
          const isCeiling = item.section === "STATUTORY" && ["간접노무비", "기타경비", "일반관리비", "이윤"].some((label) => item.label.includes(label));
          return <details className={`review-result-row ${info.className}`} key={item.id}><summary><span className="result-icon">{info.icon}</span><div className="result-name"><strong>{item.label}</strong><small>{item.detail}</small></div><span className="result-value">{shownMoney(item.quotedValue)}</span><span className={`result-status ${info.className}`}>{info.label}</span><span className="result-open">⌄</span></summary><div className="result-detail-grid"><div><span>견적서 값</span><strong>{shownMoney(item.quotedValue)}</strong></div><div><span>{isCeiling ? "허용 상한액" : "기준/계산 값"}</span><strong>{shownMoney(item.expectedValue)}</strong></div><div><span>{isCeiling ? "상한 대비" : "차이"}</span><strong>{item.difference === null ? "-" : `${item.difference > 0 ? "+" : ""}${formatWon(Math.round(item.difference))}`}</strong></div><div><span>계산내용</span><strong>{item.calculation || "-"}</strong></div>{item.evidenceDocumentName ? <div className="evidence-detail"><span>등록 근거자료</span><strong>{item.evidenceDocumentName}{item.evidenceYear ? ` · ${item.evidenceYear}년` : ""}</strong><small>{item.evidenceLocation || "위치 [확인 필요]"}{item.evidenceExcerpt ? ` · ${item.evidenceExcerpt}` : ""}</small></div> : <div className="evidence-detail no-evidence"><span>등록 근거자료</span><strong>등록자료에서 확인 불가</strong><small>지식관리에 관련 기준자료를 먼저 등록하거나 담당자가 직접 확인해 주세요.</small></div>}</div></details>;
        })}</div></article>;
      })}
    </section>
  </>;
}
