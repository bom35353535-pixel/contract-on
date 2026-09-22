import { env } from "cloudflare:workers";
import type { KnowledgeDocumentRecord } from "@/db/schema";

export const CONSTRUCTION_PLAN_SOURCE_NAME = "공사계약 Q&A 및 사례연습(2025. 6.)_공사계획수립 내부기안문.md";

function normalizedName(value: string) {
  return value.normalize("NFC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

export async function loadRegisteredConstructionPlanTemplate(documents: KnowledgeDocumentRecord[]) {
  const exact = normalizedName(CONSTRUCTION_PLAN_SOURCE_NAME);
  const document = documents.find((item) => {
    const original = normalizedName(item.originalName);
    const display = normalizedName(item.documentName);
    return original === exact
      || (original.includes("공사계약q&a및사례연습") && original.includes("공사계획수립내부기안문") && original.endsWith(".md"))
      || (display.includes("공사계약q&a및사례연습") && display.includes("공사계획수립내부기안문"));
  });
  if (!document) return { status: "MISSING" as const, text: "", documentName: null };
  try {
    const stored = await env.FILES.get(document.storageKey);
    if (!stored) return { status: "MISSING" as const, text: "", documentName: document.documentName };
    const text = await stored.text();
    return { status: text.trim() ? "READY" as const : "INVALID" as const, text, documentName: document.documentName };
  } catch {
    return { status: "INVALID" as const, text: "", documentName: document.documentName };
  }
}
