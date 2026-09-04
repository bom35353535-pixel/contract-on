"use client";

import type { QuotationExtraction } from "@/lib/estimate";

type Props = {
  data: QuotationExtraction;
  documentName: string | null;
  referenceText: string | null;
};

function cells(line: string) {
  if (!line.trim().startsWith("|")) return [];
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function percent(value?: string) {
  if (!value) return null;
  const parsed = Number(value.replace(/[%*,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function amountMatches(label: string, amount: number) {
  const normalized = label.replace(/,/g, "").replace(/\s/g, "");
  const less = normalized.match(/^(\d+(?:\.\d+)?)억미만$/);
  if (less) return amount < Number(less[1]) * 100_000_000;
  const range = normalized.match(/^(\d+(?:\.\d+)?)억이상~(\d+(?:\.\d+)?)억미만$/);
  if (range) return amount >= Number(range[1]) * 100_000_000 && amount < Number(range[2]) * 100_000_000;
  const more = normalized.match(/^(\d+(?:\.\d+)?)억이상$/);
  return more ? amount >= Number(more[1]) * 100_000_000 : false;
}

function constructionDays(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? Math.floor((endMs - startMs) / 86_400_000) + 1 : null;
}

function periodMatches(label: string, days: number) {
  if (label.includes("6개월 이하")) return days <= 183;
  if (label.includes("7~12개월")) return days >= 184 && days <= 365;
  if (label.includes("13~36개월")) return days >= 366 && days <= 1_095;
  if (label.includes("36개월 초과")) return days >= 1_096;
  return false;
}

function won(value: number | null) {
  return value === null ? "[확인 필요]" : `${new Intl.NumberFormat("ko-KR").format(Math.round(value))}원`;
}

export function CurrentRateReference({ data, documentName, referenceText }: Props) {
  const tableRows = (referenceText || "").split(/\r?\n/).map(cells).filter((row) => row.length >= 3);
  const amount = data.totalAmount;
  const days = constructionDays(data.plannedStartDate, data.plannedCompletionDate);
  const isBuilding = Boolean(data.constructionType?.includes("건축"));
  const durationRow = amount !== null && days !== null && isBuilding
    ? tableRows.find((row) => row.length >= 4 && row[0].includes("억") && row[1].includes("개월") && amountMatches(row[0], amount) && periodMatches(row[1], days))
    : undefined;
  const priceRow = amount !== null && isBuilding
    ? tableRows.find((row) => row.length >= 4 && row[0].includes("억") && row[1].includes("%") && row[3].includes("%") && amountMatches(row[0], amount))
    : undefined;

  const indirectRate = percent(durationRow?.[2]);
  const otherRate = percent(durationRow?.[3]);
  const managementRate = percent(priceRow?.[1]);
  const profitRate = percent(priceRow?.[3]);
  const labor = data.directLaborCost === null && data.indirectLaborCost === null ? null : (data.directLaborCost || 0) + (data.indirectLaborCost || 0);
  const otherBase = data.materialCost === null || labor === null ? null : data.materialCost + labor;
  const managementBase = data.materialCost === null || labor === null || data.expenses === null ? null : data.materialCost + labor + data.expenses;
  const profitBase = labor === null || data.expenses === null || data.overhead === null ? null : labor + data.expenses + data.overhead;
  const referenceRows = [
    { label: "간접노무비", rate: indirectRate, formula: "직접노무비 × 요율", base: data.directLaborCost, quote: data.indirectLaborCost, ceiling: false },
    { label: "기타경비", rate: otherRate, formula: "(재료비 + 노무비) × 요율", base: otherBase, quote: data.expenses, ceiling: false },
    { label: "일반관리비", rate: managementRate, formula: "(재료비 + 노무비 + 경비) × 요율", base: managementBase, quote: data.overhead, ceiling: true },
    { label: "이윤", rate: profitRate, formula: "(노무비 + 경비 + 일반관리비) × 요율", base: profitBase, quote: data.profit, ceiling: true },
  ];
  const fixedNames = ["건강보험료", "노인장기요양보험료", "연금보험료", "고용보험료", "산재보험료"];
  const fixedRows = fixedNames.map((name) => {
    const row = tableRows.find((candidate) => candidate[0] === name);
    return row ? { label: name, formula: row[1], condition: row[3] || row[2] } : null;
  }).filter((row): row is { label: string; formula: string; condition: string } => Boolean(row));
  const effectiveDate = referenceText?.match(/effective_from:\s*["']?(\d{4}-\d{2}-\d{2})/)?.[1]
    || referenceText?.match(/적용시기:\s*`?(\d{4}-\d{2}-\d{2})/)?.[1]
    || referenceText?.match(/기준일[^\d]*(\d{4}-\d{2}-\d{2})/)?.[1]
    || "[확인 필요]";

  return <section className="rate-reference-card">
    <div className="rate-reference-heading"><div><span>등록 지식자료 기준</span><h2>현재 적용 제비율표</h2></div><strong>{effectiveDate}</strong></div>
    <div className="rate-condition-summary">
      <span>공종 <strong>{data.constructionType || "[확인 필요]"}</strong></span>
      <span>직접공사비·추정가격 대입값 <strong>{won(amount)}</strong></span>
      <span>공사기간 <strong>{days === null ? "[확인 필요]" : `${days}일`}</strong></span>
    </div>
    {!referenceText && <p className="rate-reference-warning">등록된 건축공사 간접공사비 MD 원문을 읽지 못했습니다. 지식관리에서 해당 MD 파일 등록상태를 확인해 주세요.</p>}
    {!isBuilding && <p className="rate-reference-warning">현재 등록된 기준표는 건축공사용입니다. 다른 공종은 해당 공종 기준자료가 필요합니다.</p>}
    {referenceText && <p className="rate-reference-scope">현재 화면은 견적 총액을 직접공사비·추정가격에 대입한 참고 계산입니다. 두 기준금액이 다르면 담당자가 실제 값을 별도로 확인해야 합니다.</p>}
    <div className="rate-reference-list">
      {referenceRows.map((row) => {
        const calculated = row.rate === null || row.base === null ? null : Math.round(row.base * row.rate / 100);
        const status = calculated === null || row.quote === null ? "판정 대기" : row.ceiling ? (row.quote <= calculated ? "상한 이내" : "상한 초과") : (row.quote === calculated ? "일치" : "차이 확인");
        return <article key={row.label}>
          <div><strong>{row.label}</strong><b>{row.rate === null ? "[조건 입력 필요]" : `${row.rate}%`}</b></div>
          <p>{row.formula}</p>
          <small>기준 계산액 {won(calculated)} · 견적 {won(row.quote)} <em className={status === "상한 초과" || status === "차이 확인" ? "needs" : ""}>{status}</em></small>
        </article>;
      })}
    </div>
    {fixedRows.length > 0 && <details className="fixed-rate-details"><summary>사회보험·고정요율 보기</summary>{fixedRows.map((row) => <div key={row.label}><strong>{row.label}</strong><span>{row.formula}</span><small>{row.condition}</small></div>)}</details>}
    <footer><strong>{documentName || "간접공사비 기준자료 [확인 필요]"}</strong><span>이 표는 담당자가 AI 검토결과와 직접 대조하기 위한 참고화면입니다.</span></footer>
  </section>;
}
