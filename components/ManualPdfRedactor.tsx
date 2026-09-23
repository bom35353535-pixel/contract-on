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
type PdfSource = { numPages: number; getPage: (page: number) => Promise<PdfPage>; destroy: () => Promise<void> };

export function ManualPdfRedactor({ file, onCancel, onApply }: {
  file: File;
  onCancel: () => void;
  onApply: (file: File, regionCount: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<PdfSource | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [regions, setRegions] = useState<Region[]>([]);
  const [start, setStart] = useState<Point | null>(null);
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
      void opened?.destroy().catch(() => undefined);
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
    setStart(point);
    setDraft({ page: pageNumber, x: point.x, y: point.y, width: 0, height: 0 });
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (!start) return;
    const point = pointFromEvent(event);
    setDraft({
      page: pageNumber,
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  }

  function end() {
    if (draft && draft.width > 0.006 && draft.height > 0.006) setRegions((current) => [...current, draft]);
    setStart(null);
    setDraft(null);
  }

  async function applyMask() {
    if (!regions.length || busy) return;
    setBusy(true); setError("");
    try {
      const { PDFDocument, rgb } = await import("pdf-lib");
      const document = await PDFDocument.load(await file.arrayBuffer());
      const pages = document.getPages();
      for (const region of regions) {
        const page = pages[region.page - 1];
        if (!page) continue;
        const { width, height } = page.getSize();
        page.drawRectangle({
          x: region.x * width,
          y: height - (region.y + region.height) * height,
          width: region.width * width,
          height: region.height * height,
          color: rgb(0, 0, 0),
        });
      }
      const bytes = await document.save({ useObjectStreams: true });
      const masked = new File([bytes], file.name, { type: "application/pdf", lastModified: file.lastModified });
      onApply(masked, regions.length);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "직접 마스킹한 PDF를 만들지 못했습니다.");
      setBusy(false);
    }
  }

  const visibleRegions = draft ? [...pageRegions, draft] : pageRegions;
  return <div className="manual-redactor-backdrop" role="presentation">
    <section className="manual-redactor-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-redactor-title">
      <header>
        <div><span>브라우저 내 안전 편집</span><h2 id="manual-redactor-title">개인정보 직접 마스킹</h2><p>가릴 부분을 마우스로 드래그하세요. 검은색 영역이 적용된 새 PDF 사본만 분석에 사용됩니다.</p></div>
        <button type="button" onClick={onCancel} aria-label="직접 마스킹 닫기">×</button>
      </header>
      <div className="manual-redactor-toolbar">
        <button type="button" disabled={pageNumber <= 1 || busy} onClick={() => setPageNumber((value) => value - 1)}>이전 쪽</button>
        <strong>{pageNumber} / {source?.numPages || "-"}쪽</strong>
        <button type="button" disabled={!source || pageNumber >= source.numPages || busy} onClick={() => setPageNumber((value) => value + 1)}>다음 쪽</button>
        <span>마스킹 영역 {regions.length}개</span>
        <button type="button" disabled={!regions.length || busy} onClick={() => setRegions((current) => current.slice(0, -1))}>마지막 영역 취소</button>
      </div>
      {error && <div className="document-message error" role="alert">{error}</div>}
      <div className="manual-redactor-scroll" ref={pageWrapRef}>
        <div className="manual-redactor-page">
          <canvas ref={canvasRef} />
          <div className="manual-redactor-layer" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
            {visibleRegions.map((region, index) => <span key={`${region.page}-${index}`} style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />)}
          </div>
          {busy && <div className="manual-redactor-loading">PDF 처리 중…</div>}
        </div>
      </div>
      <footer><button type="button" onClick={onCancel}>취소</button><button className="primary" type="button" disabled={!regions.length || busy} onClick={() => void applyMask()}>{busy ? "처리 중…" : "마스킹 사본 사용"}</button></footer>
    </section>
  </div>;
}
