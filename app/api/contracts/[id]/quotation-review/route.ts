import { ensureDatabase } from "@/db/init";
import { performQuotationReview } from "@/lib/run-quotation-review";
import { getQuotationByContract } from "@/lib/quotations";

export const runtime = "edge";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id: contractId } = await context.params;
  const quotation = await getQuotationByContract(contractId);
  if (!quotation) return Response.json({ error: "확정된 견적정보가 없어 검토를 실행할 수 없습니다." }, { status: 404 });

  const result = await performQuotationReview(quotation, contractId);
  return Response.json(result, { status: 201 });
}
