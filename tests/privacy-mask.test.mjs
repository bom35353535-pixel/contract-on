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
  assert.deepEqual(result.counts, { mobile: 1, email: 1, residentRegistration: 0, account: 0 });
});

test("browser mask does nothing when mobile numbers and emails are absent", async () => {
  const { maskPrivateText } = await import(maskingModule.href);
  const input = "공사명: 체육관 보수공사 / 사업자등록번호: 123-45-67890";
  const result = maskPrivateText(input);
  assert.equal(result.text, input);
  assert.deepEqual(result.counts, { mobile: 0, email: 0, residentRegistration: 0, account: 0 });
});

test("contract privacy mask covers representative registration and bank account numbers", async () => {
  const { maskPrivateText } = await import(maskingModule.href);
  const result = maskPrivateText("대표자 주민번호 900101-1234567 / 계좌번호 123-456-789012", { maskAccountNumbers: true });
  assert.equal(result.text, "대표자 주민번호 ******-******* / 계좌번호 ***-***-**9012");
  assert.equal(result.counts.residentRegistration, 1);
  assert.equal(result.counts.account, 1);
});

test("contract document UI blocks sensitive originals until masking or manual confirmation", async () => {
  const source = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /개인정보 자동 마스킹/);
  assert.match(source, /개인정보 마스킹을 완료하거나 이미 가린 사본임을 확인해 주세요/);
  assert.match(source, /privacyStates\[index\]\?\.file \?\? file/);
  assert.match(source, /form\.set\("privacyConfirmed", "true"\)/);
  assert.match(source, /const requiresPrivacyMask = isContract \|\| isCompletion/);
  assert.match(source, /준공서류/);
});

test("upload UI keeps selection local and sends the masked copy only after analyze", async () => {
  const source = await readFile(new URL("../components/UploadPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /setMaskResult\(null\)/);
  assert.match(source, /form\.set\("file", maskResult\?\.file \?\? file\)/);
  assert.doesNotMatch(source, /마스킹된 견적서 확인|previewOpen/);
  assert.equal((source.match(/fetch\("\/api\/estimates"/g) || []).length, 1);
  assert.ok(source.indexOf("async function analyze") < source.indexOf('fetch("/api/estimates"'));
});

test("PDF masking runs in the browser while legacy XLS remains unsupported", async () => {
  const source = await readFile(maskingModule, "utf8");
  assert.match(source, /extension === "\.pdf"/);
  assert.match(source, /redactPdfInBrowser/);
  assert.match(source, /extension === "\.xls"/);
  assert.doesNotMatch(source, /fetch\(|OpenAI|Vector Store|\/api\//);
});

test("PDF auto-redaction requires the user to inspect the generated copy", async () => {
  const source = await readFile(new URL("../components/Phase6DocumentWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /마스킹된 PDF 확인/);
  assert.match(source, /마스킹 결과를 확인했습니다/);
  assert.match(source, /"reviewed"/);
});
