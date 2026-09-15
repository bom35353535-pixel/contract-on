import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const maskingModule = new URL("../lib/browser-privacy-mask.ts", import.meta.url);

test("browser mask covers supported Korean mobile number formats", async () => {
  const { maskPrivateText } = await import(maskingModule.href);
  const result = maskPrivateText("010-1234-5678, 01012345678, 011 123 4567");
  assert.equal(result.text, "010-****-5678, 010****5678, 011 *** 4567");
  assert.equal(result.counts.mobile, 3);
});

test("browser mask covers email while preserving its domain", async () => {
  const { maskPrivateText } = await import(maskingModule.href);
  const result = maskPrivateText("담당 abc123@example.com / 계약 contract.school@korea.kr");
  assert.equal(result.text, "담당 a***@example.com / 계약 c***@korea.kr");
  assert.equal(result.counts.email, 2);
});

test("browser mask handles both types and leaves unrelated contract data unchanged", async () => {
  const { maskPrivateText } = await import(maskingModule.href);
  const result = maskPrivateText("업체 가나다건설 사업자 123-45-67890 연락 010-2222-3333 a@b.co.kr 금액 1,200,000원");
  assert.equal(result.text, "업체 가나다건설 사업자 123-45-67890 연락 010-****-3333 a***@b.co.kr 금액 1,200,000원");
  assert.deepEqual(result.counts, { mobile: 1, email: 1 });
});

test("browser mask does nothing when mobile numbers and emails are absent", async () => {
  const { maskPrivateText } = await import(maskingModule.href);
  const input = "공사명: 체육관 보수공사 / 사업자등록번호: 123-45-67890";
  const result = maskPrivateText(input);
  assert.equal(result.text, input);
  assert.deepEqual(result.counts, { mobile: 0, email: 0 });
});

test("upload UI keeps selection local and sends the masked copy only after analyze", async () => {
  const source = await readFile(new URL("../components/UploadPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /setMaskResult\(null\)/);
  assert.match(source, /form\.set\("file", maskResult\?\.file \?\? file\)/);
  assert.match(source, /마스킹된 견적서 확인/);
  assert.match(source, /disabled=\{!maskResult/);
  assert.equal((source.match(/fetch\("\/api\/estimates"/g) || []).length, 1);
  assert.ok(source.indexOf("async function analyze") < source.indexOf('fetch("/api/estimates"'));
});

test("unsupported PDF and XLS masking never calls a server or external API", async () => {
  const source = await readFile(maskingModule, "utf8");
  assert.match(source, /extension === "\.pdf"/);
  assert.match(source, /extension === "\.xls"/);
  assert.doesNotMatch(source, /fetch\(|OpenAI|Vector Store|\/api\//);
});
