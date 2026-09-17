"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdministrativeDocumentRecord } from "@/db/schema";

type AdministrativeDocumentType = "PURCHASE_REQUEST" | "INTERNAL_APPROVAL";

function replaceContractMethod(content: string, contractMethod: string) {
  const value = contractMethod.trim() || "[담당자 확인 필요]";
  return /^7\. 계약방법:.*$/m.test(content)
    ? content.replace(/^7\. 계약방법:.*$/m, `7. 계약방법: ${value}`)
    : `${content.trimEnd()}\n7. 계약방법: ${value}`;
}

type Props = {
  contractId: string;
  currentStage: string;
  purchaseDefault: string;
  internalDefault: string;
  documents: AdministrativeDocumentRecord[];
  initialContractMethod: string | null;
};

type ApiResult = { error?: string; nextStage?: string; status?: string };
type RecommendationResult = {
  error?: string;
  recommendation?: string;
  evidenceStatus?: "SUPPORTED" | "NO_EVIDENCE";
  sources?: Array<{ documentName: string; filename: string }>;
};

function cleanMarkdown(value: string) {
  return value.replace(/\*\*(.*?)\*\*/g, "$1").replace(/`([^`]*)`/g, "$1").trim();
}

function RecommendationContent({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return <div className="recommendation-readable">{lines.map((line, index) => {
    if (/^\|?\s*:?-{3,}/.test(line)) return null;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) return <h5 key={index}>{cleanMarkdown(heading[1])}</h5>;
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) return <div className="recommendation-point" key={index}><span>•</span><p>{cleanMarkdown(bullet[1])}</p></div>;
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) return <div className="recommendation-point numbered" key={index}><span>{numbered[1]}</span><p>{cleanMarkdown(numbered[2])}</p></div>;
    if (line.includes("|")) {
      const cells = line.split("|").map(cleanMarkdown).filter(Boolean);
      if (cells.length > 1) return <div className="recommendation-data-row" key={index}>{cells.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>;
    }
    return <p key={index}>{cleanMarkdown(line)}</p>;
  })}</div>;
}

export function AdministrativeDocumentsWorkspace({ contractId, currentStage, purchaseDefault, internalDefault, documents, initialContractMethod }: Props) {
  const router = useRouter();
  const purchaseRecord = documents.find((document) => document.documentType === "PURCHASE_REQUEST");
  const internalRecord = documents.find((document) => document.documentType === "INTERNAL_APPROVAL");
  const [purchaseContent, setPurchaseContent] = useState(purchaseRecord?.content || purchaseDefault);
  const defaultContractMethod = internalRecord?.contractMethod || initialContractMethod || "나라장터 전자계약";
  const [internalContent, setInternalContent] = useState(() => replaceContractMethod(internalRecord?.content || internalDefault, defaultContractMethod));
  const [contractMethod, setContractMethod] = useState(defaultContractMethod);
  const [recommendation, setRecommendation] = useState(internalRecord?.recommendation || "");
  const [evidenceStatus, setEvidenceStatus] = useState(internalRecord?.evidenceStatus || "");
  const [sources, setSources] = useState<Array<{ documentName: string; filename: string }>>(() => {
    try { return JSON.parse(internalRecord?.sourcesJson || "[]"); } catch { return []; }
  });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<AdministrativeDocumentType | null>(null);

  const purchaseEditable = currentStage === "PURCHASE_REQUEST" && purchaseRecord?.status !== "CONFIRMED";
  const internalEditable = currentStage === "INTERNAL_APPROVAL" && internalRecord?.status !== "CONFIRMED";

  async function copyText(content: string, label: string) {
    try {
      await navigator.clipboard.writeText(content);
      setError(""); setMessage(`${label}을 클립보드에 복사했습니다.`);
    } catch {
      setMessage(""); setError("복사하지 못했습니다. 내용을 직접 선택해 복사해 주세요.");
    }
  }

  async function saveDocument(documentType: AdministrativeDocumentType, confirm: boolean) {
    const isPurchase = documentType === "PURCHASE_REQUEST";
    const content = isPurchase ? purchaseContent : internalContent;
    if (!content.trim()) { setError("문서 내용을 입력해 주세요."); return; }
    if (!isPurchase && confirm && !contractMethod.trim()) { setError("최종 계약방법을 담당자가 입력해 주세요."); return; }
    setBusy(`${documentType}:${confirm ? "confirm" : "save"}`); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/administrative-documents`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentType, content, contractMethod: isPurchase ? null : contractMethod, confirm }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(result.error || "문서를 저장하지 못했습니다.");
      setMessage(confirm ? "완료 확인과 업무단계 변경을 저장했습니다." : "작성 중인 내용을 저장했습니다.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문서를 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  function requestCompletion(documentType: AdministrativeDocumentType) {
    const isPurchase = documentType === "PURCHASE_REQUEST";
    const content = isPurchase ? purchaseContent : internalContent;
    if (!content.trim()) { setError("문서 내용을 입력해 주세요."); return; }
    if (!isPurchase && !contractMethod.trim()) { setError("최종 계약방법을 담당자가 입력해 주세요."); return; }
    setError("");
    setPendingConfirmation(documentType);
  }

  async function findContractMethod() {
    setBusy("recommend"); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/contract-method-recommendation`, { method: "POST" });
      const result = await response.json() as RecommendationResult;
      if (!response.ok || !result.recommendation) throw new Error(result.error || "계약방법 근거를 찾지 못했습니다.");
      setRecommendation(result.recommendation);
      setEvidenceStatus(result.evidenceStatus || "NO_EVIDENCE");
      setSources(result.sources || []);
      setMessage("등록된 지식자료 검색을 완료했습니다. 추천내용을 확인한 뒤 계약방법은 직접 결정해 주세요.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "계약방법 근거를 찾지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  function updateContractMethod(value: string) {
    setContractMethod(value);
    setInternalContent((content) => replaceContractMethod(content, value));
  }

  return <>
    {pendingConfirmation && <div className="action-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setPendingConfirmation(null); }}>
      <section className="action-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="document-confirm-title" aria-describedby="document-confirm-description">
        <h2 id="document-confirm-title">실제 {pendingConfirmation === "PURCHASE_REQUEST" ? "품의" : "내부기안"} 처리를 완료하셨나요?</h2>
        <p id="document-confirm-description">확인하면 완료 상태로 저장되고 다음 업무단계로 변경됩니다.</p>
        <div className="action-confirm-actions"><button type="button" disabled={!!busy} onClick={() => setPendingConfirmation(null)}>취소</button><button className="primary" type="button" autoFocus disabled={!!busy} onClick={() => { const type = pendingConfirmation; setPendingConfirmation(null); void saveDocument(type, true); }}>완료 확인</button></div>
      </section>
    </div>}
    <section className="administrative-workspace-head">
      <div><span className="section-kicker">Phase 5 · 품의/내부기안</span><h2>계약정보를 다시 입력하지 않고 행정문안을 만듭니다.</h2><p>문안을 수정하고 복사한 뒤, 실제 행정처리를 마친 경우에만 완료 버튼을 눌러주세요.</p></div>
      <span className="human-check-badge">담당자 최종확정</span>
    </section>
    {message && <div className="document-message success" role="status">{message}</div>}
    {error && <div className="document-message error" role="alert">{error}</div>}

    <section className="administrative-document-card">
      <div className="document-card-heading"><div><span className="document-step">01</span><div><span className="section-kicker">에듀파인 복사용</span><h3>품의내용</h3></div></div><span className={`document-status ${purchaseRecord?.status === "CONFIRMED" ? "confirmed" : purchaseEditable ? "current" : "waiting"}`}>{purchaseRecord?.status === "CONFIRMED" ? "품의 완료" : purchaseEditable ? "작성 가능" : "대기"}</span></div>
      <textarea className="administrative-editor" value={purchaseContent} readOnly={!purchaseEditable} onChange={(event) => setPurchaseContent(event.target.value)} aria-label="에듀파인 품의내용" />
      <div className="document-actions"><button type="button" className="copy-document-button" onClick={() => copyText(purchaseContent, "품의내용")}>에듀파인 품의내용 복사</button>{purchaseEditable && <><button type="button" className="save-draft-button" disabled={!!busy} onClick={() => saveDocument("PURCHASE_REQUEST", false)}>작성내용 저장</button><button type="button" className="complete-document-button" disabled={!!busy} onClick={() => requestCompletion("PURCHASE_REQUEST")}>{busy === "PURCHASE_REQUEST:confirm" ? "처리 중…" : "품의 완료"}</button></>}</div>
    </section>

    <section className={`administrative-document-card ${currentStage === "PURCHASE_REQUEST" ? "locked" : ""}`}>
      <div className="document-card-heading"><div><span className="document-step">02</span><div><span className="section-kicker">내부결재 복사용</span><h3>내부기안문</h3></div></div><span className={`document-status ${internalRecord?.status === "CONFIRMED" ? "confirmed" : internalEditable ? "current" : "waiting"}`}>{internalRecord?.status === "CONFIRMED" ? "내부기안 완료" : internalEditable ? "작성 가능" : "품의 완료 후"}</span></div>
      {currentStage === "PURCHASE_REQUEST" ? <div className="locked-document-note">품의 완료 확인 후 내부기안문 작성과 계약방법 근거검색이 열립니다.</div> : <>
        <div className="contract-method-panel">
          <div className="contract-method-heading"><div><span className="section-kicker">등록자료 근거검색</span><h4>계약방법 추천</h4><p>AI는 등록된 지식자료에서 후보만 찾습니다. 최종 계약방법은 담당자가 결정합니다.</p></div>{internalEditable && <button type="button" onClick={findContractMethod} disabled={!!busy}>{busy === "recommend" ? "검색 중…" : "계약방법 근거 찾기"}</button>}</div>
          {recommendation ? <div className={`recommendation-result ${evidenceStatus === "SUPPORTED" ? "supported" : "no-evidence"}`}><strong>{evidenceStatus === "SUPPORTED" ? "등록자료 근거 확인됨" : "등록자료에서 확인 불가"}</strong><RecommendationContent text={recommendation} />{sources.length > 0 && <div className="recommendation-sources">{sources.map((source) => <span key={`${source.documentName}-${source.filename}`}>{source.documentName} · {source.filename}</span>)}</div>}</div> : <div className="recommendation-placeholder">계약금액과 공사정보를 바탕으로 등록된 계약 지식자료에서 근거를 검색합니다.</div>}
          <label className="contract-method-decision"><span>담당자 최종 계약방법</span><input value={contractMethod} readOnly={!internalEditable} placeholder="추천내용을 검토한 뒤 직접 입력" onChange={(event) => updateContractMethod(event.target.value)} /></label>
        </div>
        <textarea className="administrative-editor" value={internalContent} readOnly={!internalEditable} onChange={(event) => setInternalContent(event.target.value)} aria-label="내부기안문" />
        <div className="document-actions"><button type="button" className="copy-document-button" onClick={() => copyText(internalContent, "내부기안문")}>내부기안문 복사</button>{internalEditable && <><button type="button" className="save-draft-button" disabled={!!busy} onClick={() => saveDocument("INTERNAL_APPROVAL", false)}>작성내용 저장</button><button type="button" className="complete-document-button" disabled={!!busy} onClick={() => requestCompletion("INTERNAL_APPROVAL")}>{busy === "INTERNAL_APPROVAL:confirm" ? "처리 중…" : "내부기안 완료"}</button></>}</div>
      </>}
    </section>
  </>;
}
