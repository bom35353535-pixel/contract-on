import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { QuotationReview } from "@/components/QuotationReview";
import { listContracts } from "@/lib/contracts";
import { normalizeQuotationExtraction, type QuotationExtraction } from "@/lib/estimate";
import { listKnowledgeDocuments } from "@/lib/knowledge";
import { getLatestQuotationReviewByAnalysis, getQuotationAnalysis } from "@/lib/quotations";
import { loadRegisteredAuditCases } from "@/lib/audit-case-source";

export const dynamic = "force-dynamic";

export default async function QuotationReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, contracts, review, knowledgeDocuments] = await Promise.all([
    getQuotationAnalysis(id), listContracts(), getLatestQuotationReviewByAnalysis(id), listKnowledgeDocuments(),
  ]);
  if (!record) notFound();
  const extracted = (() => {
    try { return normalizeQuotationExtraction(JSON.parse(record.analysis.extractionJson)); }
    catch { return normalizeQuotationExtraction(null); }
  })();
  const initial: QuotationExtraction = {
    projectName: record.analysis.projectName, constructionType: record.analysis.constructionType,
    purpose: record.analysis.purpose, location: record.analysis.location, companyName: record.analysis.companyName,
    businessRegistrationNumber: record.analysis.businessRegistrationNumber,
    supplierPhoneNumber: extracted.supplierPhoneNumber,
    quotationDate: record.analysis.quotationDate, totalAmount: record.analysis.totalAmount,
    supplyAmount: record.analysis.supplyAmount, vatAmount: record.analysis.vatAmount,
    materialCost: record.analysis.materialCost, directLaborCost: record.analysis.directLaborCost,
    indirectLaborCost: record.analysis.indirectLaborCost, expenses: record.analysis.expenses,
    statutoryExpenses: record.analysis.statutoryExpenses, overhead: record.analysis.overhead,
    profit: record.analysis.profit, safetyHealthCost: record.analysis.safetyHealthCost,
    plannedStartDate: record.analysis.plannedStartDate, plannedCompletionDate: record.analysis.plannedCompletionDate,
    items: record.items.map((item) => ({ category: item.category, trade: item.trade, itemName: item.itemName, specification: item.specification, unit: item.unit, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.amount, sourceText: item.sourceText })),
  };
  const knowledgeReadyCount = knowledgeDocuments.filter((document) => document.status === "READY").length;
  const knowledgePendingCount = knowledgeDocuments.filter((document) => document.status !== "READY").length;
  const rateReferenceDocument = knowledgeDocuments.find((document) => {
    const name = `${document.documentName} ${document.originalName}`;
    return name.includes("건축공사") && name.includes("간접공사비") && document.originalName.toLowerCase().endsWith(".md");
  }) ?? null;
  let rateReferenceText: string | null = null;
  if (rateReferenceDocument) {
    try {
      const stored = await env.FILES.get(rateReferenceDocument.storageKey);
      rateReferenceText = stored ? await stored.text() : null;
    } catch {
      rateReferenceText = null;
    }
  }
  const auditLibrary = await loadRegisteredAuditCases(knowledgeDocuments);
  return <AppShell active="home" contractCount={contracts.length}><a className="back-link" href="/">← 새 견적서 선택으로</a><QuotationReview
    analysisId={id}
    originalName={record.analysis.originalName}
    initial={initial}
    confirmedContractId={record.analysis.contractId}
    review={review}
    knowledgeReadyCount={knowledgeReadyCount}
    knowledgePendingCount={knowledgePendingCount}
    rateReferenceDocumentName={rateReferenceDocument?.documentName ?? null}
    rateReferenceText={rateReferenceText}
    auditCases={auditLibrary.cases}
    auditSourceStatus={auditLibrary.status}
  /></AppShell>;
}
