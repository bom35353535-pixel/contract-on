export type UtilityCostKind = "BOTH" | "ELECTRICITY" | "WATER";
export type UtilityTrade = "BUILDING" | "CIVIL" | "INDUSTRIAL" | "LANDSCAPE";
export type UtilityDuration = "UP_TO_6" | "UP_TO_12" | "UP_TO_36" | "OVER_36";
export type UtilityAmountBand = "UNDER_500M" | "UNDER_3B" | "UNDER_5B" | "UNDER_30B" | "UNDER_100B";

const RATES = {
  electricity: {
    trade: { BUILDING: .364, CIVIL: .337, INDUSTRIAL: .081, LANDSCAPE: .315 },
    duration: { UP_TO_6: .151, UP_TO_12: .237, UP_TO_36: .432, OVER_36: .347 },
    amount: { UNDER_500M: .115, UNDER_3B: .164, UNDER_5B: .246, UNDER_30B: .471, UNDER_100B: .460 },
  },
  water: {
    trade: { BUILDING: .670, CIVIL: .642, INDUSTRIAL: .242, LANDSCAPE: .420 },
    duration: { UP_TO_6: .276, UP_TO_12: .389, UP_TO_36: .718, OVER_36: .835 },
    amount: { UNDER_500M: .161, UNDER_3B: .196, UNDER_5B: .425, UNDER_30B: .592, UNDER_100B: 1.009 },
  },
} as const;

export function inferUtilityTrade(constructionType: string): UtilityTrade {
  if (constructionType.includes("토목")) return "CIVIL";
  if (constructionType.includes("산업설비")) return "INDUSTRIAL";
  if (constructionType.includes("조경")) return "LANDSCAPE";
  return "BUILDING";
}

export function inferUtilityDuration(start: string | null, end: string | null): UtilityDuration {
  if (!start || !end) return "UP_TO_6";
  const days = Math.max(1, Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1);
  const months = Math.ceil(days / 30);
  return months <= 6 ? "UP_TO_6" : months <= 12 ? "UP_TO_12" : months <= 36 ? "UP_TO_36" : "OVER_36";
}

export function inferUtilityAmountBand(amountExVat: number): UtilityAmountBand | null {
  if (amountExVat < 500_000_000) return "UNDER_500M";
  if (amountExVat < 3_000_000_000) return "UNDER_3B";
  if (amountExVat < 5_000_000_000) return "UNDER_5B";
  if (amountExVat < 30_000_000_000) return "UNDER_30B";
  if (amountExVat < 100_000_000_000) return "UNDER_100B";
  return null;
}

function roundDownTen(value: number) { return Math.floor(value / 10) * 10; }
export function normalizeUtilityBase(value: number) { return Math.floor(Math.max(0, value) / 1_000) * 1_000; }

export function calculateUtilityCost(input: { kind: UtilityCostKind; trade: UtilityTrade; duration: UtilityDuration; amountExVat: number; directMaterial: number; directLabor: number }) {
  const amountBand = inferUtilityAmountBand(input.amountExVat);
  if (!amountBand) return { electricity: null, water: null, total: null, amountBand: null, reason: "공사규모 1,000억 원 이상 요율은 원본 표에서 확인할 수 없습니다." };
  const base = normalizeUtilityBase(input.directMaterial) + normalizeUtilityBase(input.directLabor);
  const calculate = (group: typeof RATES.electricity | typeof RATES.water) => {
    const amountRate = group.amount[amountBand];
    const rates = { trade: group.trade[input.trade], duration: group.duration[input.duration], amount: amountRate };
    return { amount: roundDownTen(base * ((rates.trade + rates.duration + rates.amount) / 3) / 100), rates };
  };
  const electricity = input.kind === "WATER" ? { amount: 0, rates: null } : calculate(RATES.electricity);
  const water = input.kind === "ELECTRICITY" ? { amount: 0, rates: null } : calculate(RATES.water);
  return { electricity, water, total: electricity.amount + water.amount, amountBand, reason: null };
}

function shownWon(value: number | null) {
  return value === null ? "[확인 필요]" : `${value.toLocaleString("ko-KR")}원`;
}

export function buildUtilityNoticeDraft(input: {
  projectName: string;
  companyName: string;
  directMaterial: number;
  directLabor: number;
  electricity: number | null;
  water: number | null;
  total: number | null;
}) {
  return [
    `제목: ${input.projectName} 전기·수도료 납부 안내(안)`,
    "",
    `1. 관련: ${input.projectName} 계약`,
    `2. ${input.projectName}와 관련하여 공사 중 사용한 전기·수도료 산출 결과를 다음과 같이 안내하고자 합니다.`,
    `   가. 공 사 명: ${input.projectName}`,
    `   나. 업 체 명: ${input.companyName || "000"}`,
    `   다. 산출기초: 직접재료비 ${shownWon(input.directMaterial)} + 직접노무비 ${shownWon(input.directLabor)}`,
    `   라. 전 기 료: ${shownWon(input.electricity)}`,
    `   마. 수 도 료: ${shownWon(input.water)}`,
    `   바. 납부금액: 금${shownWon(input.total)}`,
    "   사. 납부계좌: 000",
    "   아. 납부기한: 000",
    "",
    "붙임  전기수도료 산출내역 1부.  끝.",
  ].join("\n");
}
