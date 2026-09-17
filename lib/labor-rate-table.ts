export type LaborRateMatch = {
  occupation: string;
  amount: number;
  line: string;
};

function tableCells(line: string) {
  if (!line.includes("|")) return [];
  const cells = line.split("|").map((cell) => cell.trim());
  if (!cells[0]) cells.shift();
  if (!cells.at(-1)) cells.pop();
  return cells;
}

function plain(value: string) {
  return value.normalize("NFKC").replace(/<br\s*\/?\s*>/gi, " ").replace(/[`*_]/g, "").trim();
}

function normalized(value: string) {
  return plain(value).replace(/[\s·ㆍ.,:;()\[\]{}<>\-/]/g, "").toLowerCase();
}

function amount(value: string | undefined) {
  if (!value) return null;
  const match = plain(value).match(/^(\d[\d,]*)\s*(?:원)?$/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : null;
}

function ratePeriodScore(value: string) {
  const label = plain(value);
  const date = label.match(/(20\d{2})\D{0,3}(\d{1,2})?(?:\D{0,3}(\d{1,2}))?/);
  if (!date) return -1;
  const year = Number(date[1]);
  const month = date[2] ? Number(date[2]) : label.includes("하반기") ? 7 : label.includes("상반기") ? 1 : 0;
  const day = date[3] ? Number(date[3]) : 0;
  return year * 10_000 + month * 100 + day;
}

function latestRateColumn(cells: string[]) {
  let index = -1;
  let score = -1;
  cells.forEach((cell, cellIndex) => {
    const candidate = ratePeriodScore(cell);
    if (candidate > score) {
      score = candidate;
      index = cellIndex;
    }
  });
  return index;
}

export function laborDocumentPriority(document: { documentName: string; originalName: string; year: number | null; effectiveFrom?: string | null }) {
  if (document.effectiveFrom) {
    const parsed = Number(document.effectiveFrom.replace(/[^0-9]/g, "").slice(0, 8));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const name = `${document.documentName} ${document.originalName}`;
  const dated = name.match(/(20\d{2})\D{0,3}(\d{1,2})(?:\D{0,3}(\d{1,2}))?/);
  if (dated) return Number(dated[1]) * 10_000 + Number(dated[2]) * 100 + Number(dated[3] || 0);
  const year = Number(name.match(/20\d{2}/)?.[0] || document.year || 0);
  return year * 10_000 + (name.includes("하반기") ? 700 : name.includes("상반기") ? 100 : 0);
}

export function findLaborRateInMarkdown(text: string, targetLabel: string): LaborRateMatch | null {
  const rows = text.split(/\r?\n/).map((line) => ({ line, cells: tableCells(line) })).filter(({ cells }) => cells.length > 1);
  const header = rows.find(({ cells }) => cells.some((cell) => normalized(cell) === "직종명") && latestRateColumn(cells) >= 0);
  const occupationColumn = header?.cells.findIndex((cell) => normalized(cell) === "직종명") ?? -1;
  const rateColumn = header ? latestRateColumn(header.cells) : -1;
  const wanted = normalized(targetLabel);

  const candidates = rows.flatMap(({ line, cells }) => {
    const labelColumn = occupationColumn >= 0 ? occupationColumn : cells.findIndex((cell) => {
      const candidate = normalized(cell);
      return candidate === wanted || (candidate.length >= 2 && wanted.includes(candidate));
    });
    if (labelColumn < 0 || labelColumn >= cells.length) return [];
    const occupation = plain(cells[labelColumn]);
    const occupationKey = normalized(occupation);
    if (!occupationKey || occupationKey === "직종명") return [];
    const rate = rateColumn > labelColumn ? amount(cells[rateColumn]) : cells.slice(labelColumn + 1).map(amount).find((value) => value !== null) ?? null;
    return rate === null ? [] : [{ occupation, occupationKey, amount: rate, line }];
  });

  const exact = candidates.find((candidate) => candidate.occupationKey === wanted);
  if (exact) return { occupation: exact.occupation, amount: exact.amount, line: exact.line };

  const contained = candidates.filter((candidate) => candidate.occupationKey.length >= 2 && wanted.length >= 2 && (wanted.includes(candidate.occupationKey) || candidate.occupationKey.includes(wanted)));
  if (contained.length !== 1) return null;
  return { occupation: contained[0].occupation, amount: contained[0].amount, line: contained[0].line };
}
