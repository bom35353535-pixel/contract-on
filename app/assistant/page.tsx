import type { Metadata } from "next";
import { AiWorkAssistant } from "@/components/AiWorkAssistant";
import { AppShell } from "@/components/AppShell";
import { listContracts } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI 업무비서 | 계약ON",
  description: "전체 계약업무 흐름과 등록 지식자료 기반 AI 상담을 제공합니다.",
};

export default async function AssistantPage() {
  const contracts = await listContracts();
  return <AppShell active="assistant" contractCount={contracts.length}>
    <AiWorkAssistant />
  </AppShell>;
}
