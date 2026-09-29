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
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number; minX: number; maxX: number; minY: number; maxY: number; moved: boolean } | null>(null);
  const suppressLauncherClickRef = useRef(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("floating-chat-position") || "null") as { x?: number; y?: number } | null;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) setOffset({ x: saved.x!, y: saved.y! });
    } catch {
      // Ignore unavailable or malformed browser storage and keep the default position.
    }
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function clampedOffset(drag: NonNullable<typeof dragRef.current>, deltaX: number, deltaY: number) {
    return {
      x: drag.x + Math.min(Math.max(deltaX, drag.minX), drag.maxX),
      y: drag.y + Math.min(Math.max(deltaY, drag.minY), drag.maxY),
    };
  }

  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button") && event.currentTarget.classList.contains("floating-chat-header")) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    dragRef.current = {
      pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: offset.x, y: offset.y,
      minX: margin - rect.left, maxX: window.innerWidth - margin - rect.right,
      minY: margin - rect.top, maxY: window.innerHeight - margin - rect.bottom, moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.clientX;
    const deltaY = event.clientY - drag.clientY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
    drag.moved = true;
    event.preventDefault();
    setOffset(clampedOffset(drag, deltaX, deltaY));
  }

  function finishDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.moved) return;
    suppressLauncherClickRef.current = event.currentTarget.classList.contains("floating-chat-launcher");
    const next = clampedOffset(drag, event.clientX - drag.clientX, event.clientY - drag.clientY);
    setOffset(next);
    try { window.localStorage.setItem("floating-chat-position", JSON.stringify(next)); } catch { /* Keep the position for this page only. */ }
  }

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || busy) return;
    setBusy(true);
    setError("");
    setAskedQuestion(nextQuestion);
    setAnswer("");
    setSources([]);
    setDurationMs(null);
    try {
      const response = await fetch("/api/knowledge/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: nextQuestion }),
      });
      const payload = await response.json() as { answer?: string; sources?: Source[]; error?: string; durationMs?: number };
      if (!response.ok) throw new Error(payload.error || "등록 지식자료를 검색하지 못했습니다.");
      setAnswer(payload.answer || "등록된 지식자료에서 답변을 확인하지 못했습니다.");
      setSources(payload.sources || []);
      setDurationMs(typeof payload.durationMs === "number" ? payload.durationMs : null);
      setQuestion("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "등록 지식자료를 검색하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <aside ref={rootRef} className={`floating-knowledge-chat ${open ? "open" : ""}`} style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }} aria-label="플로팅 지식자료 챗봇">
    {open && <section className="floating-chat-panel" id="floating-knowledge-chat-panel" role="dialog" aria-label="AI 업무비서">
      <header className="floating-chat-header" title="끌어서 이동" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
        <div><span className="floating-chat-mark">ON</span><span><strong>AI 업무비서</strong><small>등록 지식자료에서만 답변</small></span></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="챗봇 닫기">×</button>
      </header>
      <div className="floating-chat-body" aria-live="polite">
        {!askedQuestion && !busy && <div className="floating-chat-welcome"><strong>무엇이 궁금하신가요?</strong><p>계약·공사 업무를 자연어로 질문해 주세요. 근거가 있는 등록자료만 찾아 답변합니다.</p></div>}
        {askedQuestion && <div className="floating-chat-message user"><span>질문</span><p>{askedQuestion}</p></div>}
        {busy && <div className="floating-chat-message assistant loading"><span>AI 업무비서</span><p>등록된 지식자료에서 근거를 찾고 있습니다…</p></div>}
        {answer && <div className="floating-chat-message assistant"><span>AI 업무비서{durationMs !== null ? ` · ${(durationMs / 1000).toFixed(1)}초` : ""}</span><p>{answer}</p>{sources.length > 0 && <details><summary>근거 파일 {sources.length}개</summary>{sources.map((source) => <div key={source.documentId}><strong>{source.documentName}</strong><small>{source.filename}</small></div>)}</details>}</div>}
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
    <button className="floating-chat-launcher" type="button" title="클릭하여 열기 · 끌어서 이동" aria-expanded={open} aria-controls="floating-knowledge-chat-panel" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onClick={() => {
      if (suppressLauncherClickRef.current) { suppressLauncherClickRef.current = false; return; }
      setOpen((value) => !value);
    }}>
      <span aria-hidden="true">{open ? "×" : "✦"}</span><strong>{open ? "닫기" : "AI 질문"}</strong>
    </button>
  </aside>;
}
