export const CONTRACT_STAGES = [
  "PURCHASE_REQUEST",
  "INTERNAL_APPROVAL",
  "NARA_CONTRACT",
  "COMMITMENT",
  "PRE_CONSTRUCTION",
  "IN_CONSTRUCTION",
  "COMPLETION",
  "INSPECTION",
  "FINISHED",
] as const;

export type ContractStage = (typeof CONTRACT_STAGES)[number];

export const STAGE_INFO: Record<ContractStage, { label: string; action: string; description: string }> = {
  PURCHASE_REQUEST: { label: "품의", action: "품의 완료", description: "에듀파인 품의 처리를 확인합니다." },
  INTERNAL_APPROVAL: { label: "내부기안", action: "내부기안 완료", description: "내부기안 처리 결과를 확인합니다." },
  NARA_CONTRACT: { label: "나라장터 계약", action: "나라장터 계약 완료", description: "계약서류와 나라장터 계약 완료 여부를 확인합니다." },
  COMMITMENT: { label: "원인행위", action: "원인행위 완료", description: "에듀파인 원인행위 처리를 확인합니다." },
  PRE_CONSTRUCTION: { label: "착공", action: "착공 확인 완료", description: "착공계와 착공서류를 확인합니다." },
  IN_CONSTRUCTION: { label: "공사중", action: "준공 접수 확인", description: "공사 진행사항과 준공계 접수를 확인합니다." },
  COMPLETION: { label: "준공", action: "준공서류 확인 완료", description: "준공서류의 제출과 확인을 완료합니다." },
  INSPECTION: { label: "검사검수", action: "검사검수 완료", description: "검사검수 완료 후 대금지급을 별도로 확인합니다." },
  FINISHED: { label: "공사완료", action: "완료됨", description: "계약업무가 완료되어 하자관리로 이어집니다." },
};

export function isContractStage(value: string): value is ContractStage {
  return CONTRACT_STAGES.includes(value as ContractStage);
}

export function getNextStage(stage: ContractStage): ContractStage | null {
  const index = CONTRACT_STAGES.indexOf(stage);
  return index < CONTRACT_STAGES.length - 1 ? CONTRACT_STAGES[index + 1] : null;
}

export function getStageProgress(stage: ContractStage) {
  const index = CONTRACT_STAGES.indexOf(stage);
  return Math.round((index / (CONTRACT_STAGES.length - 1)) * 100);
}

export function getKoreanToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function toUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function daysBetween(from: string, to: string) {
  return Math.round((toUtcDate(to) - toUtcDate(from)) / 86_400_000);
}

export function getDdayLabel(targetDate: string | null, prefix: string, today = getKoreanToday()) {
  if (!targetDate) return "일정 확인 필요";
  const days = daysBetween(today, targetDate);
  if (days === 0) return `${prefix} D-Day`;
  if (days > 0) return `${prefix} D-${days}`;
  return `${prefix} ${Math.abs(days)}일 지남`;
}

export function formatKoreanDate(value: string | null) {
  if (!value) return "[확인 필요]";
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

export function formatTodayHeading(today = getKoreanToday()) {
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${year}년 ${month}월 ${day}일 ${weekday}`;
}
