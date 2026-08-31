import { NextResponse } from "next/server";
import { getContract } from "@/lib/contracts";
import { getWarrantyWorkspace } from "@/lib/warranty";
import { fillLedgerTemplate } from "@/lib/xlsm-template";
export const runtime = "edge";
export async function GET(request: Request, context: { params: Promise<{ id: string; kind: string }> }) {
  try { const { id, kind } = await context.params; if (!['construction','warranty'].includes(kind)) return NextResponse.json({ error:"지원하지 않는 대장입니다." }, { status:400 });
    const contract = await getContract(id); if (!contract) return NextResponse.json({ error:"계약 정보를 찾을 수 없습니다." }, { status:404 });
    const workspace = await getWarrantyWorkspace(id); if (!workspace.warranty) return NextResponse.json({ error:"먼저 하자기간을 확인·확정해 주세요." }, { status:409 });
    const sourceName = kind === 'construction' ? '공사대장.xlsm' : '하자대장.xlsm'; const template = await fetch(new URL(`/templates/${encodeURIComponent(sourceName)}`, request.url));
    if (!template.ok) throw new Error("대장 원본을 불러오지 못했습니다."); const bytes = await fillLedgerTemplate(await template.arrayBuffer(), contract as unknown as Record<string, unknown>, workspace.warranty);
    const safeProject = contract.projectName.replace(/[\\/:*?"<>|]/g, '_'); const fileName = `${safeProject}_${sourceName}`;
    return new Response(bytes, { headers:{ 'content-type':'application/vnd.ms-excel.sheet.macroEnabled.12', 'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`, 'cache-control':'no-store' } });
  } catch (error) { return NextResponse.json({ error:error instanceof Error ? error.message : "대장을 생성하지 못했습니다." }, { status:500 }); }
}
