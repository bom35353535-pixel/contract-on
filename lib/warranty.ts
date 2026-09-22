import { getD1 } from "@/db";
import { ensureDatabase } from "@/db/init";

export type WarrantyCriterion = { id: string; category: string; workName: string; warrantyYears: number; bondRate: number | null; sourceName: string; sourcePage: string; sourceExcerpt: string };
export type WarrantyInspection = { id: number; sequence: number; scheduledDate: string; status: string; inspectedAt: string | null; note: string | null };

function dateOnly(date: Date) { return date.toISOString().slice(0, 10); }
function parseDate(value: string) { const [y,m,d] = value.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function addMonths(value: string, months: number) { const d = parseDate(value); d.setUTCMonth(d.getUTCMonth() + months); return dateOnly(d); }
export function calculateWarrantyEnd(value: string, years: number) { const d = parseDate(value); d.setUTCFullYear(d.getUTCFullYear() + years); d.setUTCDate(d.getUTCDate() - 1); return dateOnly(d); }

export async function getWarrantyWorkspace(contractId: string) {
  await ensureDatabase(); const d1 = getD1();
  const criteria = await d1.prepare("SELECT id, category, work_name AS workName, warranty_years AS warrantyYears, bond_rate AS bondRate, source_name AS sourceName, source_page AS sourcePage, source_excerpt AS sourceExcerpt FROM warranty_criteria ORDER BY id").all<WarrantyCriterion>();
  const warranty = await d1.prepare("SELECT contract_id AS contractId, criterion_id AS criterionId, warranty_years AS warrantyYears, bond_rate AS bondRate, warranty_start_date AS warrantyStartDate, warranty_end_date AS warrantyEndDate, confirmed_at AS confirmedAt FROM contract_warranties WHERE contract_id = ?").bind(contractId).first<Record<string, unknown>>();
  const inspections = await d1.prepare("SELECT id, sequence, scheduled_date AS scheduledDate, status, inspected_at AS inspectedAt, note FROM warranty_inspections WHERE contract_id = ? ORDER BY sequence").bind(contractId).all<WarrantyInspection>();
  return { criteria: criteria.results, warranty: warranty ?? null, inspections: inspections.results };
}

export async function confirmWarranty(contractId: string, criterionId: string, startDate: string) {
  await ensureDatabase(); const d1 = getD1();
  const contract = await d1.prepare("SELECT current_stage AS stage FROM contracts WHERE id = ?").bind(contractId).first<{ stage: string }>();
  if (!contract) throw new Error("계약 정보를 찾을 수 없습니다.");
  const existingWarranty = await d1.prepare("SELECT contract_id FROM contract_warranties WHERE contract_id = ?").bind(contractId).first<{ contract_id: string }>();
  if (contract.stage !== "FINISHED" && !existingWarranty) throw new Error("공사완료 계약에서만 하자기간을 확정할 수 있습니다.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("하자담보 시작일을 확인해 주세요.");
  const criterion = await d1.prepare("SELECT work_name AS workName, warranty_years AS warrantyYears, bond_rate AS bondRate FROM warranty_criteria WHERE id = ?").bind(criterionId).first<{ workName: string; warrantyYears: number; bondRate: number | null }>();
  if (!criterion) throw new Error("하자기간 기준을 선택해 주세요.");
  const endDate = calculateWarrantyEnd(startDate, criterion.warrantyYears); const now = new Date().toISOString();
  const dates: string[] = []; for (let n = 1; ; n++) { const next = addMonths(startDate, n * 6); if (next > endDate) break; dates.push(next); }
  await d1.batch([
    d1.prepare("INSERT INTO contract_warranties (contract_id, criterion_id, warranty_years, bond_rate, warranty_start_date, warranty_end_date, confirmed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(contract_id) DO UPDATE SET criterion_id=excluded.criterion_id, warranty_years=excluded.warranty_years, bond_rate=excluded.bond_rate, warranty_start_date=excluded.warranty_start_date, warranty_end_date=excluded.warranty_end_date, confirmed_at=excluded.confirmed_at, updated_at=excluded.updated_at").bind(contractId, criterionId, criterion.warrantyYears, criterion.bondRate, startDate, endDate, now, now),
    d1.prepare("DELETE FROM warranty_inspections WHERE contract_id = ?").bind(contractId),
    d1.prepare("UPDATE contracts SET warranty_type = ?, warranty_start_date = ?, warranty_end_date = ?, next_task = ?, next_task_date = ?, attention = ?, updated_at = ? WHERE id = ?").bind(criterion.workName, startDate, endDate, dates.length ? "정기 하자검사" : "하자담보 만료 확인", dates[0] ?? endDate, `하자담보기간 ${criterion.warrantyYears}년이 담당자 확인으로 확정되었습니다.`, now, contractId),
  ]);
  if (dates.length) await d1.batch(dates.map((scheduledDate, index) => d1.prepare("INSERT INTO warranty_inspections (contract_id, sequence, scheduled_date, status, created_at, updated_at) VALUES (?, ?, ?, 'SCHEDULED', ?, ?)").bind(contractId, index + 1, scheduledDate, now, now)));
  return { endDate, dates };
}

export async function completeWarrantyInspection(contractId: string, inspectionId: number) {
  await ensureDatabase(); const d1 = getD1(); const now = new Date().toISOString();
  const result = await d1.prepare("UPDATE warranty_inspections SET status='COMPLETED', inspected_at=?, updated_at=? WHERE id=? AND contract_id=?").bind(now, now, inspectionId, contractId).run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error("하자검사 일정을 찾을 수 없습니다.");
  const next = await d1.prepare("SELECT scheduled_date AS scheduledDate FROM warranty_inspections WHERE contract_id=? AND status='SCHEDULED' ORDER BY scheduled_date LIMIT 1").bind(contractId).first<{ scheduledDate: string }>();
  await d1.prepare("UPDATE contracts SET next_task=?, next_task_date=?, updated_at=? WHERE id=?").bind(next ? "정기 하자검사" : "하자담보 만료 확인", next?.scheduledDate ?? null, now, contractId).run();
}
