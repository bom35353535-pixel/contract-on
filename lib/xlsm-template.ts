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

function inputSheetPath(files: Record<string, Uint8Array>) {
  const workbook = strFromU8(files["xl/workbook.xml"]); const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const sheet = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)].find((m) => m[1] === "2.데이터입력");
  if (!sheet) throw new Error("원본에서 데이터입력 시트를 찾을 수 없습니다.");
  const rel = [...rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)].find((m) => m[1] === sheet[2]);
  if (!rel) throw new Error("원본 시트 연결정보를 찾을 수 없습니다.");
  return `xl/${rel[2].replace(/^\//, "").replace(/^xl\//, "")}`;
}

export async function fillLedgerTemplate(template: ArrayBuffer, contract: Record<string, unknown>, warranty: Record<string, unknown>) {
  const files = unzipSync(new Uint8Array(template)); const sheetPath = inputSheetPath(files); let xml = strFromU8(files[sheetPath]);
  const clearRefs = ["C9","C10","C11","C12","C13","C14","C15","E9","E10","E11","E12","E13","E14","E15","C19","E19","C20","E20","C21","E21","C22","E22","C23","E23","C24","E24","C27","C28","C29","C30","C31","C32","C33","C34","C35","C36","C37","C38","E28","E29","E30","E32","E33","E34","E36","E37","E38"];
  for (const ref of clearRefs) xml = patchCell(xml, ref, null);
  const start = String(warranty.warrantyStartDate); const end = String(warranty.warrantyEndDate); const years = Number(warranty.warrantyYears); const rate = warranty.bondRate == null ? 0 : Number(warranty.bondRate); const amount = Number(contract.contractAmount);
  const values: Record<string, CellValue> = {
    C9:String(contract.projectName), C10:"[확인 필요]", C12:"[확인 필요]", C19:String(contract.companyName), E19:"[확인 필요]", C20:"[확인 필요]", E20:"[확인 필요]", C21:String(contract.constructionType), C27:amount,
    C28:excelSerial(contract.contractDate as string | null), C29:excelSerial(contract.plannedStartDate as string | null), C30:excelSerial(contract.actualStartDate as string | null), C31:excelSerial(contract.plannedCompletionDate as string | null), C32:excelSerial(contract.actualCompletionDate as string | null), C33:excelSerial(contract.inspectionDate as string | null), C35:String(contract.id), C36:excelSerial(contract.paymentDate as string | null),
    E27:{ formula:"ROUNDDOWN((C27*E28),-1)", cached:0 }, E30:excelSerial(start), E31:{ formula:"EDATE(E30,E33*12)-1", cached:excelSerial(end) ?? 0 }, E33:years, E34:rate,
    E35:{ formula:"ROUNDDOWN((C27*E34),-1)", cached:Math.floor((amount * rate) / 10) * 10 }, E36:"[확인 필요]", E37:contract.contractMethod ? String(contract.contractMethod) : null, E38:"[확인 필요]",
  };
  for (const [ref, value] of Object.entries(values)) if (value !== null) xml = patchCell(xml, ref, value);
  files[sheetPath] = strToU8(xml); files["xl/workbook.xml"] = strToU8(strFromU8(files["xl/workbook.xml"]).replace(/<calcPr\b[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>'));
  return zipSync(files, { level: 6 });
}
