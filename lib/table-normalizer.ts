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

function columnIndex(reference: string) {
  const letters = reference.match(/[A-Z]+/)?.[0] || "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export async function normalizeTableFile(file: File, extension: string) {
  if (extension === "csv") {
    const csv = new TextDecoder("utf-8").decode(await file.arrayBuffer());
    return csv.replace(/^\uFEFF/, "").slice(0, 1_500_000);
  }

  const entries = await unzipEntries(
    new Uint8Array(await file.arrayBuffer()),
    (name) => name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
  );
  const sharedStrings = textNodes(entries.get("xl/sharedStrings.xml") || "");
  const sheets = [...entries.entries()].filter(([name]) => name.startsWith("xl/worksheets/")).sort();
  if (sheets.length === 0) throw new Error("XLSX에서 워크시트를 찾을 수 없습니다.");

  const output: string[] = [];
  for (const [name, xml] of sheets) {
    output.push(`## ${name.replace("xl/worksheets/", "").replace(".xml", "")}`);
    for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const ref = attrs.match(/\br="([^"]+)"/)?.[1] || "A1";
        const type = attrs.match(/\bt="([^"]+)"/)?.[1];
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? textNodes(body).join("");
        const value = type === "s" ? sharedStrings[Number(raw)] ?? raw : decodeXml(raw);
        row[columnIndex(ref)] = value.replace(/\s+/g, " ").trim();
      }
      if (row.some(Boolean)) output.push(row.map((value) => value || "").join(" | "));
      if (output.join("\n").length > 1_500_000) return output.join("\n").slice(0, 1_500_000);
    }
  }
  return output.join("\n");
}
