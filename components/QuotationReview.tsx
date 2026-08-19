"use client";

import Link from "next/link";
import { useState } from "react";
import type { QuotationExtraction } from "@/lib/estimate";

type Props = { analysisId: string; originalName: string; initial: QuotationExtraction; confirmedContractId: string | null };

const mainFields = [
  ["projectName", "공사명", true], ["constructionType", "공사종류", true], ["companyName", "업체명", true],
  ["location", "공사장소", true], ["purpose", "공사목적", true], ["quotationDate", "견적일자", false],
  ["plannedStartDate", "착공예정일", false], ["plannedCompletionDate", "준공예정일", false],
] as const;

const moneyFields = [
  ["totalAmount", "총액", true], ["supplyAmount", "공급가액", false], ["vatAmount", "부가가치세", false],
  ["materialCost", "재료비", false], ["directLaborCost", "직접노무비", false], ["indirectLaborCost", "간접노무비", false],
  ["expenses", "경비", false], ["statutoryExpenses", "법정경비", false], ["overhead", "일반관리비", false],
  ["profit", "이윤", false], ["safetyHealthCost", "산업안전보건관리비", false],
] as const;

function money(value: number | null) { return value === null ? "" : new Intl.NumberFormat("ko-KR").format(value); }
function parseMoney(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

export function QuotationReview({ analysisId, originalName, initial, confirmedContractId }: Props) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const updateText = (field: keyof QuotationExtraction, value: string) => setData((current) => ({ ...current, [field]: value.trimStart() || null }));
  const updateMoney = (field: keyof QuotationExtraction, value: string) => setData((current) => ({ ...current, [field]: parseMoney(value) }));

  function updateItem(index: number, field: string, value: string) {
    setData((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? {
        ...item,
        [field]: ["quantity", "unitPrice", "amount"].includes(field)
          ? (field === "quantity" ? (value ? Number(value.replace(/,/g, "")) : null) : parseMoney(value))
          : (value || null),
      } : item),
    }));
  }

  async function confirm() {
    if (confirmedContractId || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/estimates/${analysisId}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json() as { contractId?: string; error?: string };
      if (!response.ok || !result.contractId) throw new Error(result.error || "계약업무를 시작하지 못했습니다.");
      window.location.assign(`/contracts/${result.contractId}?tab=estimate`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "계약업무를 시작하지 못했습니다.");
      setBusy(false);
    }
  }

  if (confirmedContractId) return <section className="review-complete"><span>✓</span><h2>이미 계약업무를 시작했습니다.</h2><p>확정한 견적정보는 계약 상세화면에서 계속 확인할 수 있습니다.</p><Link href={`/contracts/${confirmedContractId}?tab=estimate`}>계약 건으로 이동</Link></section>;

  const emptyCount = mainFields.filter(([field, , required]) => required && !data[field]).length + (!data.totalAmount ? 1 : 0);

  return (
    <>
      <section className="review-notice">
        <div><span className="section-kicker">AI 추출 완료</span><h2>견적서에서 다음과 같이 읽었습니다.</h2><p><strong>{originalName}</strong> · 문서에 없거나 읽지 못한 값은 비워두었습니다.</p></div>
        <span className={emptyCount ? "review-status needs" : "review-status ready"}>{emptyCount ? `필수입력 ${emptyCount}개` : "확정 가능"}</span>
      </section>

      <section className="review-card">
        <div className="review-heading"><div><span className="section-kicker">기본정보</span><h2>계약 기본정보 확인</h2></div><span className="human-check-badge">담당자 확인 필수</span></div>
        <div className="review-form-grid">
          {mainFields.map(([field, label, required]) => (
            <label className={required && !data[field] ? "field-missing" : ""} key={field}>
              <span>{label}{required && <em>필수</em>}</span>
              {field.includes("Date") ? <input type="date" value={String(data[field] ?? "")} onChange={(event) => updateText(field, event.target.value)} /> : field === "purpose" ? <textarea rows={2} value={String(data[field] ?? "")} placeholder="문서에 없으면 직접 입력" onChange={(event) => updateText(field, event.target.value)} /> : <input value={String(data[field] ?? "")} placeholder="문서에 없으면 직접 입력" onChange={(event) => updateText(field, event.target.value)} />}
            </label>
          ))}
        </div>
      </section>

      <section className="review-card">
        <div className="review-heading"><div><span className="section-kicker">금액 구성</span><h2>추출 금액 확인</h2></div><span className="phase4-badge">산술검산은 Phase 4</span></div>
        <div className="money-grid">
          {moneyFields.map(([field, label, required]) => <label className={required && !data[field] ? "field-missing" : ""} key={field}><span>{label}{required && <em>필수</em>}</span><div><input inputMode="numeric" value={money(data[field] as number | null)} placeholder="확인 필요" onChange={(event) => updateMoney(field, event.target.value)} /><small>원</small></div></label>)}
        </div>
      </section>

      <section className="review-card item-card">
        <div className="review-heading"><div><span className="section-kicker">세부내역</span><h2>공종·직종·자재 항목</h2></div><span className="item-count">{data.items.length}개 항목</span></div>
        {data.items.length ? <div className="quotation-table-wrap"><table className="quotation-table"><thead><tr><th>구분</th><th>공종/직종</th><th>품명</th><th>규격</th><th>단위</th><th>수량</th><th>단가</th><th>금액</th></tr></thead><tbody>{data.items.map((item, index) => <tr key={`${index}-${item.sourceText ?? "item"}`}><td><input value={item.category ?? ""} onChange={(event) => updateItem(index, "category", event.target.value)} /></td><td><input value={item.trade ?? ""} onChange={(event) => updateItem(index, "trade", event.target.value)} /></td><td><input value={item.itemName ?? ""} onChange={(event) => updateItem(index, "itemName", event.target.value)} /></td><td><input value={item.specification ?? ""} onChange={(event) => updateItem(index, "specification", event.target.value)} /></td><td><input value={item.unit ?? ""} onChange={(event) => updateItem(index, "unit", event.target.value)} /></td><td><input inputMode="decimal" value={item.quantity ?? ""} onChange={(event) => updateItem(index, "quantity", event.target.value)} /></td><td><input inputMode="numeric" value={money(item.unitPrice)} onChange={(event) => updateItem(index, "unitPrice", event.target.value)} /></td><td><input inputMode="numeric" value={money(item.amount)} onChange={(event) => updateItem(index, "amount", event.target.value)} /></td></tr>)}</tbody></table></div> : <div className="empty-items">세부내역을 읽지 못했습니다. 기본정보를 확인한 뒤 계약업무를 시작할 수 있습니다.</div>}
      </section>

      <section className="confirm-bar"><div><strong>AI는 견적서를 읽었고, 최종 확정은 담당자가 합니다.</strong><small>확정 후 계약 건이 생성되며 품의 단계에서 시작합니다.</small>{error && <p>{error}</p>}</div><button type="button" disabled={busy} onClick={confirm}>{busy ? "저장 중…" : "확정하고 계약업무 시작"}</button></section>
    </>
  );
}
