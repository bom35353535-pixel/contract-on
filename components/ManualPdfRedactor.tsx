"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Region = { page: number; x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type PdfViewport = { width: number; height: number };
type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> };
  cleanup: () => void;
};
type PdfSource = { numPages: number; getPage: (page: number) => Promise<PdfPage>; destroy?: () => Promise<void> | void };

function safelyDestroyPdf(source: PdfSource | null) {
  if (!source || typeof source.destroy !== "function") return;
  try {
    void Promise.resolve(source.destroy()).catch(() => undefined);
  } catch {
    // 일부 PDF.js 실행 환경은 destroy를 제공하지 않거나 이미 작업자를 정리합니다.
  }
}

export function ManualPdfRedactor({ file, onCancel, onApply }: {
  file: File;
  onCancel: () => void;
  onApply: (file: File, regionCount: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<Point | null>(null);
  const draftRef = useRef<Region | null>(null);
  const regionsRef = useRef<Region[]>([]);
  const [source, setSource] = useState<PdfSource | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [regions, setRegions] = useState<Region[]>([]);
  const [draft, setDraft] = useState<Region | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let opened: PdfSource | null = null;
    void (async () => {
      try {
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
        GlobalWorkerOptions.workerSrc = "/pdf-privacy/pdf.worker.min.mjs";
        opened = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise as PdfSource;
        if (active) setSource(opened);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "PDF를 열지 못했습니다.");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
      safelyDestroyPdf(opened);
    };
  }, [file]);

  useEffect(() => {
    if (!source || !canvasRef.current) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        const page = await source.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const available = Math.max(560, Math.min(1100, (pageWrapRef.current?.clientWidth || 900) - 8));
        const scale = Math.min(1.6, available / base.width);
        const viewport = page.getViewport({ scale });
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("PDF 페이지를 표시할 수 없습니다.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        page.cleanup();
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "PDF 페이지를 표시하지 못했습니다.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pageNumber, source]);

  const pageRegions = useMemo(() => regions.filter((region) => region.page === pageNumber), [pageNumber, regions]);

  function pointFromEvent(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function begin(event: React.PointerEvent<HTMLDivElement>) {
    const point = pointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = point;
    const next = { page: pageNumber, x: point.x, y: point.y, width: 0, height: 0 };
    draftRef.current = next;
    setDraft(next);
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const origin = startRef.current;
    if (!origin) return;
    const point = pointFromEvent(event);
    const next = {
      page: pageNumber,
      x: Math.min(origin.x, point.x),
      y: Math.min(origin.y, point.y),
      width: Math.abs(point.x - origin.x),
      height: Math.abs(point.y - origin.y),
    };
    draftRef.current = next;
    setDraft(next);
  }

  function end(event: React.PointerEvent<HTMLDivElement>) {
    const origin = startRef.current;
    const point = pointFromEvent(event);
    const completed = origin ? {
      page: pageNumber,
      x: Math.min(origin.x, point.x),
      y: Math.min(origin.y, point.y),
      width: Math.abs(point.x - origin.x),
      height: Math.abs(point.y - origin.y),
    } : draftRef.current;
    if (completed && completed.width > 0.006 && completed.height > 0.006) {
      const next = [...regionsRef.current, completed];
      regionsRef.current = next;
      setRegions(next);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    startRef.current = null;
    draftRef.current = null;
    setDraft(null);
  }

  function cancelDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    startRef.current = null;
    draftRef.current = null;
    setDraft(null);
  }

  function undoLastRegion() {
    const next = regionsRef.current.slice(0, -1);
    regionsRef.current = next;
    setRegions(next);
  }

  async function applyMask() {
    const regionsToApply = [...regionsRef.current];
    if (!regionsToApply.length || busy || !source) return;
    setBusy(true); setError("");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const document = await PDFDocument.create();
      for (let number = 1; number <= source.numPages; number += 1) {
        const pageRegions = regionsToApply.filter((value) => value.page === number);
        const sourcePage = await source.getPage(number);
        const base = sourcePage.getViewport({ scale: 1 });
        const scale = Math.min(1.05, Math.max(0.85, 1000 / Math.max(base.width, base.height)));
        const viewport = sourcePage.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("마스킹 사본을 만들 수 없습니다.");
        await sourcePage.render({ canvas, canvasContext: context, viewport }).promise;
        context.fillStyle = "#000000";
        for (const region of pageRegions) {
          context.fillRect(region.x * canvas.width, region.y * canvas.height, region.width * canvas.width, region.height * canvas.height);
        }
        const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PDF 페이지 이미지를 만들지 못했습니다.")), "image/jpeg", 0.72));
        const image = await document.embedJpg(await jpeg.arrayBuffer());
        const outputPage = document.addPage([base.width, base.height]);
        outputPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
        sourcePage.cleanup();
        canvas.width = 1;
        canvas.height = 1;
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
      const bytes = await document.save({ useObjectStreams: true });
      const masked = new File([bytes], file.name, { type: "application/pdf", lastModified: file.lastModified });
      if (canvasRef.current) {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
      }
      safelyDestroyPdf(source);
      setSource(null);
      setBusy(false);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      onApply(masked, regionsToApply.length);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "직접 마스킹한 PDF를 만들지 못했습니다.");
      setBusy(false);
    }
  }

  const visibleRegions = draft ? [...pageRegions, draft] : pageRegions;
  return <div className="manual-redactor-backdrop" role="presentation">
    <section className="manual-redactor-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-redactor-title">
      <header>
        <div><span>브라우저 내 안전 편집</span><h2 id="manual-redactor-title">개인정보 직접 마스킹</h2><p>가릴 곳을 차례대로 계속 드래그한 뒤 마지막에 한 번만 ‘마스킹 사본 사용’을 눌러 주세요.</p></div>
        <button type="button" onClick={onCancel} aria-label="직접 마스킹 닫기">×</button>
      </header>
      <div className="manual-redactor-toolbar">
        <button type="button" disabled={pageNumber <= 1 || busy} onClick={() => setPageNumber((value) => value - 1)}>이전 쪽</button>
        <strong>{pageNumber} / {source?.numPages || "-"}쪽</strong>
        <button type="button" disabled={!source || pageNumber >= source.numPages || busy} onClick={() => setPageNumber((value) => value + 1)}>다음 쪽</button>
        <span>마스킹 영역 {regions.length}개</span>
        <button type="button" disabled={!regions.length || busy} onClick={undoLastRegion}>마지막 영역 취소</button>
      </div>
      {error && <div className="document-message error" role="alert">{error}</div>}
      <div className="manual-redactor-scroll" ref={pageWrapRef}>
        <div className="manual-redactor-page">
          <canvas ref={canvasRef} />
          <div className="manual-redactor-layer" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={cancelDrag}>
            {visibleRegions.map((region, index) => <span key={`${region.page}-${index}`} style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />)}
          </div>
          {busy && <div className="manual-redactor-loading">PDF 처리 중…</div>}
        </div>
      </div>
      <footer><small>PDF 전체를 한 쪽씩 안전하게 평탄화하여 가린 원문이 남지 않도록 만듭니다.</small><button type="button" onClick={onCancel}>취소</button><button className="primary" type="button" disabled={!regions.length || busy} onClick={() => void applyMask()}>{busy ? "처리 중…" : "마스킹 사본 사용"}</button></footer>
    </section>
  </div>;
}
