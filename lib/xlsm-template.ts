import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

type CellValue = string | number | null | { formula: string; cached: number };
const XML_ESCAPE: Record<string,string> = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" };
function escapeXml(value: string) { return value.replace(/[&<>"']/g, (c) => XML_ESCAPE[c]); }
function excelSerial(value: string | null) { if (!value) return null; return Math.floor((Date.parse(`${value}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000); }
function patchCell(xml: string, ref: string, value: CellValue) {
  const cellRe = new RegExp(`<c\\b([^>]*?\\br="${ref}"[^>]*?)\\s*(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  const match = xml.match(cellRe); if (!match) return xml;
  let attrs = match[1].replace(/\s+t="[^"]*"/g, ""); let body = "";
  if (typeof value === "string") { attrs += ' t="inlineStr"'; body = `<is><t>${escapeXml(value)}</t></is>`; }
  else if (typeof value === "number") body = `<v>${value}</v>`;
  else if (value && typeof value === "object") body = `<f>${escapeXml(value.formula)}</f><v>${value.cached}</v>`;
  return xml.replace(cellRe, `<c${attrs}>${body}</c>`);
}

function numericCellValue(xml: string, ref: string) {
  const match = xml.match(new RegExp(`<c\\b[^>]*?\\br="${ref}"[^>]*>[\\s\\S]*?<v>(-?[0-9.]+)<\\/v>[\\s\\S]*?<\\/c>`));
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

function purposeLines(value: unknown, maxLength = 28) {
  const text = String(value ?? "").trim();
  if (!text) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maxLength) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function sheetPathByName(files: Record<string, Uint8Array>, sheetName: string) {
  const workbook = strFromU8(files["xl/workbook.xml"]); const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const sheet = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)].find((m) => m[1] === sheetName);
  if (!sheet) throw new Error(`원본에서 ${sheetName} 시트를 찾을 수 없습니다.`);
  const rel = [...rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)].find((m) => m[1] === sheet[2]);
  if (!rel) throw new Error("원본 시트 연결정보를 찾을 수 없습니다.");
  return `xl/${rel[2].replace(/^\//, "").replace(/^xl\//, "")}`;
}

function showOnlySheet(workbookXml: string, targetName: string) {
  const sheets = [...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*\/>/g)];
  const activeTab = sheets.findIndex((match) => match[1] === targetName);
  if (activeTab < 0) throw new Error(`원본에서 ${targetName} 시트를 찾을 수 없습니다.`);
  let xml = workbookXml.replace(/<sheet\b[^>]*name="([^"]+)"[^>]*\/>/g, (sheet, name: string) => {
    const withoutState = sheet.replace(/\s+state="[^"]*"/g, "");
    return name === targetName ? withoutState : withoutState.replace(/\/>$/, ' state="veryHidden"/>');
  });
  xml = xml.replace(/<workbookView\b([^>]*)\/>/, (_match, attrs: string) => {
    const updated = attrs.replace(/\s+(?:activeTab|firstSheet)="[^"]*"/g, "");
    return `<workbookView${updated} activeTab="${activeTab}" firstSheet="${activeTab}"/>`;
  });
  return xml;
}

export async function fillLedgerTemplate(template: ArrayBuffer, contract: Record<string, unknown>, warranty: Record<string, unknown>, kind: "construction" | "warranty") {
  const files = unzipSync(new Uint8Array(template)); const inputPath = sheetPathByName(files, "2.데이터입력"); let xml = strFromU8(files[inputPath]);
  const templateContractGuaranteeRate = numericCellValue(xml, "E28");
  const clearRefs = ["C9","C10","C11","C12","C13","C14","C15","E9","E10","E11","E12","E13","E14","E15","C19","E19","C20","E20","C21","E21","C22","E22","C23","E23","C24","E24","C27","C28","C29","C30","C31","C32","C33","C34","C35","C36","C37","C38","E28","E29","E30","E32","E33","E34","E36","E37","E38"];
  for (const ref of clearRefs) xml = patchCell(xml, ref, null);
  const start = String(warranty.warrantyStartDate); const end = String(warranty.warrantyEndDate); const years = Number(warranty.warrantyYears); const rate = warranty.bondRate == null ? 0 : Number(warranty.bondRate); const amount = Number(contract.contractAmount);
  const contractGuaranteeRate = typeof contract.contractGuaranteeRate === "number" && Number.isFinite(contract.contractGuaranteeRate)
    ? contract.contractGuaranteeRate
    : templateContractGuaranteeRate;
  const contractGuaranteeAmount = contractGuaranteeRate === null ? null : Math.floor((amount * contractGuaranteeRate) / 10) * 10;
  const values: Record<string, CellValue> = {
    C9:String(contract.projectName), C14:String(contract.location ?? ""), C19:String(contract.companyName), C20:contract.supplierPhoneNumber ? String(contract.supplierPhoneNumber) : null, C21:String(contract.constructionType), C22:contract.businessRegistrationNumber ? String(contract.businessRegistrationNumber) : null, C27:amount,
    E10:"학교교육여건개선시설", E11:"교육환경개선시설", E12:"학교시설교육환경개선", E13:"학교회계전출금", E14:"시설비",
    C28:excelSerial(contract.contractDate as string | null), C29:excelSerial(contract.plannedStartDate as string | null), C30:excelSerial(contract.actualStartDate as string | null), C31:excelSerial(contract.plannedCompletionDate as string | null), C32:excelSerial(contract.actualCompletionDate as string | null), C33:excelSerial(contract.inspectionDate as string | null), C34:amount, C35:String(contract.id), C36:excelSerial(contract.paymentDate as string | null),
    E27:contractGuaranteeAmount === null ? "[확인 필요]" : { formula:"ROUNDDOWN((C27*E28),-1)", cached:contractGuaranteeAmount }, E28:contractGuaranteeRate, E30:excelSerial(start), E31:{ formula:"EDATE(E30,E33*12)-1", cached:excelSerial(end) ?? 0 }, E33:years, E34:rate,
    E35:{ formula:"ROUNDDOWN((C27*E34),-1)", cached:Math.floor((amount * rate) / 10) * 10 }, E36:warranty.guaranteeMethod ? String(warranty.guaranteeMethod) : "[확인 필요]", E37:contract.contractMethod ? String(contract.contractMethod) : null, E38:"[확인 필요]",
  };
  for (const [ref, value] of Object.entries(values)) if (value !== null) xml = patchCell(xml, ref, value);
  files[inputPath] = strToU8(xml);

  const targetName = kind === "construction" ? "32.공사대장" : "34.하자대장";
  const targetPath = sheetPathByName(files, targetName);
  let targetXml = strFromU8(files[targetPath]);
  const constructionPurpose = purposeLines(contract.purpose);
  const targetValues: Record<string, CellValue> = kind === "construction" ? {
    L2: contract.contractDate ? `${String(contract.contractDate).slice(0, 4)}년-` : null,
    M2: String(contract.id), B3: String(contract.projectName), I3: String(contract.companyName), M3: "행정실장\n000",
    B4: amount, G4: contract.contractMethod ? String(contract.contractMethod) : null, I4: contract.supplierPhoneNumber ? String(contract.supplierPhoneNumber) : "[확인 필요]", B6: amount,
    I6: excelSerial(contract.contractDate as string | null), I8: null, I9: null, I10: null, I11: null, I12: null, H14: null,
    B11: constructionPurpose[0] ?? "[확인 필요]", B12: constructionPurpose[1] ?? null, B13: constructionPurpose[2] ?? null, B14: constructionPurpose[3] ?? null,
    C15: contractGuaranteeAmount === null ? "[확인 필요]" : contractGuaranteeAmount, E15: "[확인 필요]", D18: excelSerial(contract.plannedStartDate as string | null), E18: excelSerial(contract.actualStartDate as string | null),
    D19: excelSerial(contract.plannedCompletionDate as string | null), E19: excelSerial(contract.actualCompletionDate as string | null),
    I20: excelSerial(contract.paymentDate as string | null), J20: amount, L20: { formula:"MAX(B6-SUM(J16:J20),0)", cached:0 }, D21: amount, E22: excelSerial(start), E23: excelSerial(end),
    D25: Math.floor((amount * rate) / 10) * 10, D26: null, I26: excelSerial(contract.inspectionDate as string | null),
  } : {
    B4: String(contract.projectName), E4: amount, K4: Math.floor((amount * rate) / 10) * 10, K5: warranty.guaranteeMethod ? String(warranty.guaranteeMethod) : "[확인 필요]",
    B6: null, E6: excelSerial(contract.contractDate as string | null), K6: excelSerial(contract.plannedCompletionDate as string | null),
    B7: String(contract.companyName), E7: excelSerial(contract.actualStartDate as string | null), K7: excelSerial(contract.actualCompletionDate as string | null),
    B8: null, E8: excelSerial(contract.inspectionDate as string | null), M8: excelSerial(start), M9: excelSerial(end),
  };
  for (const [ref, value] of Object.entries(targetValues)) targetXml = patchCell(targetXml, ref, value);
  targetXml = targetXml.replace(/<sheetView\b([^>]*)>/, (_match, attrs: string) => `<sheetView${attrs.replace(/\s+tabSelected="[^"]*"/g, "")} tabSelected="1">`);
  files[targetPath] = strToU8(targetXml);

  const workbookXml = showOnlySheet(strFromU8(files["xl/workbook.xml"]), targetName).replace(/<calcPr\b[^>]*\/>/, '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');
  files["xl/workbook.xml"] = strToU8(workbookXml);
  return zipSync(files, { level: 6 });
}
