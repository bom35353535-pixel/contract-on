import type { PrivacyMaskCounts } from "./browser-privacy-mask";

type OcrWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
type OcrLine = { words: OcrWord[]; bbox: { x0: number; y0: number; x1: number; y1: number } };

function numericGroups(line: OcrLine) {
  const groups: OcrWord[][] = [];
  let current: OcrWord[] = [];
  for (const word of line.words) {
    const numeric = /^[0-9\-\s]+$/.test(word.text.trim()) && /\d/.test(word.text);
    const previous = current.at(-1);
    const height = Math.max(1, line.bbox.y1 - line.bbox.y0);
    const close = !previous || word.bbox.x0 - previous.bbox.x1 <= Math.max(28, height * 1.7);
    if (numeric && close) current.push(word);
    else {
      if (current.length) groups.push(current);
      current = numeric ? [word] : [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function isResidentNumber(digits: string) {
  if (!/^\d{13}$/.test(digits)) return false;
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 && /^[1-8]$/.test(digits[6]);
}

function redactableGroups(lines: OcrLine[]) {
  const regions: Array<{ x0: number; y0: number; x1: number; y1: number; kind: "resident" | "account" }> = [];
  for (const line of lines) {
    for (const group of numericGroups(line)) {
      const digits = group.map((word) => word.text).join("").replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 20) continue;
      const x0 = Math.min(...group.map((word) => word.bbox.x0));
      const y0 = Math.min(...group.map((word) => word.bbox.y0));
      const x1 = Math.max(...group.map((word) => word.bbox.x1));
      const y1 = Math.max(...group.map((word) => word.bbox.y1));
      regions.push({ x0, y0, x1, y1, kind: isResidentNumber(digits) ? "resident" : "account" });
    }
  }
  return regions;
}

function collectLines(blocks: unknown) {
  if (!Array.isArray(blocks)) return [] as OcrLine[];
  const lines: OcrLine[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const paragraphs = Array.isArray((block as { paragraphs?: unknown[] }).paragraphs) ? (block as { paragraphs: unknown[] }).paragraphs : [];
    for (const paragraph of paragraphs) {
      if (!paragraph || typeof paragraph !== "object") continue;
      const candidates = Array.isArray((paragraph as { lines?: unknown[] }).lines) ? (paragraph as { lines: unknown[] }).lines : [];
      for (const line of candidates) {
        if (!line || typeof line !== "object") continue;
        const value = line as OcrLine;
        if (Array.isArray(value.words) && value.bbox) lines.push(value);
      }
    }
  }
  return lines;
}

export async function redactPdfInBrowser(file: File, onProgress?: (message: string) => void) {
  const [{ getDocument, GlobalWorkerOptions }, { PDFDocument }, Tesseract] = await Promise.all([
    import("pdfjs-dist"),
    import("pdf-lib"),
    import("tesseract.js"),
  ]);
  GlobalWorkerOptions.workerSrc = "/pdf-privacy/pdf.worker.min.mjs";
  const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    workerPath: "/pdf-privacy/tesseract-worker.min.js",
    corePath: "/pdf-privacy/tesseract-core-lstm.wasm.js",
    langPath: "/pdf-privacy",
    logger: () => undefined,
  });
  const source = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const output = await PDFDocument.create();
  const counts: PrivacyMaskCounts = { mobile: 0, email: 0, residentRegistration: 0, account: 0 };
  try {
    await worker.setParameters({ tessedit_char_whitelist: "0123456789- ", preserve_interword_spaces: "1" });
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      onProgress?.(`PDF 개인정보 자동 탐지 중 · ${pageNumber}/${source.numPages}쪽`);
      const page = await source.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(1.8, Math.max(1.35, 2100 / Math.max(base.width, base.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("PDF 페이지를 처리할 수 없습니다.");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const recognized = await worker.recognize(canvas, {}, { blocks: true });
      const regions = redactableGroups(collectLines(recognized.data.blocks));
      context.fillStyle = "#000000";
      for (const region of regions) {
        const padding = 5;
        context.fillRect(Math.max(0, region.x0 - padding), Math.max(0, region.y0 - padding), region.x1 - region.x0 + padding * 2, region.y1 - region.y0 + padding * 2);
        if (region.kind === "resident") counts.residentRegistration += 1;
        else counts.account += 1;
      }
      const image = await output.embedJpg(canvas.toDataURL("image/jpeg", 0.88));
      const outputPage = output.addPage([base.width, base.height]);
      outputPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
      page.cleanup();
    }
    const bytes = await output.save({ useObjectStreams: true });
    const masked = new File([bytes], file.name, { type: "application/pdf", lastModified: file.lastModified });
    return { file: masked, counts, pageCount: source.numPages };
  } finally {
    await worker.terminate().catch(() => undefined);
    await source.destroy().catch(() => undefined);
  }
}
