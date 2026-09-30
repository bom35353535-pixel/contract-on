import type { PrivacyMaskCounts } from "./browser-privacy-mask";

type OcrWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
type OcrLine = { words: OcrWord[]; bbox: { x0: number; y0: number; x1: number; y1: number } };
type RedactionKind = "resident" | "mobile" | "account" | "name" | "birthDate" | "position";
type RedactionRegion = { x0: number; y0: number; x1: number; y1: number; kind: RedactionKind };

const PERSONNEL_FIELDS = [
  { label: "생년월일", kind: "birthDate" as const },
  { label: "성명", kind: "name" as const },
  { label: "이름", kind: "name" as const },
  { label: "직위", kind: "position" as const },
  { label: "직책", kind: "position" as const },
];
const FIELD_BOUNDARIES = ["현장배치기간", "배치기간", "소속", "주소", "자격", "면허", "비고"];

function normalized(value: string) {
  return value.replace(/[\s:：·ㆍ._()\[\]{}]/g, "");
}

function lineText(line: OcrLine) {
  return line.words.map((word) => word.text).join(" ");
}

function pageIsPersonnelDocument(lines: OcrLine[], filename: string) {
  const text = normalized(`${filename} ${lines.map(lineText).join(" ")}`);
  if (/현장대리인계|현장기술자지정신고서|재직증명서/.test(text)) return true;
  return ["성명", "생년월일", "직위"].filter((label) => text.includes(label)).length >= 2;
}

function personnelFieldRegions(line: OcrLine): RedactionRegion[] {
  const words = line.words.map((word) => ({ word, text: normalized(word.text) })).filter((item) => item.text);
  let cursor = 0;
  const spans = words.map((item) => {
    const start = cursor;
    cursor += item.text.length;
    return { ...item, start, end: cursor };
  });
  const joined = spans.map((item) => item.text).join("");
  const labels = [...PERSONNEL_FIELDS, ...FIELD_BOUNDARIES.map((label) => ({ label, kind: null }))].flatMap((field) => {
    const results: Array<{ start: number; end: number; kind: RedactionKind | null }> = [];
    let from = 0;
    while (from < joined.length) {
      const start = joined.indexOf(field.label, from);
      if (start < 0) break;
      results.push({ start, end: start + field.label.length, kind: field.kind });
      from = start + field.label.length;
    }
    return results;
  }).sort((a, b) => a.start - b.start);
  return labels.flatMap((label, index) => {
    if (!label.kind) return [];
    const valueEnd = labels[index + 1]?.start ?? joined.length;
    const labelWords = spans.filter((item) => item.end > label.start && item.start < label.end);
    const candidates = spans.filter((item) => item.start >= label.end && item.end <= valueEnd && /[0-9A-Za-z가-힣]/.test(item.text));
    if (!labelWords.length) return [];
    const labelRight = Math.max(...labelWords.map((item) => item.word.bbox.x1));
    const nextLabel = labels[index + 1];
    const nextLabelWords = nextLabel ? spans.filter((item) => item.end > nextLabel.start && item.start < nextLabel.end) : [];
    const fallbackWidth = label.kind === "birthDate" ? 240 : label.kind === "position" ? 210 : 170;
    const x0 = candidates.length ? Math.min(...candidates.map((item) => item.word.bbox.x0)) : labelRight + 3;
    const x1 = candidates.length
      ? Math.max(...candidates.map((item) => item.word.bbox.x1))
      : nextLabelWords.length ? Math.max(x0 + 30, Math.min(...nextLabelWords.map((item) => item.word.bbox.x0)) - 4) : labelRight + fallbackWidth;
    return [{
      x0,
      y0: Math.min(...labelWords.map((item) => item.word.bbox.y0)) - 2,
      x1,
      y1: Math.max(...labelWords.map((item) => item.word.bbox.y1)) + 2,
      kind: label.kind,
    }];
  });
}

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

function isMobileNumber(digits: string) {
  return /^01[016789]\d{7,8}$/.test(digits);
}

export function findPdfPrivacyRegions(lines: OcrLine[], options: { filename?: string; documentType?: string } = {}) {
  const regions: RedactionRegion[] = [];
  const personnelDocument = pageIsPersonnelDocument(lines, `${options.filename || ""} ${options.documentType || ""}`);
  for (const line of lines) {
    const text = normalized(lineText(line));
    if (personnelDocument && !/현장배치기간|배치기간/.test(text)) regions.push(...personnelFieldRegions(line));
    for (const group of numericGroups(line)) {
      const digits = group.map((word) => word.text).join("").replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 20) continue;
      const x0 = Math.min(...group.map((word) => word.bbox.x0));
      const y0 = Math.min(...group.map((word) => word.bbox.y0));
      const x1 = Math.max(...group.map((word) => word.bbox.x1));
      const y1 = Math.max(...group.map((word) => word.bbox.y1));
      const kind = isResidentNumber(digits) ? "resident" : isMobileNumber(digits) ? "mobile" : /계좌|예금|은행/.test(text) ? "account" : null;
      if (!kind) continue;
      regions.push({ x0, y0, x1, y1, kind });
    }
  }
  return regions.filter((region, index) => !regions.some((candidate, candidateIndex) => candidateIndex < index && candidate.kind === region.kind && Math.abs(candidate.x0 - region.x0) < 3 && Math.abs(candidate.y0 - region.y0) < 3));
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

export async function redactPdfInBrowser(file: File, onProgress?: (message: string) => void, options: { documentType?: string } = {}) {
  const [{ getDocument, GlobalWorkerOptions }, { PDFDocument }, Tesseract] = await Promise.all([
    import("pdfjs-dist"),
    import("pdf-lib"),
    import("tesseract.js"),
  ]);
  GlobalWorkerOptions.workerSrc = "/pdf-privacy/pdf.worker.min.mjs";
  const worker = await Tesseract.createWorker("kor+eng", Tesseract.OEM.LSTM_ONLY, {
    workerPath: "/pdf-privacy/tesseract-worker.min.js",
    corePath: "/pdf-privacy/tesseract-core-lstm.wasm.js",
    langPath: "/pdf-privacy",
    logger: () => undefined,
  });
  const source = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const output = await PDFDocument.create();
  const counts: PrivacyMaskCounts = { mobile: 0, email: 0, residentRegistration: 0, account: 0, name: 0, birthDate: 0, position: 0 };
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
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
      const regions = findPdfPrivacyRegions(collectLines(recognized.data.blocks), { filename: file.name, documentType: options.documentType });
      context.fillStyle = "#000000";
      for (const region of regions) {
        const padding = 5;
        context.fillRect(Math.max(0, region.x0 - padding), Math.max(0, region.y0 - padding), region.x1 - region.x0 + padding * 2, region.y1 - region.y0 + padding * 2);
        if (region.kind === "resident") counts.residentRegistration += 1;
        else if (region.kind === "mobile") counts.mobile += 1;
        else if (region.kind === "account") counts.account += 1;
        else if (region.kind === "name") counts.name = (counts.name || 0) + 1;
        else if (region.kind === "birthDate") counts.birthDate = (counts.birthDate || 0) + 1;
        else counts.position = (counts.position || 0) + 1;
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
    if (typeof source.destroy === "function") {
      await Promise.resolve(source.destroy()).catch(() => undefined);
    }
  }
}
