import { strToU8, zipSync } from "fflate";
import type { UtilityAmountBand, UtilityCostKind, UtilityDuration, UtilityTrade } from "./utility-cost";

type UtilityWorkbookInput = {
  projectName: string;
  kind: UtilityCostKind;
  trade: UtilityTrade;
  duration: UtilityDuration;
  amountBand: UtilityAmountBand | null;
  amountExVat: number;
  directMaterial: number;
  directLabor: number;
  electricity: { amount: number; rates: { trade: number; duration: number; amount: number } | null } | null;
  water: { amount: number; rates: { trade: number; duration: number; amount: number } | null } | null;
  total: number | null;
};

const RATE_TABLE = {
  electricity: ["전력비", .515, .346, .163, .370, .175, .212, .505, .715, .132, .176, .269, .448, .506] as const,
  water: ["수도광열비", .479, .597, .422, .360, .232, .410, .509, .596, .154, .199, .331, .611, .726] as const,
};

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function textCell(ref: string, value: string, style = 0) {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t${/^\s|\s$|\n/.test(value) ? ' xml:space="preserve"' : ""}>${xml(value)}</t></is></c>`;
}

function numberCell(ref: string, value: number, style = 7) {
  return `<c r="${ref}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
}

function formulaCell(ref: string, formula: string, cached: number, style = 7) {
  return `<c r="${ref}" s="${style}"><f>${xml(formula)}</f><v>${cached}</v></c>`;
}

function row(index: number, cells: string[], height?: number) {
  return `<row r="${index}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cells.join("")}</row>`;
}

function rateCells(rowNumber: number, values: readonly [string, ...number[]]) {
  const refs = ["A", "B", "C", "D", "F", "H", "J", "L", "N", "P", "R", "T", "U", "V"];
  return refs.map((col, index) => index === 0 ? textCell(`${col}${rowNumber}`, String(values[index]), 5) : numberCell(`${col}${rowNumber}`, Number(values[index]), 8));
}

const tradeLabel: Record<UtilityTrade, string> = { BUILDING: "건축", CIVIL: "토목", INDUSTRIAL: "산업설비", LANDSCAPE: "조경" };
const durationLabel: Record<UtilityDuration, string> = { UP_TO_6: "6개월 이하", UP_TO_12: "6개월 초과 12개월 이하", UP_TO_36: "12개월 초과 36개월 이하", OVER_36: "36개월 초과" };
const kindLabel: Record<UtilityCostKind, string> = { BOTH: "수도광열비·전력비", ELECTRICITY: "전력비", WATER: "수도광열비" };

