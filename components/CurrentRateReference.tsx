"use client";

import type { QuotationExtraction } from "@/lib/estimate";

type Props = {
  data: QuotationExtraction;
  documentName: string | null;
  referenceText: string | null;
};

type AuditRow = {
  label: string;
  rate: number | null;
  formula: string;
  base: number | null;
  quote: number | null;
  condition?: string;
  comparison?: "CEILING" | "EXACT";
  quoteConfirmed?: boolean;
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

function percentIn(value?: string) {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*%?/);
  return match ? Number(match[1]) : null;
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

function differenceWon(value: number | null) {
  if (value === null) return "-";
  return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("ko-KR").format(Math.round(value))}원`;
}

export function CurrentRateReference({ data, documentName, referenceText }: Props) {
  const tableRows = (referenceText || "").split(/\r?\n/).map(cells).filter((row) => row.length >= 3);
  const amount = data.totalAmount;
  const days = constructionDays(data.plannedStartDate, data.plannedCompletionDate);
  const isBuilding = Boolean(data.constructionType?.includes("건축"));
  const usesBuildingReference = isBuilding || (!data.constructionType && Boolean(documentName?.includes("건축공사")));
  const durationRow = amount !== null && days !== null && usesBuildingReference
    ? tableRows.find((row) => row.length >= 4 && row[0].includes("억") && row[1].includes("개월") && amountMatches(row[0], amount) && periodMatches(row[1], days))
    : undefined;
  const priceRow = amount !== null && usesBuildingReference
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
  const itemQuote = (...aliases: string[]) => {
    const item = data.items.find((candidate) => {
      const text = `${candidate.category || ""} ${candidate.trade || ""} ${candidate.itemName || ""} ${candidate.specification || ""} ${candidate.sourceText || ""}`;
      return aliases.some((alias) => text.includes(alias));
    });
    return item?.amount ?? null;
  };
  const namedOtherExpense = itemQuote("기타경비");
  const fixedRate = (name: string) => {
    const row = tableRows.find((candidate) => candidate[0] === name);
    return percentIn(row?.[2]) ?? percentIn(row?.[1]);
  };
  const healthRate = fixedRate("건강보험료");
  const longTermRate = fixedRate("노인장기요양보험료");
  const pensionRate = fixedRate("연금보험료");
  const accidentRate = fixedRate("산재보험료");
  const wageRate = fixedRate("임금채권부담금");
  const asbestosRate = fixedRate("석면분담금");
  const employmentRate = percent(tableRows.find((row) => row[0] === "7등급 미만")?.[2]);
  const healthBase = days === null || data.directLaborCost === null ? null : days >= 30 ? data.directLaborCost : 0;
  const healthLimit = healthRate === null || healthBase === null ? null : Math.round(healthBase * healthRate / 100);
  const retirementBase = amount === null || data.directLaborCost === null ? null : amount >= 100_000_000 ? data.directLaborCost : 0;
  const safetyRate = amount !== null && amount < 500_000_000 && isBuilding
    ? percent(tableRows.find((row) => row[0] === "건축공사" && row.length === 3)?.[1])
    : null;
  const safetyBase = amount !== null && amount < 20_000_000 ? 0 : data.materialCost === null || data.directLaborCost === null ? null : data.materialCost + data.directLaborCost;
  const referenceRows: AuditRow[] = [
    { label: "간접노무비", rate: indirectRate, formula: "직접노무비 × 요율", base: data.directLaborCost, quote: data.indirectLaborCost, comparison: "CEILING" },
    { label: "기타경비", rate: otherRate, formula: "(재료비 + 노무비) × 요율", base: otherBase, quote: namedOtherExpense, comparison: "CEILING", quoteConfirmed: namedOtherExpense !== null },
    { label: "산재보험료", rate: accidentRate, formula: "노무비 × 요율", base: labor, quote: itemQuote("산재보험료") },
    { label: "고용보험료", rate: employmentRate, formula: "노무비 × 요율", base: labor, quote: itemQuote("고용보험료"), condition: "추정금액 등급별 요율" },
    { label: "국민건강보험료", rate: healthRate, formula: days !== null && days < 30 ? "30일 미만 제외" : "직접노무비 × 요율", base: healthBase, quote: itemQuote("국민건강보험료", "건강보험료") },
    { label: "국민연금보험료", rate: pensionRate, formula: days !== null && days < 30 ? "30일 미만 제외" : "직접노무비 × 요율", base: healthBase, quote: itemQuote("국민연금보험료", "연금보험료") },
    { label: "노인장기요양보험료", rate: longTermRate, formula: days !== null && days < 30 ? "30일 미만 제외" : "건강보험료 × 요율", base: days !== null && days < 30 ? 0 : healthLimit, quote: itemQuote("노인장기요양보험료", "노인장기요양보험") },
    { label: "산업안전보건관리비", rate: safetyRate, formula: amount !== null && amount < 20_000_000 ? "총공사금액 2천만원 미만 제외" : "(재료비 + 직접노무비) × 요율", base: safetyBase, quote: data.safetyHealthCost, condition: amount !== null && amount >= 500_000_000 ? "5억원 이상 구간은 기초액·공종조건 확인 필요" : undefined },
    { label: "퇴직공제부금비", rate: fixedRate("퇴직공제부금비"), formula: amount !== null && amount < 100_000_000 ? "추정금액 1억원 미만 제외" : "직접노무비 × 요율", base: retirementBase, quote: itemQuote("퇴직공제부금비") },
    { label: "환경보전비", rate: null, formula: "직접공사비 × 공종별 요율", base: null, quote: itemQuote("환경보전비"), condition: "세부 공종·실내보수 여부 확인 필요" },
    { label: "임금채권부담금", rate: wageRate, formula: "노무비 × 요율", base: labor, quote: itemQuote("임금채권부담금") },
    { label: "석면분담금", rate: asbestosRate, formula: "노무비 × 요율", base: labor, quote: itemQuote("석면분담금") },
    { label: "일반관리비", rate: managementRate, formula: "(재료비 + 노무비 + 경비) × 요율", base: managementBase, quote: data.overhead, comparison: "CEILING" },
    { label: "이윤", rate: profitRate, formula: "(노무비 + 경비 + 일반관리비) × 요율", base: profitBase, quote: data.profit, comparison: "CEILING" },
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
  const evaluatedRows = referenceRows.map((row) => {
    const limit = row.rate === null || row.base === null ? null : Math.round(row.base * row.rate / 100);
    const difference = limit === null || row.quote === null ? null : row.quote - limit;
    const status = limit === null || row.quote === null || row.quoteConfirmed === false
      ? "확인 필요"
      : row.comparison === "CEILING"
        ? row.quote <= limit ? "적합" : "상한 초과"
        : row.quote === limit ? "적합" : "차이 확인";
    return { ...row, limit, difference, status };
  });
  const normalCount = evaluatedRows.filter((row) => row.status === "적합").length;
  const excessCount = evaluatedRows.filter((row) => row.status === "상한 초과" || row.status === "차이 확인").length;
  const pendingCount = evaluatedRows.filter((row) => row.status === "확인 필요").length;

  return <section className="rate-reference-card">
    <div className="rate-reference-heading"><div><span>등록 지식자료 기준</span><h2>현재 적용 제비율표</h2></div><strong>{effectiveDate}</strong></div>
    <div className="rate-condition-summary">
      <span>공종 <strong>{data.constructionType || "[확인 필요]"}</strong></span>
      <span>직접공사비·추정가격 대입값 <strong>{won(amount)}</strong></span>
      <span>공사기간 <strong>{days === null ? "[확인 필요]" : `${days}일`}</strong></span>
    </div>
    {!referenceText && <p className="rate-reference-warning">등록된 건축공사 간접공사비 MD 원문을 읽지 못했습니다. 지식관리에서 해당 MD 파일 등록상태를 확인해 주세요.</p>}
    {!data.constructionType && usesBuildingReference && <p className="rate-reference-warning">공사종류가 비어 있어 등록된 건축공사 기준으로 금액을 먼저 계산했습니다. 최종 판정 전 공사종류를 확인해 주세요.</p>}
    {data.constructionType && !isBuilding && <p className="rate-reference-warning">현재 등록된 기준표는 건축공사용입니다. 다른 공종은 해당 공종 기준자료가 필요합니다.</p>}
    {referenceText && <p className="rate-reference-scope">현재 화면은 견적 총액을 직접공사비·추정가격에 대입한 참고 계산입니다. 두 기준금액이 다르면 담당자가 실제 값을 별도로 확인해야 합니다.</p>}
    <div className="rate-audit-summary" aria-label="제비율 대차대조 요약">
      <article className="normal"><span>적합</span><strong>{normalCount}건</strong></article>
      <article className="excess"><span>초과·차이</span><strong>{excessCount}건</strong></article>
      <article className="pending"><span>확인 필요</span><strong>{pendingCount}건</strong></article>
    </div>
    <div className="rate-audit-table-wrap"><table className="rate-audit-table"><thead><tr><th>비목명</th><th>등록기준액</th><th>견적서 금액</th><th>차액</th><th>판정</th><th>적용 요율·산식</th></tr></thead><tbody>{evaluatedRows.map((row) => <tr key={row.label}><td><strong>{row.label}</strong></td><td className="rate-limit">{won(row.limit)}</td><td>{won(row.quote)}</td><td className={row.difference !== null && row.difference > 0 ? "rate-excess-value" : ""}>{differenceWon(row.difference)}</td><td><span className={`rate-audit-status ${row.status === "적합" ? "normal" : row.status === "상한 초과" || row.status === "차이 확인" ? "excess" : "pending"}`}>{row.status}</span></td><td><strong>{row.rate === null ? "[조건 확인 필요]" : `${row.comparison === "CEILING" ? "상한 " : "요율 "}${row.rate}%`}</strong><small>{row.formula}{row.condition ? ` · ${row.condition}` : ""}{row.quote === null ? " · 견적서 비목별 금액 재추출 필요" : ""}</small></td></tr>)}</tbody></table></div>
    {fixedRows.length > 0 && <details className="fixed-rate-details"><summary>사회보험·고정요율 보기</summary>{fixedRows.map((row) => <div key={row.label}><strong>{row.label}</strong><span>{row.formula}</span><small>{row.condition}</small></div>)}</details>}
    <footer><strong>{documentName || "간접공사비 기준자료 [확인 필요]"}</strong><span>이 표는 담당자가 AI 검토결과와 직접 대조하기 위한 참고화면입니다.</span></footer>
  </section>;
}
