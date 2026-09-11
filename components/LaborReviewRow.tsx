type LaborReviewItem = {
  id: string | number;
  label: string;
  status: string;
  quotedValue: number | null;
  expectedValue: number | null;
  difference: number | null;
  evidenceDocumentName?: string | null;
  evidenceYear?: number | null;
  evidenceLocation?: string | null;
};

const laborStatus = {
  NORMAL: { icon: "✓", label: "일치", className: "normal" },
  CHECK: { icon: "!", label: "불일치", className: "check" },
  ERROR: { icon: "×", label: "계산 오류", className: "error" },
  NO_BASIS: { icon: "−", label: "기준자료 없음", className: "no-basis" },
} as const;

function shownMoney(value: number | null) {
  return value === null ? "없음" : `${new Intl.NumberFormat("ko-KR").format(Math.round(value))}원`;
}

export function LaborReviewRow({ item }: { item: LaborReviewItem }) {
  const info = laborStatus[item.status as keyof typeof laborStatus] || laborStatus.CHECK;
  return <div className={`review-result-row labor-visible-row ${info.className}`}>
    <div className="labor-visible-heading">
      <span className="result-icon">{info.icon}</span>
      <strong className="labor-occupation">{item.label}</strong>
      <div><span>견적단가</span><strong>{shownMoney(item.quotedValue)}</strong></div>
      <div><span>등록 기준단가</span><strong>{shownMoney(item.expectedValue)}</strong></div>
      <span className={`result-status ${info.className}`}>{info.label}</span>
    </div>
    <div className="labor-visible-meta">
      <div><span>차이</span><strong>{item.difference === null ? "-" : `${item.difference > 0 ? "+" : ""}${shownMoney(item.difference)}`}</strong></div>
      <div><span>등록 근거자료</span><strong>{item.evidenceDocumentName ? `${item.evidenceDocumentName}${item.evidenceYear ? ` · ${item.evidenceYear}년` : ""}` : "기준자료 없음"}</strong>{item.evidenceLocation && <small>{item.evidenceLocation}</small>}</div>
    </div>
  </div>;
}
