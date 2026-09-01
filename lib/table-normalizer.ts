function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

async function unzipEntries(bytes: Uint8Array, wanted: (name: string) => boolean) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= Math.max(0, bytes.length - 65557) && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error("XLSX ZIP 구조를 읽을 수 없습니다.");

  const total = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const result = new Map<string, string>();

  for (let index = 0; index < total; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));

    if (wanted(name)) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      let uncompressed: Uint8Array;
      if (method === 0) {
        uncompressed = compressed;
      } else if (method === 8) {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        uncompressed = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw new Error("지원하지 않는 XLSX 압축 방식입니다.");
      }
      result.set(name, decoder.decode(uncompressed));
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

function textNodes(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1]));
}

function sharedStringValues(xml: string) {
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => {
    const withoutPhonetics = match[1].replace(/<rPh(?:\s[^>]*)?>[\s\S]*?<\/rPh>/g, "");
    return textNodes(withoutPhonetics).join("");
  });
}

function normalizeNumericValue(raw: string) {
  if (!/^-?\d+(?:\.\d+)?(?:E[+-]?\d+)?$/i.test(raw)) return decodeXml(raw);
  const value = Number(raw);
  return Number.isFinite(value) ? String(Number(value.toPrecision(12))) : raw;
}

function columnIndex(reference: string) {
  const letters = reference.match(/[A-Z]+/)?.[0] || "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function columnLabel(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

type TableCell = { column: number; row: number; value: string };
type MergedRange = { minColumn: number; maxColumn: number; minRow: number; maxRow: number; anchor: string };

function parseReference(reference: string) {
  const row = Number(reference.match(/\d+/)?.[0] || 1);
  return { column: columnIndex(reference), row };
}

function parseMergedRange(reference: string): MergedRange | null {
  const [start, end = start] = reference.split(":");
  if (!start) return null;
  const first = parseReference(start);
  const last = parseReference(end);
  return { minColumn: first.column, maxColumn: last.column, minRow: first.row, maxRow: last.row, anchor: start };
}

function workbookSheetNames(entries: Map<string, string>) {
  const workbook = entries.get("xl/workbook.xml") || "";
  const relationships = entries.get("xl/_rels/workbook.xml.rels") || "";
  const targets = new Map<string, string>();
  for (const match of relationships.matchAll(/<Relationship\s([^>]*?)\/?\s*>/g)) {
    const id = match[1].match(/\bId="([^"]+)"/)?.[1];
    const target = match[1].match(/\bTarget="([^"]+)"/)?.[1];
    if (!id || !target) continue;
    targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }
  const names = new Map<string, string>();
  for (const match of workbook.matchAll(/<sheet\s([^>]*?)\/?\s*>/g)) {
    const name = match[1].match(/\bname="([^"]+)"/)?.[1];
    const relationshipId = match[1].match(/\br:id="([^"]+)"/)?.[1];
    const target = relationshipId ? targets.get(relationshipId) : null;
    if (name && target) names.set(target, decodeXml(name));
  }
  return names;
}

function normalizeWorksheet(xml: string, sharedStrings: string[]) {
  const cells = new Map<string, TableCell>();
  const rows = new Set<number>();
  for (const cellMatch of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = cellMatch[1];
    const body = cellMatch[2] || "";
    const ref = attrs.match(/\br="([^"]+)"/)?.[1] || "A1";
    const type = attrs.match(/\bt="([^"]+)"/)?.[1];
    const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? textNodes(body).join("");
    if (!raw) continue;
    const parsed = parseReference(ref);
    const value = type === "s" ? sharedStrings[Number(raw)] ?? raw : normalizeNumericValue(raw);
    cells.set(ref, { ...parsed, value });
    rows.add(parsed.row);
  }

  const mergedRanges = [...xml.matchAll(/<mergeCell\s+ref="([^"]+)"\s*\/?\s*>/g)]
    .map((match) => parseMergedRange(match[1]))
    .filter((range): range is MergedRange => Boolean(range));

  const lines: string[] = [];
  for (const rowNumber of [...rows].sort((left, right) => left - right)) {
    const values: Array<{ column: number; label: string; value: string }> = [];
    const included = new Set<string>();
    for (const range of mergedRanges) {
      if (range.minRow > rowNumber || range.maxRow < rowNumber) continue;
      const anchor = cells.get(range.anchor);
      const value = anchor?.value.replace(/\s+/g, " ").trim();
      if (!value || included.has(range.anchor)) continue;
      included.add(range.anchor);
      const end = columnLabel(range.maxColumn);
      values.push({ column: range.minColumn, label: `${columnLabel(range.minColumn)}:${end}`, value });
    }
    for (const [ref, cell] of cells) {
      if (cell.row !== rowNumber || included.has(ref)) continue;
      const value = cell.value.replace(/\s+/g, " ").trim();
      if (value) values.push({ column: cell.column, label: columnLabel(cell.column), value });
    }
    values.sort((left, right) => left.column - right.column);
    if (values.length) lines.push(`행 ${rowNumber}: ${values.map((item) => `[${item.label}] ${item.value}`).join(" | ")}`);
  }
  return lines;
}

export async function normalizeTableFile(file: File, extension: string) {
  if (extension === "csv") {
    const csv = new TextDecoder("utf-8").decode(await file.arrayBuffer());
    return csv.replace(/^\uFEFF/, "").slice(0, 1_500_000);
  }

  const entries = await unzipEntries(
    new Uint8Array(await file.arrayBuffer()),
    (name) => name === "xl/sharedStrings.xml" || name === "xl/workbook.xml" || name === "xl/_rels/workbook.xml.rels" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
  );
  const sharedStrings = sharedStringValues(entries.get("xl/sharedStrings.xml") || "");
  const sheets = [...entries.entries()].filter(([name]) => name.startsWith("xl/worksheets/")).sort();
  const sheetNames = workbookSheetNames(entries);
  if (sheets.length === 0) throw new Error("XLSX에서 워크시트를 찾을 수 없습니다.");

  const output: string[] = [];
  for (const [name, xml] of sheets) {
    output.push(`## 워크시트: ${sheetNames.get(name) || name.replace("xl/worksheets/", "").replace(".xml", "")}`);
    output.push(...normalizeWorksheet(xml, sharedStrings));
    if (output.join("\n").length > 1_500_000) return output.join("\n").slice(0, 1_500_000);
  }
  return output.join("\n");
}
