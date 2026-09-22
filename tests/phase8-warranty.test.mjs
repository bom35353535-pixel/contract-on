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
