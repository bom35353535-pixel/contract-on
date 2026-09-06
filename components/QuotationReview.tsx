"use client";

import { useState } from "react";
import type { QuotationReviewItemRecord, QuotationReviewRecord } from "@/db/schema";
import type { QuotationExtraction } from "@/lib/estimate";
import { CurrentRateReference } from "./CurrentRateReference";
import { PreConfirmationReviewResults } from "./PreConfirmationReviewResults";
import { SupplierSanctionCheck } from "./SupplierSanctionCheck";

type Review = { review: QuotationReviewRecord; items: QuotationReviewItemRecord[] } | null;
type Props = {
  analysisId: string;
  originalName: string;
  initial: QuotationExtraction;
  confirmedContractId: string | null;
  review: Review;
  knowledgeReadyCount: number;
  knowledgePendingCount: number;
  rateReferenceDocumentName: string | null;
  rateReferenceText: string | null;
};

const mainFields = [
  ["projectName", "공사명", true], ["constructionType", "공사종류", true], ["companyName", "업체명", true],
  ["businessRegistrationNumber", "사업자등록번호", false],
  ["location", "공사장소", true], ["purpose", "공사목적", true],
  ["plannedStartDate", "착공예정일", true], ["plannedCompletionDate", "준공예정일", true],
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

export function QuotationReview({ analysisId, originalName, initial, confirmedContractId, review, knowledgeReadyCount, knowledgePendingCount, rateReferenceDocumentName, rateReferenceText }: Props) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reviewFresh, setReviewFresh] = useState(Boolean(review));
  const updateText = (field: keyof QuotationExtraction, value: string) => {
    setReviewFresh(false);
    setData((current) => ({ ...current, [field]: value.trimStart() || null }));
  };
  const updateMoney = (field: keyof QuotationExtraction, value: string) => {
    setReviewFresh(false);
    setData((current) => ({ ...current, [field]: parseMoney(value) }));
  };

  function updateItem(index: number, field: string, value: string) {
    setReviewFresh(false);
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
    if (emptyCount) { setError(`필수항목 ${emptyCount}개를 모두 입력한 뒤 다시 검토해 주세요.`); return; }
    if (!review || !reviewFresh) { setError("현재 입력값으로 견적검토를 다시 실행하고 결과를 확인해 주세요."); return; }
    if (!window.confirm("이 견적으로 계속 진행하시겠습니까?\n확인하면 계약 건이 생성되고 공사관리 현황판에 표시됩니다.")) return;
    setBusy("confirm"); setError("");
    try {
      const response = await fetch(`/api/estimates/${analysisId}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json() as { contractId?: string; error?: string };
      if (!response.ok || !result.contractId) throw new Error(result.error || "계약업무를 시작하지 못했습니다.");
      window.location.assign(`/contracts/${result.contractId}?tab=estimate`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "계약업무를 시작하지 못했습니다.");
      setBusy("");
    }
  }

  async function runReview() {
    if (busy) return;
    if (emptyCount) { setError(`필수항목 ${emptyCount}개를 모두 입력해야 견적검토를 실행할 수 있습니다.`); return; }
    if (data.plannedStartDate && data.plannedCompletionDate && data.plannedStartDate > data.plannedCompletionDate) {
      setError("준공예정일은 착공예정일보다 빠를 수 없습니다."); return;
    }
    setBusy("review"); setError("");
    try {
      const response = await fetch(`/api/estimates/${analysisId}/review`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "견적검토를 실행하지 못했습니다.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "견적검토를 실행하지 못했습니다.");
      setBusy("");
    }
  }

  if (confirmedContractId) return <section className="review-complete"><span>✓</span><h2>이미 계약업무를 시작했습니다.</h2><p>확정한 견적정보는 계약 상세화면에서 계속 확인할 수 있습니다.</p><a href={`/contracts/${confirmedContractId}?tab=estimate`}>계약 건으로 이동</a></section>;

  const emptyCount = mainFields.filter(([field, , required]) => required && !data[field]).length + (!data.totalAmount ? 1 : 0);

  return (
    <>
      <section className="review-notice">
        <div><span className="section-kicker">AI 추출 완료</span><h2>견적서에서 다음과 같이 읽었습니다.</h2><p><strong>{originalName}</strong> · 문서에 없거나 읽지 못한 값은 비워두었습니다.</p></div>
        <span className={emptyCount ? "review-status needs" : "review-status ready"}>{emptyCount ? `필수입력 ${emptyCount}개` : "확정 가능"}</span>
      </section>

      <section className={`knowledge-first-review ${knowledgeReadyCount ? "ready" : "needs"}`}>
        <div><span className="workflow-step-number">1</span><div><strong>지식자료 먼저 준비</strong><small>{knowledgeReadyCount ? `검색 가능한 자료 ${knowledgeReadyCount}건으로 검토합니다.` : knowledgePendingCount ? `원본 ${knowledgePendingCount}건이 등록되어 있으나 검색 색인이 필요합니다.` : "등록된 검색자료가 없습니다. 견적검토 전에 지식자료를 먼저 올릴 수 있습니다."}</small></div></div>
        <a href="/knowledge">지식관리에서 먼저 업로드</a>
      </section>

      <div className="review-reference-grid">
        <div className="review-reference-main">
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
            <p className="rate-condition-note"><strong>제비율 판정 안내</strong> 간접노무비와 기타경비율은 직접공사비와 공사기간, 일반관리비와 이윤은 추정가격 구간에 따라 달라집니다.</p>
          </section>

          <section className="review-card">
            <div className="review-heading"><div><span className="section-kicker">금액 구성</span><h2>추출 금액 확인</h2></div><span className="phase4-badge">검토 전 금액 확인</span></div>
            <div className="money-grid">
              {moneyFields.map(([field, label, required]) => <label className={required && !data[field] ? "field-missing" : ""} key={field}><span>{label}{required && <em>필수</em>}</span><div><input inputMode="numeric" value={money(data[field] as number | null)} placeholder="확인 필요" onChange={(event) => updateMoney(field, event.target.value)} /><small>원</small></div></label>)}
            </div>
          </section>
        </div>
        <aside className="review-reference-aside">
          <CurrentRateReference data={data} documentName={rateReferenceDocumentName} referenceText={rateReferenceText} />
          <SupplierSanctionCheck companyName={data.companyName} businessRegistrationNumber={data.businessRegistrationNumber} />
        </aside>
      </div>

      <section className="review-card item-card">
        <div className="review-heading"><div><span className="section-kicker">세부내역</span><h2>공종·직종·자재 항목</h2></div><span className="item-count">{data.items.length}개 항목</span></div>
        {data.items.length ? <div className="quotation-table-wrap"><table className="quotation-table"><thead><tr><th>구분</th><th>공종/직종</th><th>품명</th><th>규격</th><th>단위</th><th>수량</th><th>단가</th><th>금액</th></tr></thead><tbody>{data.items.map((item, index) => <tr key={`${index}-${item.sourceText ?? "item"}`}><td><input value={item.category ?? ""} onChange={(event) => updateItem(index, "category", event.target.value)} /></td><td><input value={item.trade ?? ""} onChange={(event) => updateItem(index, "trade", event.target.value)} /></td><td><input value={item.itemName ?? ""} onChange={(event) => updateItem(index, "itemName", event.target.value)} /></td><td><input value={item.specification ?? ""} onChange={(event) => updateItem(index, "specification", event.target.value)} /></td><td><input value={item.unit ?? ""} onChange={(event) => updateItem(index, "unit", event.target.value)} /></td><td><input inputMode="decimal" value={item.quantity ?? ""} onChange={(event) => updateItem(index, "quantity", event.target.value)} /></td><td><input inputMode="numeric" value={money(item.unitPrice)} onChange={(event) => updateItem(index, "unitPrice", event.target.value)} /></td><td><input inputMode="numeric" value={money(item.amount)} onChange={(event) => updateItem(index, "amount", event.target.value)} /></td></tr>)}</tbody></table></div> : <div className="empty-items">세부내역을 읽지 못했습니다. 기본정보를 확인한 뒤 계약업무를 시작할 수 있습니다.</div>}
      </section>

      {!review ? <section className="review-start-card pre-confirmation-start"><span className="review-start-icon">2</span><h2>현황판 등록 전에 견적검토를 실행하세요.</h2><p>수량×단가와 합계는 코드로 검산하고, 노임·자재·제비율은 등록된 지식자료에서만 근거를 찾습니다.</p><button className="run-review-action" type="button" disabled={!!busy || emptyCount > 0} onClick={runReview}>{busy === "review" ? "검산·근거 확인 중…" : emptyCount ? `필수항목 ${emptyCount}개 입력 후 분석` : "견적검토 결과 만들기"}</button></section> : <><PreConfirmationReviewResults result={review} /><div className="pre-review-actions"><button type="button" disabled={!!busy || emptyCount > 0} onClick={runReview}>{busy === "review" ? "다시 검토 중…" : emptyCount ? `필수항목 ${emptyCount}개 입력 후 분석` : reviewFresh ? "수정한 내용으로 다시 검토" : "입력값이 바뀌었습니다 · 다시 검토"}</button></div></>}

      <section className={`confirm-bar ${review && reviewFresh && !emptyCount ? "ready-to-confirm" : "waiting-review"}`}><div><strong>{emptyCount ? `필수항목 ${emptyCount}개를 입력한 뒤 견적검토를 다시 실행해 주세요.` : review && reviewFresh ? "검토결과를 확인했습니다. 이 견적으로 계속 진행하시겠습니까?" : review ? "입력값이 바뀌었습니다. 현재 내용으로 다시 검토해 주세요." : "먼저 위에서 견적검토 결과를 확인해 주세요."}</strong><small>아직 공사관리 현황판에는 반영되지 않았습니다. 사용자 승인 후에만 계약 건이 생성됩니다.</small>{error && <p>{error}</p>}</div><button type="button" disabled={!!busy || !review || !reviewFresh || emptyCount > 0} onClick={confirm}>{busy === "confirm" ? "현황판 등록 중…" : "예, 이 견적으로 현황판 등록"}</button></section>
    </>
  );
}
