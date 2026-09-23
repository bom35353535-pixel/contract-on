"use client";

import { useEffect, useRef, useState } from "react";

type Source = { documentId: string; documentName: string; filename: string };

export function FloatingKnowledgeChat() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || busy) return;
    setBusy(true);
    setError("");
    setAskedQuestion(nextQuestion);
    setAnswer("");
    setSources([]);
    try {
      const response = await fetch("/api/knowledge/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: nextQuestion }),
      });
      const payload = await response.json() as { answer?: string; sources?: Source[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "등록 지식자료를 검색하지 못했습니다.");
      setAnswer(payload.answer || "등록된 지식자료에서 답변을 확인하지 못했습니다.");
      setSources(payload.sources || []);
      setQuestion("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "등록 지식자료를 검색하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <aside className={`floating-knowledge-chat ${open ? "open" : ""}`} aria-label="플로팅 지식자료 챗봇">
    {open && <section className="floating-chat-panel" id="floating-knowledge-chat-panel" role="dialog" aria-label="AI 업무비서">
      <header className="floating-chat-header">
        <div><span className="floating-chat-mark">ON</span><span><strong>AI 업무비서</strong><small>등록 지식자료에서만 답변</small></span></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="챗봇 닫기">×</button>
      </header>
      <div className="floating-chat-body" aria-live="polite">
        {!askedQuestion && !busy && <div className="floating-chat-welcome"><strong>무엇이 궁금하신가요?</strong><p>계약·공사 업무를 자연어로 질문해 주세요. 근거가 있는 등록자료만 찾아 답변합니다.</p></div>}
        {askedQuestion && <div className="floating-chat-message user"><span>질문</span><p>{askedQuestion}</p></div>}
        {busy && <div className="floating-chat-message assistant loading"><span>AI 업무비서</span><p>등록된 지식자료에서 근거를 찾고 있습니다…</p></div>}
        {answer && <div className="floating-chat-message assistant"><span>AI 업무비서</span><p>{answer}</p>{sources.length > 0 && <details><summary>근거 파일 {sources.length}개</summary>{sources.map((source) => <div key={source.documentId}><strong>{source.documentName}</strong><small>{source.filename}</small></div>)}</details>}</div>}
        {error && <div className="floating-chat-error" role="alert">{error}</div>}
      </div>
      <form className="floating-chat-form" onSubmit={ask}>
        <label className="sr-only" htmlFor="floating-chat-question">질문 입력</label>
        <textarea
          ref={inputRef}
          id="floating-chat-question"
          rows={2}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="질문을 입력하세요. Enter로 전송"
        />
        <button type="submit" disabled={busy || !question.trim()} aria-label="질문 전송">{busy ? "…" : "↑"}</button>
        <small>Enter 전송 · Shift+Enter 줄바꿈</small>
      </form>
    </section>}
    <button className="floating-chat-launcher" type="button" aria-expanded={open} aria-controls="floating-knowledge-chat-panel" onClick={() => setOpen((value) => !value)}>
      <span aria-hidden="true">{open ? "×" : "✦"}</span><strong>{open ? "닫기" : "AI 질문"}</strong>
    </button>
  </aside>;
}
