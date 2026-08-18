import { advanceContractStage } from "@/lib/contracts";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const transition = await advanceContractStage(id);
    return Response.json({ transition });
  } catch (error) {
    const message = error instanceof Error ? error.message : "단계를 변경하지 못했습니다.";
    return Response.json({ error: message }, { status: message.includes("찾을 수") ? 404 : 409 });
  }
}
