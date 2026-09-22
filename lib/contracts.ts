import { desc, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { ensureDatabase } from "@/db/init";
import { contracts, contractStageHistory } from "@/db/schema";
import {
  getKoreanToday,
  getNextStage,
  getStageProgress,
  isContractStage,
  STAGE_INFO,
  type ContractStage,
} from "./workflow";

export async function listContracts() {
  await ensureDatabase();
  return getDb().select().from(contracts).orderBy(desc(contracts.updatedAt), contracts.id);
}

export async function getContract(id: string) {
  await ensureDatabase();
  const [contract] = await getDb().select().from(contracts).where(eq(contracts.id, id)).limit(1);
  return contract ?? null;
}

export async function getContractHistory(id: string) {
  await ensureDatabase();
  return getDb()
    .select()
    .from(contractStageHistory)
    .where(eq(contractStageHistory.contractId, id))
    .orderBy(desc(contractStageHistory.occurredAt), desc(contractStageHistory.id));
}

const completionFieldByNextStage: Partial<Record<ContractStage, string>> = {
  INTERNAL_APPROVAL: "purchase_request_date",
  NARA_CONTRACT: "internal_approval_date",
  COMMITMENT: "contract_date",
  IN_CONSTRUCTION: "actual_start_date",
  INSPECTION: "actual_completion_date",
};

export async function advanceContractStage(id: string, source: "generic" | "phase6-documents" | "phase7" = "generic") {
  const contract = await getContract(id);
  if (!contract || !isContractStage(contract.currentStage)) throw new Error("계약 정보를 찾을 수 없습니다.");

  const currentStage = contract.currentStage;
  if (currentStage === "PURCHASE_REQUEST" || currentStage === "INTERNAL_APPROVAL") {
    throw new Error("품의/기안 화면에서 문서를 확인하고 완료 처리해 주세요.");
  }
  if ((currentStage === "NARA_CONTRACT" || currentStage === "PRE_CONSTRUCTION") && source !== "phase6-documents") {
    throw new Error("해당 서류 화면에서 업로드 분석 결과를 확인하고 완료 처리해 주세요.");
  }
  if ((currentStage === "IN_CONSTRUCTION" || currentStage === "COMPLETION" || currentStage === "INSPECTION") && source !== "phase7") {
    throw new Error("공사중·준공 화면에서 확인 절차를 완료해 주세요.");
  }
  const nextStage = getNextStage(currentStage);
  if (!nextStage) throw new Error("이미 완료된 계약입니다.");

  const today = getKoreanToday();
  const occurredAt = new Date().toISOString();
  const d1 = getD1();
  const nextTask = getNextStage(nextStage) ? STAGE_INFO[nextStage].action : "하자관리 기준 확인";
  const dateField = completionFieldByNextStage[nextStage];
  const completionUpdate = dateField ? `, ${dateField} = COALESCE(${dateField}, ?)` : "";
  const values = [nextStage, getStageProgress(nextStage), nextTask, occurredAt];
  if (dateField) values.push(today);
  values.push(id, currentStage);

  const result = await d1
    .prepare(`UPDATE contracts SET current_stage = ?, progress = ?, next_task = ?, next_task_date = NULL, updated_at = ?${completionUpdate} WHERE id = ? AND current_stage = ?`)
    .bind(...values)
    .run();

  if ((result.meta.changes ?? 0) !== 1) throw new Error("다른 작업에서 단계가 변경되었습니다. 화면을 새로고침해주세요.");

  await d1
    .prepare("INSERT INTO contract_stage_history (contract_id, from_stage, to_stage, action, actor, occurred_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, currentStage, nextStage, STAGE_INFO[currentStage].action, "담당자", occurredAt)
    .run();

  return { currentStage, nextStage };
}

export async function finishContractAfterPayment(id: string) {
  const contract = await getContract(id);
  if (!contract) throw new Error("계약 정보를 찾을 수 없습니다.");
  if (contract.currentStage !== "INSPECTION") throw new Error("검사검수 단계에서만 공사완료 처리를 할 수 있습니다.");
  if (!contract.paymentDate) throw new Error("먼저 대금지급 완료를 확인해 주세요.");
  const occurredAt = new Date().toISOString();
  const d1 = getD1();
  const result = await d1.prepare(`UPDATE contracts SET current_stage = 'FINISHED', progress = 100, next_task = '하자관리 기준 확인',
      next_task_date = NULL, attention = '공사완료 처리되었습니다. Phase 8에서 하자관리 기준을 확인합니다.', updated_at = ?
      WHERE id = ? AND current_stage = 'INSPECTION' AND payment_date IS NOT NULL`).bind(occurredAt, id).run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error("다른 작업에서 단계가 변경되었습니다. 화면을 새로고침해주세요.");
  await d1.prepare("INSERT INTO contract_stage_history (contract_id, from_stage, to_stage, action, actor, occurred_at) VALUES (?, 'INSPECTION', 'FINISHED', '공사완료', '담당자', ?)")
    .bind(id, occurredAt).run();
  return { currentStage: "FINISHED", nextStage: null };
}

export async function getPhase7CompletionStatus(id: string) {
  await ensureDatabase();
  const row = await getD1().prepare("SELECT utility_notice_date AS utilityNoticeDate FROM phase7_completion_actions WHERE contract_id = ?").bind(id).first<{ utilityNoticeDate: string | null }>();
  return { utilityNoticeDate: row?.utilityNoticeDate ?? null };
}

export async function completeUtilityNotice(id: string) {
  const contract = await getContract(id);
  if (!contract) throw new Error("계약 정보를 찾을 수 없습니다.");
  if (contract.currentStage !== "INSPECTION") throw new Error("검사검수 단계에서만 안내공문 발송 완료를 처리할 수 있습니다.");
  if (!contract.inspectionDate) throw new Error("먼저 에듀파인 검사·검수 완료를 확인해 주세요.");
  const today = getKoreanToday(); const now = new Date().toISOString(); const d1 = getD1();
  await d1.prepare("INSERT INTO phase7_completion_actions (contract_id, utility_notice_date, updated_at) VALUES (?, ?, ?) ON CONFLICT(contract_id) DO UPDATE SET utility_notice_date=COALESCE(phase7_completion_actions.utility_notice_date, excluded.utility_notice_date), updated_at=excluded.updated_at").bind(id, today, now).run();
  await d1.prepare("UPDATE contracts SET next_task='대금지급 완료', attention='수도광열비 안내공문 발송을 확인했습니다. 대금지급 완료 여부를 확인해 주세요.', updated_at=? WHERE id=?").bind(now, id).run();
  await d1.prepare("INSERT INTO contract_stage_history (contract_id, from_stage, to_stage, action, actor, occurred_at) VALUES (?, 'INSPECTION', 'INSPECTION', '수도광열비 안내공문 발송 완료', '담당자', ?)").bind(id, now).run();
  return { utilityNoticeDate: today };
}

export async function completeContractPayment(id: string) {
  const contract = await getContract(id);
  if (!contract) throw new Error("계약 정보를 찾을 수 없습니다.");
  if (contract.currentStage !== "INSPECTION") throw new Error("검사검수 단계에서만 대금지급 완료를 처리할 수 있습니다.");
  if (!contract.inspectionDate) throw new Error("먼저 에듀파인 검사·검수 완료를 확인해 주세요.");
  const completion = await getPhase7CompletionStatus(id);
  if (!completion.utilityNoticeDate) throw new Error("먼저 수도광열비 안내공문 발송 완료를 확인해 주세요.");
  if (contract.paymentDate) return { paymentDate: contract.paymentDate };
  const today = getKoreanToday(); const now = new Date().toISOString(); const d1 = getD1();
  const result = await d1.prepare("UPDATE contracts SET payment_date=?, next_task='공사완료 확인', attention='대금지급 완료를 확인했습니다. 공사완료 버튼을 눌러 최종 완료해 주세요.', updated_at=? WHERE id=? AND current_stage='INSPECTION' AND payment_date IS NULL").bind(today, now, id).run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error("대금지급 완료일을 저장하지 못했습니다.");
  await d1.prepare("INSERT INTO contract_stage_history (contract_id, from_stage, to_stage, action, actor, occurred_at) VALUES (?, 'INSPECTION', 'INSPECTION', '대금지급 완료', '담당자', ?)").bind(id, now).run();
  return { paymentDate: today };
}

export function getDeadlineForContract(contract: { currentStage: string; plannedStartDate: string | null; plannedCompletionDate: string | null; nextTaskDate: string | null }) {
  if (contract.currentStage === "PRE_CONSTRUCTION") return { prefix: "착공", date: contract.plannedStartDate };
  if (contract.currentStage === "IN_CONSTRUCTION" || contract.currentStage === "COMPLETION") return { prefix: "준공", date: contract.plannedCompletionDate };
  if (contract.currentStage === "FINISHED") return { prefix: "하자검사", date: contract.nextTaskDate };
  return { prefix: "업무", date: contract.nextTaskDate };
}

export function formatWon(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}
