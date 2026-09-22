"use client";

import { useEffect, useState } from "react";
import type { QuotationReviewItemRecord, QuotationReviewRecord } from "@/db/schema";
import type { QuotationExtraction } from "@/lib/estimate";
import { CurrentRateReference } from "./CurrentRateReference";
import { PreConfirmationReviewResults } from "./PreConfirmationReviewResults";
import { SupplierSanctionCheck } from "./SupplierSanctionCheck";
import { buildEvidenceTargets, type ReviewItem } from "@/lib/quotation-review";
import { selectRelevantAuditCases, type AuditCase } from "@/lib/audit-cases";
import { RelatedAuditCases } from "./RelatedAuditCases";

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
  auditCases: AuditCase[];
  auditSourceStatus: "READY" | "MISSING" | "INVALID";
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

const constructionTypeOptions = ["건축공사", "전기공사", "소방공사", "방송통신공사", "기타공사"] as const;

function constructionTypeFromProjectName(projectName: string | null) {
  const name = projectName?.replace(/\s+/g, "") || "";
  if (name.includes("방송")) return "방송통신공사";
  if (name.includes("소방")) return "소방공사";
  if (name.includes("전기")) return "전기공사";
  return "건축공사";
}

function purposeFromProjectName(projectName: string | null) {
  return projectName ? `${projectName}을 실시하여 관련 시설의 기능과 안전성을 확보하고 쾌적한 교육환경을 조성하고자 함.` : null;
}

const rateQuoteAliases: Record<string, string[]> = {
  "간접노무비": ["간접노무비"], "기타경비": ["기타경비"], "산재보험료": ["산재보험료", "산재보험"],
  "고용보험료": ["고용보험료", "고용보험"], "국민건강보험료": ["국민건강보험료", "국민건강보험", "건강보험료", "건강보험"],
  "국민연금보험료": ["국민연금보험료", "국민연금보험", "연금보험료", "연금보험"],
  "노인장기요양보험료": ["노인장기요양보험료", "노인장기요양보험", "장기요양보험료", "장기요양보험"],
  "산업안전보건관리비": ["산업안전보건관리비", "안전관리비"], "퇴직공제부금비": ["퇴직공제부금비", "퇴직공제"],
  "환경보전비": ["환경보전비"], "임금채권부담금": ["임금채권부담금"], "석면분담금": ["석면분담금"],
  "일반관리비": ["일반관리비"], "이윤": ["이윤"],
};

