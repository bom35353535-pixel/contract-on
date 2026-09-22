import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the header and metadata use the Contract ON product name", () => {
  const shell = read("components/AppShell.tsx");
  assert.match(shell, /className="brand-mark">계약ON<\/span>/);
  assert.match(shell, /<strong>AI기반 학교 공사계약 도우미<\/strong>/);
  assert.doesNotMatch(shell, /공[첵책]!/);
  assert.match(read("app/layout.tsx"), /계약ON \| AI기반 학교 공사계약 도우미/);
});

test("fixed sample contracts are removed and never seeded again", () => {
  const init = read("db/init.ts");
  assert.doesNotMatch(init, /SAMPLE_CONTRACTS|샘플 계약 생성/);
  assert.match(init, /DELETE FROM contracts WHERE id IN \('CTR-2026-001'/);
  assert.equal(fs.existsSync(new URL("../db/sample-data.ts", import.meta.url)), false);
});

test("privacy actions stay below the upload selector without legacy button offsets", () => {
  const panel = read("components/UploadPanel.tsx");
  const css = read("app/globals.css");
  assert.match(panel, /className="upload-workflow"[\s\S]*className=\{`drop-zone[\s\S]*className="privacy-mask-panel"/);
  assert.match(css, /\.privacy-mask-actions \.analysis-button \{[^}]*margin-top: 0/);
  assert.doesNotMatch(css, /\n\.analysis-button \{/);
  assert.doesNotMatch(panel, /마스킹된 견적서 확인|previewOpen/);
});
