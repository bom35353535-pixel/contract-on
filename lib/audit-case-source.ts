import { env } from "cloudflare:workers";
import type { KnowledgeDocumentRecord } from "@/db/schema";
import { parseAuditCases } from "@/lib/audit-cases";

export const AUDIT_CASE_SOURCE_NAME = "공사계약 Q&A 및 사례연습(2025. 6.)_감사사례만.md";

function normalizedName(value: string) {
  return value.normalize("NFC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

export async function loadRegisteredAuditCases(documents: KnowledgeDocumentRecord[]) {
  const exact = normalizedName(AUDIT_CASE_SOURCE_NAME);
  const document = documents.find((item) => {
    const original = normalizedName(item.originalName);
    const display = normalizedName(item.documentName);
    return original === exact || (original.includes("공사계약q&a및사례연습") && original.includes("감사사례만") && original.endsWith(".md")) || (display.includes("공사계약q&a및사례연습") && display.includes("감사사례만"));
  });
  if (!document) return { status: "MISSING" as const, cases: [] };
  try {
    const stored = await env.FILES.get(document.storageKey);
    if (!stored) return { status: "MISSING" as const, cases: [] };
    const cases = parseAuditCases(await stored.text());
    return { status: cases.length ? "READY" as const : "INVALID" as const, cases };
  } catch {
    return { status: "INVALID" as const, cases: [] };
  }
}