export function buildUtilityCostWorkbook(input: UtilityWorkbookInput) {
  const materialThousands = Math.floor(Math.max(0, input.directMaterial) / 1_000);
  const laborThousands = Math.floor(Math.max(0, input.directLabor) / 1_000);
  const contractThousands = Math.floor(Math.max(0, input.amountExVat) / 1_000);
  const electricity = input.electricity?.amount ?? 0;
  const water = input.water?.amount ?? 0;
  const eRates = input.electricity?.rates ?? { trade: 0, duration: 0, amount: 0 };
  const wRates = input.water?.rates ?? { trade: 0, duration: 0, amount: 0 };

  const rows = [
    row(2, [textCell("A2", "[공사명]", 1), textCell("C2", input.projectName, 6)], 24),
    row(4, [textCell("A4", "□ 2024년도 기준 완성공사 원가통계(경비율)", 2), textCell("V4", "(단위: %)", 0)], 22),
    row(6, [textCell("A6", "구분", 3), textCell("B6", "공사종류별", 3), textCell("H6", "공사기간별", 3), textCell("P6", "공사규모별", 3)], 22),
    row(7, [textCell("B7", "건축", 4), textCell("C7", "토목", 4), textCell("D7", "산업설비", 4), textCell("F7", "조경", 4), textCell("H7", "6개월 이하", 4), textCell("J7", "6개월 초과\n12개월 이하", 4), textCell("L7", "12개월 초과\n36개월 이하", 4), textCell("N7", "36개월 초과", 4), textCell("P7", "5억 미만", 4), textCell("R7", "5~30억\n미만", 4), textCell("T7", "30~50억\n미만", 4), textCell("U7", "50~300억\n미만", 4), textCell("V7", "300~1,000억\n미만", 4)], 36),
    row(8, rateCells(8, RATE_TABLE.electricity), 22),
    row(9, rateCells(9, RATE_TABLE.water), 22),
    row(10, [textCell("A10", "※ 공사종류에서 전기·통신·소방·전문공사는 건축요율 적용", 0)]),
    row(11, [textCell("A11", "※ 공사규모 금액은 공사 계약금액 기준(부가세 제외), 계약내역서상 직접재료비·직접노무비 기준", 0)]),
    row(12, [textCell("A12", "※ 출처: 대한건설협회 '2024년 완성공사원가분석' (2025. 9. 발표)", 0)]),
    row(14, [textCell("A14", "□ 전력비·수도광열비 계산식", 2)], 22),
    row(16, [textCell("A16", "전력비·수도광열비 산출내역", 3)], 22),
    row(17, [textCell("A17", "공사내용 기입", 5), textCell("D17", "공사종류", 5), textCell("F17", tradeLabel[input.trade], 6), textCell("J17", "공사기간", 5), textCell("L17", durationLabel[input.duration], 6), textCell("P17", "시설사용", 5), textCell("R17", kindLabel[input.kind], 6)], 24),
    row(18, [textCell("D18", "계약금액", 5), numberCell("F18", contractThousands, 6), textCell("H18", "천원", 5), textCell("J18", "직접재료비", 5), numberCell("L18", materialThousands, 6), textCell("N18", "천원", 5), textCell("P18", "직접노무비", 5), numberCell("R18", laborThousands, 6), textCell("T18", "천원", 5)], 24),
    row(21, [textCell("A21", "1. 전력비", 2), textCell("C21", "직접재료비", 5), textCell("E21", "직접노무비", 5), textCell("I21", "공사종류 요율", 5), textCell("L21", "공사기간 요율", 5), textCell("O21", "공사규모 요율", 5), textCell("T21", "산출금액", 5)], 22),
    row(23, [numberCell("C23", input.kind === "WATER" ? 0 : materialThousands), numberCell("E23", input.kind === "WATER" ? 0 : laborThousands), numberCell("I23", eRates.trade / 100, 8), numberCell("L23", eRates.duration / 100, 8), numberCell("O23", eRates.amount / 100, 8), formulaCell("T23", "ROUNDDOWN(((C23+E23)*1000)*(I23+L23+O23)/3,-1)", electricity), textCell("V23", "원", 5)], 24),
    row(25, [textCell("A25", "2. 수도광열비", 2), textCell("C25", "직접재료비", 5), textCell("E25", "직접노무비", 5), textCell("I25", "공사종류 요율", 5), textCell("L25", "공사기간 요율", 5), textCell("O25", "공사규모 요율", 5), textCell("T25", "산출금액", 5)], 22),
    row(27, [numberCell("C27", input.kind === "ELECTRICITY" ? 0 : materialThousands), numberCell("E27", input.kind === "ELECTRICITY" ? 0 : laborThousands), numberCell("I27", wRates.trade / 100, 8), numberCell("L27", wRates.duration / 100, 8), numberCell("O27", wRates.amount / 100, 8), formulaCell("T27", "ROUNDDOWN(((C27+E27)*1000)*(I27+L27+O27)/3,-1)", water), textCell("V27", "원", 5)], 24),
    row(29, [textCell("Q29", "합 계", 10), formulaCell("T29", "T23+T27", input.total ?? electricity + water, 11), textCell("V29", "원", 10)], 25),
  ].join("");

  const merges = ["C2:V2", "B6:G6", "H6:O6", "P6:V6", "D7:E7", "F7:G7", "H7:I7", "J7:K7", "L7:M7", "N7:O7", "P7:Q7", "R7:S7", "D8:E8", "F8:G8", "H8:I8", "J8:K8", "L8:M8", "N8:O8", "P8:Q8", "R8:S8", "D9:E9", "F9:G9", "H9:I9", "J9:K9", "L9:M9", "N9:O9", "P9:Q9", "R9:S9", "A16:V16", "A17:C18", "D17:E17", "F17:H17", "J17:K17", "L17:N17", "P17:Q17", "R17:T17", "D18:E18", "F18:G18", "H18:I18", "J18:K18", "L18:M18", "N18:O18", "P18:Q18", "R18:S18", "C21:D21", "E21:G21", "I21:J21", "L21:M21", "O21:P21", "T21:U21", "C23:D23", "E23:G23", "I23:J23", "L23:M23", "O23:P23", "T23:U23", "C25:D25", "E25:G25", "I25:J25", "L25:M25", "O25:P25", "T25:U25", "C27:D27", "E27:G27", "I27:J27", "L27:M27", "O27:P27", "T27:U27", "Q29:S29", "T29:U29"];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A2:V29"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="3" width="10" customWidth="1"/><col min="4" max="19" width="8" customWidth="1"/><col min="20" max="22" width="12" customWidth="1"/></cols><sheetData>${rows}</sheetData><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/></worksheet>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>전기수도료 산출내역</dc:title><dc:creator>계약ON</dc:creator></cp:coreProperties>`),
    "docProps/app.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>계약ON</Application></Properties>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="31.수도전기료계산식" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'31.수도전기료계산식'!$A$2:$V$29</definedName></definedNames><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,#0"/><numFmt numFmtId="165" formatCode="0.000%"/><numFmt numFmtId="166" formatCode="#,#0&quot;원&quot;"/></numFmts><fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="12"/><name val="Arial"/></font></fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2F8"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F5B44"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFB7C9D6"/></left><right style="thin"><color rgb="FFB7C9D6"/></right><top style="thin"><color rgb="FFB7C9D6"/></top><bottom style="thin"><color rgb="FFB7C9D6"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="166" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="166" fontId="2" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  };
  return zipSync(files, { level: 6 });
}
