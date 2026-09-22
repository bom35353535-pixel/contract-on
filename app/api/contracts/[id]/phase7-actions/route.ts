import { getD1 } from "@/db";
import { ensureDatabase } from "@/db/init";
import { advanceContractStage, completeContractPayment, completeUtilityNotice, finishContractAfterPayment, getContract } from "@/lib/contracts";
import { getConstructionChecklist } from "@/lib/construction-checklist";
import { getKoreanToday } from "@/lib/workflow";

export const runtime = "edge";

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id: contractId } = await context.params;
  const body = await request.json().catch(() => ({})) as { action?: unknown };
  const contract = await getContract(contractId);
  if (!contract) return errorResponse("계약 정보를 찾을 수 없습니다.", 404);
  try {
    if (body.action === "complete-construction") {
      if (contract.currentStage !== "IN_CONSTRUCTION") return errorResponse("현재 단계가 공사중이 아닙니다.", 409);
      const checklist = await getConstructionChecklist(contractId);
      if (!checklist.run) return errorResponse("먼저 등록자료 기준 공사중 확인사항을 불러와 결과를 확인해 주세요.", 409);
      return Response.json(await advanceContractStage(contractId, "phase7"));
    }
    if (body.action === "complete-inspection") {
      if (contract.currentStage !== "INSPECTION") return errorResponse("현재 단계가 검사검수가 아닙니다.", 409);
      if (contract.inspectionDate) return Response.json({ inspectionDate: contract.inspectionDate });
      const today = getKoreanToday();
      const now = new Date().toISOString();
      const result = await getD1().prepare(`UPDATE contracts SET inspection_date = ?, next_task = '수도광열비 안내공문 발송', attention = '에듀파인 검사·검수 완료를 확인했습니다. 수도광열비를 계산하고 안내공문을 발송해 주세요.', updated_at = ? WHERE id = ? AND current_stage = 'INSPECTION' AND inspection_date IS NULL`)
        .bind(today, now, contractId).run();
      if ((result.meta.changes ?? 0) !== 1) return errorResponse("검사·검수 완료일을 저장하지 못했습니다.", 409);
      await getD1().prepare("INSERT INTO contract_stage_history (contract_id, from_stage, to_stage, action, actor, occurred_at) VALUES (?, 'INSPECTION', 'INSPECTION', '에듀파인 검사·검수 완료', '담당자', ?)")
        .bind(contractId, now).run();
      return Response.json({ inspectionDate: today });
    }
    if (body.action === "complete-utility-notice") return Response.json(await completeUtilityNotice(contractId));
    if (body.action === "complete-payment") return Response.json(await completeContractPayment(contractId));
    if (body.action === "complete-finish") return Response.json(await finishContractAfterPayment(contractId));
    return errorResponse("처리할 업무를 확인해 주세요.");
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "업무를 완료하지 못했습니다.", 409);
  }
}
