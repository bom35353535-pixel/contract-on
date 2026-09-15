import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type PrivacyMaskCounts = { mobile: number; email: number };
export type BrowserMaskResult =
  | { supported: true; file: File; preview: string; counts: PrivacyMaskCounts }
  | { supported: false; reason: string };

const MOBILE_PATTERN = /\b(01[016789])([ -]?)(\d{3,4})([ -]?)(\d{4})\b/g;
const EMAIL_PATTERN = /\b([A-Z0-9._%+-])([A-Z0-9._%+-]*)(@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

export function maskPrivateText(value: string) {
  const counts: PrivacyMaskCounts = { mobile: 0, email: 0 };
  const mobileMasked = value.replace(MOBILE_PATTERN, (_match, prefix: string, separator1: string, middle: string, separator2: string, last: string) => {
    counts.mobile += 1;
    return `${prefix}${separator1}${"*".repeat(middle.length)}${separator2}${last}`;
  });
  const text = mobileMasked.replace(EMAIL_PATTERN, (_match, first: string, _remainder: string, domain: string) => {
    counts.email += 1;
    return `${first}***${domain}`;
  });
  return { text, counts };
}

function addCounts(target: PrivacyMaskCounts, addition: PrivacyMaskCounts) {
  target.mobile += addition.mobile;
  target.email += addition.email;
}

function localName(element: Element) {
  return element.localName || element.nodeName.split(":").at(-1) || element.nodeName;
}

function descendants(element: Element, name: string) {
  return Array.from(element.getElementsByTagName("*")).filter((candidate) => localName(candidate) === name);
}

function maskXmlContainers(xml: string, containerNames: string[]) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("문서 내부 XML을 읽지 못했습니다.");
  const counts: PrivacyMaskCounts = { mobile: 0, email: 0 };
  const preview: string[] = [];
  const containers = Array.from(document.getElementsByTagName("*")).filter((element) => containerNames.includes(localName(element)));
  for (const container of containers) {
    let textNodes = descendants(container, "t");
    if (!textNodes.length) textNodes = descendants(container, "v");
    if (!textNodes.length) continue;
    const original = textNodes.map((node) => node.textContent || "").join("");
    if (!original) continue;
    const masked = maskPrivateText(original);
    addCounts(counts, masked.counts);
    textNodes[0].textContent = masked.text;
    for (const node of textNodes.slice(1)) node.textContent = "";
    preview.push(masked.text);
  }
  return { xml: new XMLSerializer().serializeToString(document), preview, counts };
}

function maskedFile(original: File, content: BlobPart) {
  return new File([content], original.name, { type: original.type || "application/octet-stream", lastModified: original.lastModified });
}

async function maskZipDocument(file: File, kind: "xlsx" | "docx"): Promise<BrowserMaskResult> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const counts: PrivacyMaskCounts = { mobile: 0, email: 0 };
  const preview: string[] = [];
  const paths = Object.keys(files).filter((path) => kind === "xlsx"
    ? path === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)
    : /^word\/(?:document|header\d*|footer\d*|comments|footnotes|endnotes)\.xml$/i.test(path));
  for (const path of paths) {
    const result = maskXmlContainers(strFromU8(files[path]), kind === "xlsx" ? ["si", "is", "c"] : ["p"]);
    files[path] = strToU8(result.xml);
    addCounts(counts, result.counts);
    preview.push(...result.preview);
  }
  const zipped = zipSync(files, { level: 6 });
  return { supported: true, file: maskedFile(file, zipped), preview: preview.join("\n").slice(0, 50_000), counts };
}

function pdfUnsupportedReason(bytes: Uint8Array) {
  const sample = strFromU8(bytes.subarray(0, Math.min(bytes.length, 1_500_000)));
  const hasTextOperator = /(?:^|\s)BT(?:\s|$)/.test(sample);
  const hasImages = /\/Subtype\s*\/Image/.test(sample);
  if (hasImages && !hasTextOperator) return "스캔·이미지형 PDF는 브라우저 텍스트 탐지만으로 개인정보를 안전하게 가릴 수 없어 현재 지원하지 않습니다.";
  if (hasTextOperator) return "텍스트형 PDF는 글자의 화면 위치까지 가린 새 PDF를 안전하게 생성하는 기능이 아직 없어 현재 지원하지 않습니다.";
  return "PDF가 텍스트형인지 스캔형인지 브라우저에서 안전하게 판별할 수 없어 현재 개인정보 마스킹을 지원하지 않습니다.";
}

export async function maskEstimateFileInBrowser(file: File): Promise<BrowserMaskResult> {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
  if (extension === ".csv") {
    const original = await file.text();
    const masked = maskPrivateText(original);
    return { supported: true, file: maskedFile(file, masked.text), preview: masked.text.slice(0, 50_000), counts: masked.counts };
  }
  if (extension === ".xlsx") return maskZipDocument(file, "xlsx");
  if (extension === ".docx") return maskZipDocument(file, "docx");
  if (extension === ".pdf") return { supported: false, reason: pdfUnsupportedReason(new Uint8Array(await file.arrayBuffer())) };
  if (extension === ".xls") return { supported: false, reason: "구형 XLS 형식은 브라우저에서 원본 구조를 보존한 마스킹 사본을 안전하게 만들 수 없어 현재 지원하지 않습니다." };
  return { supported: false, reason: "이 파일 형식은 현재 브라우저 개인정보 마스킹을 지원하지 않습니다." };
}
