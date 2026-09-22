export type UtilityCostKind = "BOTH" | "ELECTRICITY" | "WATER";
export type UtilityTrade = "BUILDING" | "CIVIL" | "INDUSTRIAL" | "LANDSCAPE";
export type UtilityDuration = "UP_TO_6" | "UP_TO_12" | "UP_TO_36" | "OVER_36";
export type UtilityAmountBand = "UNDER_500M" | "UNDER_3B" | "UNDER_5B" | "UNDER_30B" | "UNDER_100B";

const RATES = {
  electricity: {
    trade: { BUILDING: .515, CIVIL: .346, INDUSTRIAL: .163, LANDSCAPE: .175 },
    duration: { UP_TO_6: .212, UP_TO_12: .505, UP_TO_36: .715, OVER_36: .132 },
    amount: { UNDER_500M: .176, UNDER_3B: .269, UNDER_5B: null, UNDER_30B: .448, UNDER_100B: .506 },
  },
  water: {
    trade: { BUILDING: .479, CIVIL: .597, INDUSTRIAL: .422, LANDSCAPE: .232 },
    duration: { UP_TO_6: .410, UP_TO_12: .509, UP_TO_36: .596, OVER_36: .154 },
    amount: { UNDER_500M: .199, UNDER_3B: .331, UNDER_5B: null, UNDER_30B: .611, UNDER_100B: .726 },
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

export function calculateUtilityCost(input: { kind: UtilityCostKind; trade: UtilityTrade; duration: UtilityDuration; amountExVat: number; directMaterial: number; directLabor: number }) {
  const amountBand = inferUtilityAmountBand(input.amountExVat);
  if (!amountBand) return { electricity: null, water: null, total: null, amountBand: null, reason: "공사규모 1,000억 원 이상 요율은 원본 표에서 확인할 수 없습니다." };
  const base = Math.max(0, input.directMaterial) + Math.max(0, input.directLabor);
  const calculate = (group: typeof RATES.electricity | typeof RATES.water) => {
    const amountRate = group.amount[amountBand];
    if (amountRate === null) return null;
    const rates = { trade: group.trade[input.trade], duration: group.duration[input.duration], amount: amountRate };
    return { amount: roundDownTen(base * ((rates.trade + rates.duration + rates.amount) / 3) / 100), rates };
  };
  const electricity = input.kind === "WATER" ? { amount: 0, rates: null } : calculate(RATES.electricity);
  const water = input.kind === "ELECTRICITY" ? { amount: 0, rates: null } : calculate(RATES.water);
  if (!electricity || !water) return { electricity, water, total: null, amountBand, reason: "30억 이상 50억 미만 요율이 원본 표에 공란으로 되어 있어 계산할 수 없습니다." };
  return { electricity, water, total: electricity.amount + water.amount, amountBand, reason: null };
}
