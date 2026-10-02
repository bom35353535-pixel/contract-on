import { NextResponse } from "next/server";
import { completeWarrantyInspection, confirmWarranty } from "@/lib/warranty";
export const runtime = "edge";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; const body = await request.json() as { action?: string; criterionId?: string; startDate?: string; guaranteeMethod?: string; inspectionId?: number };
    if (body.action === "confirm") return NextResponse.json(await confirmWarranty(id, body.criterionId ?? "", body.startDate ?? "", body.guaranteeMethod ?? ""));
    if (body.action === "complete-inspection") { await completeWarrantyInspection(id, Number(body.inspectionId)); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "하자관리 정보를 저장하지 못했습니다." }, { status: 400 }); }
}
