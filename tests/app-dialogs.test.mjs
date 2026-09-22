import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(fullPath));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

test("all application popups avoid browser-native address-prefixed dialogs", async () => {
  const files = [...await sourceFiles("app"), ...await sourceFiles("components"), ...await sourceFiles("lib")];
  const sources = await Promise.all(files.map(async (file) => `${file}\n${await readFile(file, "utf8")}`));
  const combined = sources.join("\n");
  assert.doesNotMatch(combined, /\bwindow\.(?:alert|confirm|prompt)\s*\(/);
  assert.doesNotMatch(combined, /\bglobalThis\.(?:alert|confirm|prompt)\s*\(/);
  assert.match(await readFile("components/AppDialog.tsx", "utf8"), /action-confirm-dialog/);
});
