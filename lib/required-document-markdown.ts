import type { DocumentStage, RequiredDocumentCriterion } from "./contract-document-review";

type KnowledgeMarkdown = {
  id: string;
  documentName: string;
  originalName: string;
  year: number | null;
  text: string;
};

const STAGE_HEADING: Record<DocumentStage, RegExp> = {
  NARA_CONTRACT: /계약\s*(?:체결\s*)?단계/,
  PRE_CONSTRUCTION: /착공\s*단계/,
  COMPLETION: /준공\s*단계/,
};

function cleanCell(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/\*\*|__|`/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tableCells(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  return trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cleanCell);
}

function aliasesFor(name: string) {
  if (/착공신고서|착공계/.test(name)) return ["착공신고서", "착공계"];
  if (/현장기술자|현장대리인/.test(name)) return ["현장기술자 지정신고서", "현장대리인계", "현장대리인 선임계", "재직증명서", "자격증 사본"];
  if (/공사공정예정표|공정예정표|예정공정표/.test(name)) return ["공사공정예정표", "공정예정표", "예정공정표"];
  if (/전기.*수도료/.test(name)) return ["전기, 수도료 납부 합의서", "전기·수도료 납부 합의서", "미사용 각서"];
  if (/노무비.*구분관리/.test(name)) return ["노무비 구분관리 및 지급확인제 합의서", "노무비 구분관리제 적용 제외 확인서", "노무비 구분관리제 및 지급확인제 적용 제외 확인서"];
  if (/안전.*보건.*체크리스트/.test(name)) return ["공사(용역) 안전·보건 체크리스트", "안전·보건 체크리스트", "안전보건 체크리스트"];
  return [name];
}

function canonicalName(name: string) {
  if (/착공신고서|착공계/.test(name)) return "착공계";
  if (/현장기술자|현장대리인/.test(name)) return "현장기술자 지정신고서";
  if (/공사공정예정표|공정예정표|예정공정표/.test(name)) return "공사공정예정표";
  if (/안전.*보건.*체크리스트/.test(name)) return "공사(용역) 안전·보건 체크리스트";
  return name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s*\/\s*/g, " / ").replace(/\s*\/\s*$/, "").trim();
}

function shouldExclude(stage: DocumentStage, name: string) {
  if (stage === "PRE_CONSTRUCTION" && /착공\s*전\s*현장사진/.test(name)) return true;
  return false;
}

function sectionRows(document: KnowledgeMarkdown, stage: DocumentStage): RequiredDocumentCriterion[] {
  const lines = document.text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{1,6}\s*/.test(line) && STAGE_HEADING[stage].test(cleanCell(line)));
  if (start < 0) return [];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,6}\s*/.test(lines[index])) { end = index; break; }
  }
  const heading = cleanCell(lines[start].replace(/^#{1,6}\s*/, ""));
  const rows: RequiredDocumentCriterion[] = [];
  for (const line of lines.slice(start + 1, end)) {
    const cells = tableCells(line);
    if (cells.length < 2) continue;
    const rawName = cells[0];
    if (!rawName || /서류명/.test(rawName) || /^:?-{3,}:?$/.test(rawName) || shouldExclude(stage, rawName)) continue;
    const name = canonicalName(rawName);
    if (!name) continue;
    rows.push({
      requiredName: name,
      aliases: [...new Set(aliasesFor(rawName))],
      evidenceDocumentId: document.id,
      evidenceDocumentName: document.documentName,
      evidenceYear: document.year,
      evidenceLocation: `${heading} 표`,
      evidenceExcerpt: cells.filter(Boolean).join(" | ").slice(0, 350),
    });
  }
  return rows;
}

export function findLocalRequiredDocumentCriteria(stage: DocumentStage, documents: KnowledgeMarkdown[]) {
  const ordered = [...documents].sort((left, right) => {
    const score = (document: KnowledgeMarkdown) => /계약구비서류.*공사|공사.*계약구비서류/i.test(`${document.documentName} ${document.originalName}`) ? 1 : 0;
    return score(right) - score(left);
  });
  for (const document of ordered) {
    const rows = sectionRows(document, stage);
    if (rows.length) return rows;
  }
  return [];
}
