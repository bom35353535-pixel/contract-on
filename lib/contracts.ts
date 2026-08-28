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

export async function advanceContractStage(id: string, source: "generic" | "phase6-documents" = "generic") {
  const contract = await getContract(id);
  if (!contract || !isContractStage(contract.currentStage)) throw new Error("계약 정보를 찾을 수 없습니다.");

  const currentStage = contract.currentStage;
  if (currentStage === "PURCHASE_REQUEST" || currentStage === "INTERNAL_APPROVAL") {
    throw new Error("품의/기안 화면에서 문서를 확인하고 완료 처리해 주세요.");
  }
  if ((currentStage === "NARA_CONTRACT" || currentStage === "PRE_CONSTRUCTION") && source !== "phase6-documents") {
    throw new Error("해당 서류 화면에서 업로드 분석 결과를 확인하고 완료 처리해 주세요.");
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

  if (nextStage === "FINISHED") {
    await d1.prepare("UPDATE contracts SET inspection_date = COALESCE(inspection_date, ?), payment_date = COALESCE(payment_date, ?) WHERE id = ?").bind(today, today, id).run();
  }

  await d1
    .prepare("INSERT INTO contract_stage_history (contract_id, from_stage, to_stage, action, actor, occurred_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, currentStage, nextStage, STAGE_INFO[currentStage].action, "담당자", occurredAt)
    .run();

  return { currentStage, nextStage };
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
