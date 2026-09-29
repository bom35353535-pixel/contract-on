import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { unzipSync } from "fflate";

test("Phase 8 requires user confirmation before scheduling warranty inspections", async () => {
  const source = await readFile(new URL("../lib/warranty.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/Phase8WarrantyWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /contract\.stage !== "FINISHED"/);
  assert.match(source, /calculateWarrantyEnd\(startDate, criterion\.warrantyYears\)/);
  assert.match(source, /addMonths\(startDate, n \* 6\)/);
  assert.match(component, /기준으로 확정하시겠습니까/);
  assert.doesNotMatch(component, /window\.confirm/);
  assert.match(component, /자동 확정하지 않습니다/);
  assert.doesNotMatch(component, /<select[^>]*disabled=\{!canConfirm\}/);
  assert.doesNotMatch(component, /type="date"[^>]*disabled=\{!canConfirm\}/);
  assert.match(component, /최종 확정은 검사검수·대금지급을 거쳐 공사완료 처리한 후 가능합니다/);
});

test("Phase 8 stores source-backed warranty criteria and D-Day schedules", async () => {
  const init = await readFile(new URL("../db/init.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0008_red_meggan.sql", import.meta.url), "utf8");
  assert.match(init, /하자기간\.pdf/);
  assert.match(init, /'p\.155'/);
  assert.match(migration, /CREATE TABLE `warranty_criteria`/);
  assert.match(migration, /CREATE TABLE `warranty_inspections`/);
});

test("Phase 8 prioritizes the specific interior work criterion over the broad building category", async () => {
  const { suggestWarrantyCriterion } = await import(new URL("../lib/warranty-selection.ts", import.meta.url).href);
  const criteria = [
    { id:"W03", category:"건축", workName:"건축물의 기둥·내력벽 등 주요 구조부", warrantyYears:5, bondRate:.03, sourceName:"하자기간.pdf", sourcePage:"p.155", sourceExcerpt:"" },
    { id:"W06", category:"건축·설비", workName:"실내의장·미장·타일·도장·창호·보링·기타 건물 내 설비·건축물 조립·판금·보일러 설치·기타 토목공사", warrantyYears:1, bondRate:.03, sourceName:"하자기간.pdf", sourcePage:"p.155", sourceExcerpt:"" },
  ];
  assert.equal(suggestWarrantyCriterion(criteria, "교실 내부 도장공사", "건축공사")?.id, "W06");
  assert.equal(suggestWarrantyCriterion(criteria, "00과 환경개선 공사", "건축공사")?.id, "W06");
  assert.equal(suggestWarrantyCriterion(criteria, "본관 내력벽 보강공사", "건축공사")?.id, "W03");
});

test("Phase 8 replaces a stale structural criterion and allows an existing warranty to be corrected", async () => {
  const component = await readFile(new URL("../components/Phase8WarrantyWorkspace.tsx", import.meta.url), "utf8");
  assert.match(component, /storedCriterionId==="W03"&&suggested\?\.id==="W06"/);
  assert.match(component, /currentStage==="FINISHED"\|\|!!warranty/);
  assert.match(component, /실내의장·마감공사 기준/);
});

test("Phase 8 confirmation action is presented as a clear primary button", async () => {
  const component = await readFile(new URL("../components/Phase8WarrantyWorkspace.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /className="primary-action"/);
  assert.match(css, /\.primary-action \{[^}]*background:var\(--green\)/);
  assert.match(css, /\.primary-action:disabled/);
});

test("Phase 8 ledger templates retain their VBA projects", async () => {
  for (const name of ["공사대장.xlsm", "하자대장.xlsm"]) {
    const bytes = await readFile(new URL(`../public/templates/${name}`, import.meta.url));
    const archive = unzipSync(bytes);
    assert.ok(archive["xl/vbaProject.bin"], `${name} VBA project missing`);
  }
});

test("Phase 8 ledger export writes current contract data and shows only the requested ledger", async () => {
  const { fillLedgerTemplate } = await import(new URL("../lib/xlsm-template.ts", import.meta.url).href);
  const template = await readFile(new URL("../public/templates/공사대장.xlsm", import.meta.url));
  const input = template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength);
  const output = await fillLedgerTemplate(input, {
    id: "CTR-TEST-001", projectName: "테스트 전기공사", companyName: "테스트전기 주식회사", constructionType: "전기공사",
    location: "본관", contractAmount: 22_000_000, contractMethod: "나라장터 전자계약", contractDate: "2026-09-01",
    plannedStartDate: "2026-09-02", actualStartDate: "2026-09-02", plannedCompletionDate: "2026-09-20",
    actualCompletionDate: "2026-09-20", inspectionDate: "2026-09-21", paymentDate: "2026-09-25",
  }, { warrantyStartDate: "2026-09-21", warrantyEndDate: "2027-09-20", warrantyYears: 1, bondRate: 0.03 }, "construction");
  const archive = unzipSync(output);
  const workbook = new TextDecoder().decode(archive["xl/workbook.xml"]);
  const ledger = new TextDecoder().decode(archive["xl/worksheets/sheet39.xml"]);
  assert.match(workbook, /<sheet name="32\.공사대장"[^>]*r:id="rId39"\/>/);
  assert.equal((workbook.match(/state="veryHidden"/g) || []).length, 46);
  assert.match(ledger, /<c r="B3"[^>]*t="inlineStr"><is><t>테스트 전기공사<\/t><\/is><\/c>/);
  assert.match(ledger, /<c r="I3"[^>]*t="inlineStr"><is><t>테스트전기 주식회사<\/t><\/is><\/c>/);
  assert.match(ledger, /<c r="J20"[^>]*><v>22000000<\/v><\/c>/);
  assert.match(ledger, /<c r="L20"[^>]*><f>MAX\(B6-SUM\(J16:J20\),0\)<\/f><v>0<\/v><\/c>/);
  assert.match(ledger, /<c r="D15"[^>]*t="inlineStr"><is><t>\[확인 필요\]<\/t><\/is><\/c>/);
  assert.doesNotMatch(ledger, /○○초 돌봄교실 설치공사|○○건설/);
});

test("Phase 8 ledger export loads templates from the deployed asset binding", async () => {
  const route = await readFile(new URL("../app/api/contracts/[id]/ledger/[kind]/route.ts", import.meta.url), "utf8");
  assert.match(route, /env\.ASSETS\.fetch\(new Request\(templateUrl\)\)/);
  assert.doesNotMatch(route, /await fetch\(new URL\(`\/templates/);
});

test("Phase 8 ledger export leaves unknown facts explicit", async () => {
  const source = await readFile(new URL("../lib/xlsm-template.ts", import.meta.url), "utf8");
  assert.match(source, /showOnlySheet/);
  assert.match(source, /state="veryHidden"/);
  assert.match(source, /"32\.공사대장" : "34\.하자대장"/);
  assert.match(source, /B3: String\(contract\.projectName\)/);
  assert.match(source, /B7: String\(contract\.companyName\)/);
  assert.match(source, /E31:\{ formula:"EDATE\(E30,E33\*12\)-1"/);
  assert.match(source, /E35:\{ formula:"ROUNDDOWN\(\(C27\*E34\),-1\)"/);
});
