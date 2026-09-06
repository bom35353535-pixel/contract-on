"use client";

import { useEffect, useState } from "react";

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
};

function formattedBizno(value: string) {
  return value.length === 10 ? `${value.slice(0, 3)}-${value.slice(3, 5)}-${value.slice(5)}` : value;
}

export function SupplierSanctionCheck({ companyName, businessRegistrationNumber }: { companyName: string | null; businessRegistrationNumber: string | null }) {
  const digits = (businessRegistrationNumber || "").replace(/\D/g, "");
  const [result, setResult] = useState<SanctionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (digits.length !== 10) {
      setResult(null);
      setBusy(false);
      setError("견적서에서 사업자등록번호 10자리를 확인하지 못했습니다. 위 기본정보의 사업자등록번호를 확인해 주세요.");
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setResult(null);
    void fetch(`/api/g2b/sanctions?bizno=${encodeURIComponent(digits)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as SanctionResult & { error?: string };
        if (!response.ok) throw new Error(payload.error || "부정당제재 상태를 조회하지 못했습니다.");
        setResult(payload);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "부정당제재 상태를 조회하지 못했습니다.");
      })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [digits]);

  const badge = busy ? "자동 조회 중" : !result ? "확인 필요" : result.totalCount > 0 ? `유효 제재 ${result.totalCount}건` : "유효 제재 조회 없음";
  return <section className="sanction-check-card">
    <div className="sanction-check-heading">
      <div><span>견적서 사업자번호 자동 연계</span><h2>부정당제재 상태</h2></div>
      <strong className={!result ? "idle" : result.totalCount > 0 ? "alert" : "clear"}>{badge}</strong>
    </div>
    <dl className="sanction-auto-target">
      <div><dt>업체명</dt><dd>{companyName || "[확인 필요]"}</dd></div>
      <div><dt>사업자등록번호</dt><dd>{digits ? formattedBizno(digits) : "[견적서 추출 필요]"}</dd></div>
    </dl>
    {busy && <div className="sanction-loading"><span /><strong>나라장터 공개정보를 자동 조회하고 있습니다.</strong></div>}
    {error && <p className="sanction-error">{error}</p>}
    {result && result.items.length > 0 && <div className="sanction-result-list">{result.items.map((item, index) => <article key={`${item.startDate}-${index}`}><strong>{item.corpName || companyName || "업체명 [확인 필요]"}</strong><dl><div><dt>제재기간</dt><dd>{item.startDate || "[확인 필요]"} ~ {item.endDate || "[확인 필요]"}</dd></div><div><dt>처분기관</dt><dd>{item.institution || "[확인 필요]"}</dd></div><div><dt>진행상태</dt><dd>{item.status || "[확인 필요]"}</dd></div>{item.reason && <div><dt>사유·근거</dt><dd>{item.reason}</dd></div>}</dl></article>)}</div>}
    {result && result.totalCount === 0 && <div className="sanction-clear-result"><strong>조회시점 현재 유효한 제재가 확인되지 않았습니다.</strong><span>{new Date(result.checkedAt).toLocaleString("ko-KR")} 자동 조회</span></div>}
    <p className="sanction-coverage">조회시점 현재 유효한 부정당제재만 확인합니다. 0건은 과거 제재 이력이 없다는 뜻이 아니며, 계약 판단 전 공식 조회결과를 함께 확인하세요.</p>
    <footer><a href="https://www.data.go.kr/data/15129466/openapi.do" target="_blank" rel="noreferrer">조달청 나라장터 부정당제재업체정보</a></footer>
  </section>;
}
