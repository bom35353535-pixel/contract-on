import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the header uses the Gongchaek product name", () => {
  assert.match(read("components/AppShell.tsx"), /공책! 공사계약 통합지원/);
  assert.match(read("app/layout.tsx"), /공책! AI 공사계약 통합지원/);
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
