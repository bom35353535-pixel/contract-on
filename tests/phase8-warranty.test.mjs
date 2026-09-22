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

test("Phase 8 ledger templates retain their VBA projects", async () => {
  for (const name of ["공사대장.xlsm", "하자대장.xlsm"]) {
    const bytes = await readFile(new URL(`../public/templates/${name}`, import.meta.url));
    const archive = unzipSync(bytes);
    assert.ok(archive["xl/vbaProject.bin"], `${name} VBA project missing`);
  }
});

test("Phase 8 ledger export leaves unknown facts explicit", async () => {
  const source = await readFile(new URL("../lib/xlsm-template.ts", import.meta.url), "utf8");
  assert.match(source, /E20:"\[확인 필요\]"/);
  assert.match(source, /E31:\{ formula:"EDATE\(E30,E33\*12\)-1"/);
  assert.match(source, /E35:\{ formula:"ROUNDDOWN\(\(C27\*E34\),-1\)"/);
});
