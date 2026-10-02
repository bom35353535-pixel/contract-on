import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getContract } from "@/lib/contracts";
import { getWarrantyWorkspace } from "@/lib/warranty";
import { getQuotationByContract } from "@/lib/quotations";
import { fillLedgerTemplate } from "@/lib/xlsm-template";
import { extractSupplierPhoneNumber, normalizeQuotationExtraction } from "@/lib/estimate";
import { fastSpreadsheetText } from "@/lib/openai-estimate";
export const runtime = "edge";
export async function GET(request: Request, context: { params: Promise<{ id: string; kind: string }> }) {
  try { const { id, kind } = await context.params; if (!['construction','warranty'].includes(kind)) return NextResponse.json({ error:"지원하지 않는 대장입니다." }, { status:400 });
    const contract = await getContract(id); if (!contract) return NextResponse.json({ error:"계약 정보를 찾을 수 없습니다." }, { status:404 });
    const quotation = await getQuotationByContract(id);
    const workspace = await getWarrantyWorkspace(id); if (!workspace.warranty) return NextResponse.json({ error:"먼저 하자기간을 확인·확정해 주세요." }, { status:409 });
    const sourceName = kind === 'construction' ? '공사대장.xlsm' : '하자대장.xlsm';
    const templateUrl = new URL(`/templates/${encodeURIComponent(sourceName)}`, request.url);
    const template = await env.ASSETS.fetch(new Request(templateUrl));
    if (!template.ok) throw new Error("대장 원본을 불러오지 못했습니다.");
    let supplierPhoneNumber: string | null = null;
    if (quotation) {
      try { supplierPhoneNumber = normalizeQuotationExtraction(JSON.parse(quotation.analysis.extractionJson)).supplierPhoneNumber; } catch { /* old analysis */ }
      if (!supplierPhoneNumber && /\.(xlsx|csv)$/i.test(quotation.analysis.originalName)) {
        const stored = await env.FILES.get(quotation.analysis.storageKey);
        if (stored) {
          const file = new File([await stored.arrayBuffer()], quotation.analysis.originalName, { type: stored.httpMetadata?.contentType || "application/octet-stream" });
          const text = await fastSpreadsheetText(file);
          if (text) supplierPhoneNumber = extractSupplierPhoneNumber(text);
        }
      }
    }
    const ledgerContract = { ...contract, businessRegistrationNumber: quotation?.analysis.businessRegistrationNumber ?? null, supplierPhoneNumber };
    const bytes = await fillLedgerTemplate(await template.arrayBuffer(), ledgerContract as unknown as Record<string, unknown>, workspace.warranty, kind as "construction" | "warranty");
    const safeProject = contract.projectName.replace(/[\\/:*?"<>|]/g, '_'); const fileName = `${safeProject}_${sourceName}`;
    return new Response(bytes, { headers:{ 'content-type':'application/vnd.ms-excel.sheet.macroEnabled.12', 'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`, 'cache-control':'no-store' } });
  } catch (error) { return NextResponse.json({ error:error instanceof Error ? error.message : "대장을 생성하지 못했습니다." }, { status:500 }); }
}