function money(value: number | null) { return value === null ? "" : new Intl.NumberFormat("ko-KR").format(value); }
function parseMoney(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

export function QuotationReview({ analysisId, originalName, initial, confirmedContractId, review, knowledgeReadyCount, knowledgePendingCount, rateReferenceDocumentName, rateReferenceText, auditCases, auditSourceStatus }: Props) {
  const [data, setData] = useState(() => ({
    ...initial,
    constructionType: constructionTypeFromProjectName(initial.projectName),
    purpose: initial.purpose || purposeFromProjectName(initial.projectName),
  }));
  const [purposeManuallyEdited, setPurposeManuallyEdited] = useState(Boolean(initial.purpose));
  const [constructionTypeManuallyEdited, setConstructionTypeManuallyEdited] = useState(false);
  const [analysisCompleteOpen, setAnalysisCompleteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reviewFresh, setReviewFresh] = useState(Boolean(review));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("analysis") !== "complete") return;
    setAnalysisCompleteOpen(true);
    url.searchParams.delete("analysis");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const updateText = (field: keyof QuotationExtraction, value: string) => {
    setReviewFresh(false);
    const nextValue = value.trimStart() || null;
    if (field === "purpose") setPurposeManuallyEdited(true);
    if (field === "constructionType") setConstructionTypeManuallyEdited(true);
    setData((current) => ({
      ...current,
      [field]: nextValue,
      ...(field === "projectName" && !purposeManuallyEdited ? { purpose: purposeFromProjectName(nextValue) } : {}),
      ...(field === "projectName" && !constructionTypeManuallyEdited ? { constructionType: constructionTypeFromProjectName(nextValue) } : {}),
    }));
  };
  const updateMoney = (field: keyof QuotationExtraction, value: string) => {
    setReviewFresh(false);
    setData((current) => ({ ...current, [field]: parseMoney(value) }));
  };

  function updateRateQuote(label: string, value: string) {
    setReviewFresh(false);
    setData((current) => {
      const aliases = rateQuoteAliases[label] || [label];
      const itemIndex = current.items.findIndex((item) => {
        const text = `${item.category || ""} ${item.trade || ""} ${item.itemName || ""} ${item.specification || ""} ${item.sourceText || ""}`;
        return aliases.some((alias) => text.includes(alias));
      });
      const amount = parseMoney(value);
      const summaryField = ({ "간접노무비": "indirectLaborCost", "산업안전보건관리비": "safetyHealthCost", "일반관리비": "overhead", "이윤": "profit" } as const)[label as "간접노무비" | "산업안전보건관리비" | "일반관리비" | "이윤"];
      const items = itemIndex >= 0
        ? current.items.map((item, index) => index === itemIndex ? { ...item, amount } : item)
        : [...current.items, { category: "사용자 입력", trade: null, itemName: label, specification: null, unit: "식", quantity: 1, unitPrice: amount, amount, sourceText: "사용자 직접 입력" }];
      return { ...current, ...(summaryField ? { [summaryField]: amount } : {}), items };
    });
  }

  function requestConfirm() {
    if (confirmedContractId || busy) return;
    if (emptyCount) { setError(`필수항목 ${emptyCount}개를 모두 입력한 뒤 다시 검토해 주세요.`); return; }
    if (!review || !reviewFresh) { setError("현재 입력값으로 견적검토를 다시 실행하고 결과를 확인해 주세요."); return; }
    setError("");
    setConfirmOpen(true);
  }

  async function confirm() {
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

  async function reanalyze() {
    if (busy) return;
    if (!window.confirm("원본 견적서를 다시 분석하면 현재 화면에서 수정한 값이 초기화됩니다. 다시 분석하시겠습니까?")) return;
    setBusy("reanalyze"); setError("");
    try {
      const response = await fetch(`/api/estimates/${analysisId}/reanalyze`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "견적서를 다시 분석하지 못했습니다.");
      window.location.assign(`/estimates/${analysisId}?analysis=complete`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "견적서를 다시 분석하지 못했습니다.");
      setBusy("");
    }
  }

  if (confirmedContractId) return <section className="review-complete"><span>✓</span><h2>이미 계약업무를 시작했습니다.</h2><p>확정한 견적정보는 계약 상세화면에서 계속 확인할 수 있습니다.</p><a href={`/contracts/${confirmedContractId}?tab=estimate`}>계약 건으로 이동</a></section>;

  const emptyCount = mainFields.filter(([field, , required]) => required && !data[field]).length + (!data.totalAmount ? 1 : 0);
  const missingFields: string[] = mainFields.filter(([field, , required]) => required && !data[field]).map(([, label]) => label);
  if (!data.totalAmount) missingFields.push("총액");
  const laborPreview: ReviewItem[] = buildEvidenceTargets(data, data.items.map((item, index) => ({ ...item, id: index })))
    .filter((target) => target.section === "LABOR")
    .map((target) => ({ section: "LABOR", targetKey: target.targetKey, label: target.label, status: "CHECK", quotedValue: target.quotedValue, expectedValue: null, difference: null, differenceRate: null, calculation: null, detail: "견적검토를 실행하면 등록 노임단가와 비교합니다.", evidenceDocumentId: null, evidenceDocumentName: null, evidenceYear: null, evidenceLocation: null, evidenceExcerpt: null }));
  const displayedReview = review ? { ...review, items: review.items.some((item) => item.section === "LABOR") ? review.items : [...review.items, ...laborPreview] } : { review: { warning: null }, items: laborPreview };
  const relatedAuditCases = selectRelevantAuditCases(auditCases, {
    projectName: data.projectName, constructionType: data.constructionType, totalAmount: data.totalAmount,
    plannedStartDate: data.plannedStartDate, plannedCompletionDate: data.plannedCompletionDate,
  });

  return (
    <>
      {analysisCompleteOpen && <div className="analysis-complete-backdrop" role="presentation">
        <section className="analysis-complete-dialog" role="dialog" aria-modal="true" aria-labelledby="analysis-complete-title">
          <h2 id="analysis-complete-title">견적서 분석 완료</h2>
          <button type="button" autoFocus onClick={() => setAnalysisCompleteOpen(false)}>확인</button>
        </section>
      </div>}
      {confirmOpen && <div className="action-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setConfirmOpen(false); }}>
        <section className="action-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="estimate-confirm-title" aria-describedby="estimate-confirm-description">
          <h2 id="estimate-confirm-title">이 견적으로 계속 진행하시겠습니까?</h2>
          <p id="estimate-confirm-description">확인하면 계약 건이 생성되고 공사관리 현황판에 표시됩니다.</p>
          <div className="action-confirm-actions"><button type="button" onClick={() => setConfirmOpen(false)}>취소</button><button className="primary" type="button" autoFocus onClick={() => { setConfirmOpen(false); void confirm(); }}>현황판 등록</button></div>
        </section>
      </div>}
      <section className="review-notice">
        <div><span className="section-kicker">AI 추출 완료</span><h2>견적서에서 다음과 같이 읽었습니다.</h2><p><strong>{originalName}</strong> · 문서에 없거나 읽지 못한 값은 비워두었습니다.</p></div>
        <div className="review-notice-actions"><span className={emptyCount ? "review-status needs" : "review-status ready"}>{emptyCount ? `필수입력 ${emptyCount}개` : "확정 가능"}</span><button type="button" disabled={!!busy} onClick={reanalyze}>{busy === "reanalyze" ? "다시 분석 중…" : "견적서 다시 분석하기"}</button></div>
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
                  {field === "constructionType" ? <select value={String(data[field] ?? "")} onChange={(event) => updateText(field, event.target.value)}><option value="">공사종류 선택</option>{constructionTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.includes("Date") ? <input type="date" value={String(data[field] ?? "")} onChange={(event) => updateText(field, event.target.value)} /> : field === "purpose" ? <textarea rows={2} value={String(data[field] ?? "")} placeholder="공사명을 바탕으로 자동 작성되며 직접 수정할 수 있습니다" onChange={(event) => updateText(field, event.target.value)} /> : <input value={String(data[field] ?? "")} placeholder="문서에 없으면 직접 입력" onChange={(event) => updateText(field, event.target.value)} />}
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
          <CurrentRateReference data={data} documentName={rateReferenceDocumentName} referenceText={rateReferenceText} onQuoteChange={updateRateQuote} />
          <SupplierSanctionCheck companyName={data.companyName} businessRegistrationNumber={data.businessRegistrationNumber} />
        </aside>
      </div>

      <section className="review-start-card pre-confirmation-start" aria-label="견적검토 실행">
        <h2>견적검토를 실행하세요.</h2>
        <p>{emptyCount ? `필수 입력: ${missingFields.join(", ")}` : "입력한 금액과 등록 지식자료를 바탕으로 견적서를 검토합니다."}</p>
        <button className="run-review-action" type="button" disabled={!!busy || emptyCount > 0} onClick={runReview}>{busy === "review" ? "견적검토 중…" : "견적검토"}</button>
      </section>
      <PreConfirmationReviewResults result={displayedReview} />
      {review && reviewFresh && <RelatedAuditCases cases={relatedAuditCases} sourceStatus={auditSourceStatus} />}

      {error && <p className="estimate-action-error" role="alert">{error}</p>}
      <div className="estimate-actions-space" aria-hidden="true" />
      <div className="estimate-final-actions">
        <button className="review-again" type="button" disabled={!!busy || emptyCount > 0} onClick={runReview}>{busy === "review" ? "다시 검토 중…" : "다시 검토"}</button>
        <button className="register-estimate" type="button" disabled={!!busy || !review || !reviewFresh || emptyCount > 0} onClick={requestConfirm}>{busy === "confirm" ? "현황판 등록 중…" : "이 견적으로 현황판 등록"}</button>
      </div>
    </>
  );
}
