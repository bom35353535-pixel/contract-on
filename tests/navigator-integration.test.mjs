import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Seoul Education navigator is a top menu immediately after AI assistant", async () => {
  const shell = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  const assistant = shell.indexOf("AI 업무비서");
  const navigator = shell.indexOf("서울교육 사이트 찾기");
  assert.ok(assistant >= 0 && navigator > assistant);
  assert.match(shell, /href="\/navigator"/);
});

test("navigator uses the complete supplied site data and working discovery controls", async () => {
  const component = await readFile(new URL("../components/SeoulEdNavigator.tsx", import.meta.url), "utf8");
  const sites = JSON.parse(await readFile(new URL("../public/navigator-data/sites.json", import.meta.url), "utf8"));
  const categories = JSON.parse(await readFile(new URL("../public/navigator-data/categories.json", import.meta.url), "utf8"));
  assert.ok(sites.length >= 90);
  assert.ok(categories.length >= 10);
  assert.match(component, /내 업무 분석하기/);
  assert.match(component, /업무지도/);
  assert.match(component, /즐겨찾기/);
  assert.match(component, /최근 사용한 사이트/);
  assert.match(component, /navigator-data\/sites\.json/);
  assert.match(component, /sen-map-lines/);
  assert.match(component, /x2=\{category\.x\}/);
  assert.match(component, /left: `\$\{category\.x\}%`/);
});
