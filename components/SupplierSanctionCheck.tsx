"use client";

import { useState } from "react";

type SanctionItem = {
  corpName: string | null;
  startDate: string | null;
  endDate: string | null;
  institution: string | null;
  status: string | null;
  reason: string | null;
};

type SanctionResult = {
  bizno: string;
  totalCount: number;
  checkedAt: string;
  items: SanctionItem[];
  sourceName: string;
  sourceUrl: string;
  coverage: string;
};

export function SupplierSanctionCheck({ companyName }: { companyName: string | null }) {
  const [bizno, setBizno] = useState("");
  const [result, setResult] = useState<SanctionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function check() {
    const digits = bizno.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("사업자등록번호 숫자 10자리를 입력해 주세요.");
      setResult(null);
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/g2b/sanctions?bizno=${encodeURIComponent(digits)}`, { cache: "no-store" });
      const payload = await response.json() as SanctionResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "부정당제재 상태를 조회하지 못했습니다.");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "부정당제재 상태를 조회하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="sanction-check-card">
    <div className="sanction-check-heading">
      <div><span>나라장터 공개정보</span><h2>부정당제재 상태 조회</h2></div>
      <strong className={!result ? "idle" : result.totalCount > 0 ? "alert" : "clear"}>{!result ? "미조회" : result.totalCount > 0 ? `유효 제재 ${result.totalCount}건` : "유효 제재 조회 없음"}</strong>
    </div>
    <p className="sanction-company">조회 대상 업체 <strong>{companyName || "[업체명 확인 필요]"}</strong></p>
    <label className="sanction-bizno-field"><span>사업자등록번호</span><div><input inputMode="numeric" value={bizno} maxLength={12} placeholder="000-00-00000" onChange={(event) => setBizno(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void check(); }} /><button type="button" disabled={busy} onClick={check}>{busy ? "조회 중…" : "조회"}</button></div></label>
    {error && <p className="sanction-error">{error}</p>}
    {result && result.items.length > 0 && <div className="sanction-result-list">{result.items.map((item, index) => <article key={`${item.startDate}-${index}`}><strong>{item.corpName || companyName || "업체명 [확인 필요]"}</strong><dl><div><dt>제재기간</dt><dd>{item.startDate || "[확인 필요]"} ~ {item.endDate || "[확인 필요]"}</dd></div><div><dt>처분기관</dt><dd>{item.institution || "[확인 필요]"}</dd></div><div><dt>진행상태</dt><dd>{item.status || "[확인 필요]"}</dd></div>{item.reason && <div><dt>사유·근거</dt><dd>{item.reason}</dd></div>}</dl></article>)}</div>}
    {result && result.totalCount === 0 && <div className="sanction-clear-result"><strong>조회시점 현재 유효한 제재가 확인되지 않았습니다.</strong><span>{new Date(result.checkedAt).toLocaleString("ko-KR")} 조회</span></div>}
    <p className="sanction-coverage">조회시점 현재 유효한 부정당제재만 확인합니다. 0건은 과거 제재 이력이 없다는 뜻이 아니며, 계약 판단 전 공식 조회결과를 함께 확인하세요.</p>
    <footer><a href="https://www.data.go.kr/data/15129466/openapi.do" target="_blank" rel="noreferrer">조달청 나라장터 부정당제재업체정보</a></footer>
  </section>;
}
