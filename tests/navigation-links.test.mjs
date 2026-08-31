import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceFiles = [
  "app/page.tsx",
  "app/estimates/[id]/page.tsx",
  "app/contracts/page.tsx",
  "app/contracts/[id]/page.tsx",
  "components/AppShell.tsx",
  "components/QuotationReview.tsx",
  "components/UploadPanel.tsx",
];

test("internal navigation avoids the broken next/link runtime", async () => {
  const sources = await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")));

  for (const source of sources) {
    assert.doesNotMatch(source, /from ["']next\/link["']/);
    assert.doesNotMatch(source, /<\/?Link\b/);
  }
});

test("knowledge management links use browser-native navigation", async () => {
  const [shell, uploadPanel] = await Promise.all([
    readFile("components/AppShell.tsx", "utf8"),
    readFile("components/UploadPanel.tsx", "utf8"),
  ]);

  assert.match(shell, /<a[^>]+href="\/knowledge"/);
  assert.match(uploadPanel, /<a[^>]+href="\/knowledge"/);
});
