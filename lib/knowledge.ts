import { env } from "cloudflare:workers";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { knowledgeDocuments } from "@/db/schema";
export * from "./knowledge-constants";

export function isOpenAIConfigured() {
  return Boolean(env.OPENAI_API_KEY);
}

export async function listKnowledgeDocuments() {
  await ensureDatabase();
  return getDb().select().from(knowledgeDocuments).orderBy(desc(knowledgeDocuments.uploadedAt));
}
