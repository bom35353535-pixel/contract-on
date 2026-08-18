import { AppShell } from "@/components/AppShell";
import { KnowledgeManager } from "@/components/KnowledgeManager";
import { listContracts } from "@/lib/contracts";
import { isOpenAIConfigured, listKnowledgeDocuments } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const [contracts, documents] = await Promise.all([listContracts(), listKnowledgeDocuments()]);
  return (
    <AppShell active="knowledge" contractCount={contracts.length}>
      <KnowledgeManager
        initialDocuments={documents}
        configured={isOpenAIConfigured()}
      />
    </AppShell>
  );
}
