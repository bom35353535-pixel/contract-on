"use client";

import { useState } from "react";

type Source = { documentId: string; documentName: string; filename: string };

const FLOW = [
  { id: 1, title: "계약 의뢰 전", owner: "사업부서", items: ["예산 확보 및 배정", "사업계획서 작성", "계약심의·일상감사 검토"] },
  { id: 2, title: "계약 체결", owner: "계약부서", items: ["예산과목·사업 타당성 확인", "사업비 산출근거·계약방법 확인", "입찰·낙찰자 또는 수의계약 상대자 결정", "계약서류 징구·계약 체결", "지출원인행위"] },
  { id: 3, title: "사업 진행·완료", owner: "사업부서", items: ["감독·검사 담당자 임명", "착공계 접수 및 공사내용 확인", "선금·계약기간 연장 검토(필요시)", "사업결과·검사·경비 정산 확인"] },
  { id: 4, title: "대금 지급", owner: "사업·회계부서", items: ["지출결의 및 대금 지급", "하자보수보증금 확인(해당 공사)", "세금계산서·4대보험·국세·지방세 완납증명 확인"] },
] as const;

export function AiWorkAssistant(_: { projectName?: string; currentStage?: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [durationMs, setDurationMs] = useState<number | null>(null);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true); setError(""); setAnswer(""); setSources([]); setDurationMs(null);
    try {
      const response = await fetch("/api/knowledge/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: question.trim() }) });
      const payload = await response.json() as { answer?: string; sources?: Source[]; error?: string; durationMs?: number };
      if (!response.ok) throw new Error(payload.error || "등록 지식자료를 검색하지 못했습니다.");
      setAnswer(payload.answer || "등록된 지식자료에서 답변을 확인하지 못했습니다.");
      setSources(payload.sources || []);
      setDurationMs(typeof payload.durationMs === "number" ? payload.durationMs : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "등록 지식자료를 검색하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <section className="assistant-workspace">
    <section className="knowledge-chat-card">
      <div className="assistant-section-title"><div><span>01</span><div><strong>지식자료 챗봇</strong><small>자연어·유사 표현으로 등록된 자료를 검색합니다.</small></div></div></div>
      <div className="chat-suggestions">{["착공 단계에서 받아야 할 서류는?", "하자담보기간 기준을 알려줘", "공사 계약방법은 어떻게 정해?"].map((suggestion) => <button type="button" key={suggestion} onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}</div>
      <form className="assistant-question" onSubmit={ask}><label htmlFor="assistant-question">질문</label><textarea id="assistant-question" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="예: 소규모 공사 착공계는 생략할 수 있어?" /><button disabled={busy || !question.trim()}>{busy ? "등록자료 검색 중…" : "지식자료에서 답변 찾기"}</button><small className="assistant-enter-hint">Enter 전송 · Shift+Enter 줄바꿈</small></form>
      {error && <div className="document-message error" role="alert">{error}</div>}
      <div className={`assistant-answer ${answer ? "visible" : ""}`}><span>AI 답변{durationMs !== null ? ` · ${(durationMs / 1000).toFixed(1)}초` : ""}</span><p>{answer || "질문하면 답변과 근거 파일이 여기에 표시됩니다."}</p>{sources.length > 0 && <div className="assistant-source-list"><strong>답변 근거</strong>{sources.map((source) => <span key={source.documentId}>{source.documentName}<small>{source.filename}</small></span>)}</div>}</div>
    </section>

    <section className="workflow-guide-card">
      <div className="assistant-section-title"><div><span>02</span><div><strong>전체 업무흐름도</strong><small>서울특별시교육청 계약길잡이 기준</small></div></div></div>
      <ol className="workflow-guide-list">{FLOW.map((phase) => <li className={`flow-tone-${phase.id}`} key={phase.id}>
        <div className="workflow-phase-number">{String(phase.id).padStart(2, "0")}</div>
        <div><div className="workflow-phase-heading"><strong>{phase.title}</strong><span>{phase.owner}</span></div><ul>{phase.items.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </li>)}</ol>
      <footer className="workflow-sources"><span>원문</span><a href="https://contract.sen.go.kr/fus/MI000000000000000326/html/cont0010v.do" target="_blank" rel="noreferrer">계약흐름도Ⅰ</a><a href="https://contract.sen.go.kr/fus/MI000000000000000327/html/cont0010v.do" target="_blank" rel="noreferrer">계약흐름도Ⅱ</a><a href="https://contract.sen.go.kr/fus/MI000000000000000328/html/cont0010v.do" target="_blank" rel="noreferrer">계약흐름도Ⅲ</a></footer>
    </section>
  </section>;
}
