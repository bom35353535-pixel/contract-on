function dateOnly(date: Date) { return date.toISOString().slice(0, 10); }
function parseDate(value: string) { const [y,m,d] = value.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }

export function addMonths(value: string, months: number) {
  const source = parseDate(value); const day = source.getUTCDate();
  const d = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay)); return dateOnly(d);
}

export function subtractDays(value: string, days: number) { const d = parseDate(value); d.setUTCDate(d.getUTCDate() - days); return dateOnly(d); }
export function calculateWarrantyEnd(value: string, years: number) { const d = parseDate(value); d.setUTCFullYear(d.getUTCFullYear() + years); d.setUTCDate(d.getUTCDate() - 1); return dateOnly(d); }

export function calculateWarrantyInspectionDates(startDate: string, years: number) {
  const endDate = calculateWarrantyEnd(startDate, years); const count = Math.max(0, Math.round(years * 2));
  return Array.from({ length: count }, (_, index) => index === count - 1 ? endDate : subtractDays(addMonths(startDate, (index + 1) * 6), 1));
}
