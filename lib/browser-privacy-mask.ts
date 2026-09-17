import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type PrivacyMaskCounts = { mobile: number; email: number; residentRegistration: number; account: number };
export type BrowserMaskResult =
  | { supported: true; file: File; preview: string; counts: PrivacyMaskCounts }
  | { supported: false; reason: string };

const MOBILE_PATTERN = /\b(01[016789])([ -]?)(\d{3,4})([ -]?)(\d{4})\b/g;
const EMAIL_PATTERN = /\b([A-Z0-9._%+-])([A-Z0-9._%+-]*)(@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const RESIDENT_REGISTRATION_PATTERN = /\b\d{6}([ -]?)[1-8]\d{6}\b/g;
const LABELED_ACCOUNT_PATTERN = /(계좌(?:번호)?|입금계좌|은행계좌)(\s*[:：]?\s*)([0-9][0-9 -]{6,22}[0-9])/g;

function hideAccountDigits(value: string) {
  let remaining = 4;
  return Array.from(value).reverse().map((character) => {
    if (!/\d/.test(character)) return character;
    if (remaining > 0) { remaining -= 1; return character; }
    return "*";
  }).reverse().join("");
}

export function maskPrivateText(value: string, options: { maskAccountNumbers?: boolean } = {}) {
  const counts: PrivacyMaskCounts = { mobile: 0, email: 0, residentRegistration: 0, account: 0 };
  const residentMasked = value.replace(RESIDENT_REGISTRATION_PATTERN, (_match, separator: string) => {
    counts.residentRegistration += 1;
    return `******${separator || "-"}*******`;
  });
  const mobileMasked = residentMasked.replace(MOBILE_PATTERN, (_match, prefix: string, separator1: string, middle: string, separator2: string, last: string) => {
    counts.mobile += 1;
    return `${prefix}${separator1}${"*".repeat(middle.length)}${separator2}${last}`;
  });
  const emailMasked = mobileMasked.replace(EMAIL_PATTERN, (_match, first: string, _remainder: string, domain: string) => {
    counts.email += 1;
    return `${first}***${domain}`;
  });
  const labeledMasked = emailMasked.replace(LABELED_ACCOUNT_PATTERN, (_match, label: string, separator: string, account: string) => {
    const digitCount = (account.match(/\d/g) || []).length;
    if (digitCount < 8 || digitCount > 20) return _match;
    counts.account += 1;
    return `${label}${separator}${hideAccountDigits(account)}`;
  });
  const text = options.maskAccountNumbers ? labeledMasked.replace(/\b(?:\d[ -]?){7,19}\d\b/g, (account) => {
    const digits = account.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 20 || /^01[016789]\d{7,8}$/.test(digits)) return account;
    counts.account += 1;
    return hideAccountDigits(account);
  }) : labeledMasked;
  return { text, counts };
}

function addCounts(target: PrivacyMaskCounts, addition: PrivacyMaskCounts) {
  target.mobile += addition.mobile;
  target.email += addition.email;
  target.residentRegistration += addition.residentRegistration;
  target.account += addition.account;
}

function localName(element: Element) {
  return element.localName || element.nodeName.split(":").at(-1) || element.nodeName;
}

function descendants(element: Element, name: string) {
  return Array.from(element.getElementsByTagName("*")).filter((candidate) => localName(candidate) === name);
}

function maskXmlContainers(xml: string, containerNames: string[], options: { maskAccountNumbers?: boolean } = {}) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("문서 내부 XML을 읽지 못했습니다.");
  const counts: PrivacyMaskCounts = { mobile: 0, email: 0, residentRegistration: 0, account: 0 };
  const preview: string[] = [];
  const containers = Array.from(document.getElementsByTagName("*")).filter((element) => containerNames.includes(localName(element)));
  for (const container of containers) {
    let textNodes = descendants(container, "t");
    if (!textNodes.length) textNodes = descendants(container, "v");
    if (!textNodes.length) continue;
    const original = textNodes.map((node) => node.textContent || "").join("");
    if (!original) continue;
    const masked = maskPrivateText(original, options);
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

async function maskZipDocument(file: File, kind: "xlsx" | "docx", options: { maskAccountNumbers?: boolean } = {}): Promise<BrowserMaskResult> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const counts: PrivacyMaskCounts = { mobile: 0, email: 0, residentRegistration: 0, account: 0 };
  const preview: string[] = [];
  const paths = Object.keys(files).filter((path) => kind === "xlsx"
    ? path === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)
    : /^word\/(?:document|header\d*|footer\d*|comments|footnotes|endnotes)\.xml$/i.test(path));
  for (const path of paths) {
    const result = maskXmlContainers(strFromU8(files[path]), kind === "xlsx" ? ["si", "is", "c"] : ["p"], options);
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

export function isSensitiveContractDocument(documentType: string) {
  return documentType === "통장사본" || documentType === "인감증명서";
}

export async function maskContractDocumentInBrowser(file: File, documentType: string): Promise<BrowserMaskResult> {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
  const options = { maskAccountNumbers: documentType === "통장사본" || documentType === "계약서류" };
  if (extension === ".txt" || extension === ".csv") {
    const original = await file.text();
    const masked = maskPrivateText(original, options);
    return { supported: true, file: maskedFile(file, masked.text), preview: masked.text.slice(0, 50_000), counts: masked.counts };
  }
  if (extension === ".xlsx") return maskZipDocument(file, "xlsx", options);
  if (extension === ".docx") return maskZipDocument(file, "docx", options);
  if (extension === ".pdf") return { supported: false, reason: "PDF·스캔 문서는 브라우저가 계좌번호와 주민등록번호의 화면 위치를 안전하게 확인할 수 없습니다. 개인정보를 직접 가린 사본을 다시 선택하거나, 아래에서 이미 마스킹한 사본임을 확인해 주세요." };
  if (extension === ".xls") return { supported: false, reason: "구형 XLS 문서는 브라우저에서 원본 구조를 보존한 마스킹 사본을 만들 수 없습니다. 개인정보를 직접 가린 사본을 사용해 주세요." };
  return { supported: false, reason: "이 파일 형식은 자동 마스킹을 지원하지 않습니다. 개인정보를 직접 가린 사본을 사용해 주세요." };
}
