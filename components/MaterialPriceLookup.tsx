"use client";

import { useState } from "react";
import {
  selectableMaterialItems,
  standardizeMaterial,
  type G2bMaterialPrice,
  type MaterialItemLike,
} from "@/lib/material-price";

type PriceResponse = {
  originalName: string;
  originalSpecification: string | null;
  standardName: string;
  category: string | null;
  searchedQueries: string[];
  results: G2bMaterialPrice[];
  checkedAt: string;
  sourceName: string;
  sourceUrl: string;
  endpoint: string;
  cached?: boolean;
};

const memoryCache = new Map<string, PriceResponse>();

function won(value: number | null | undefined) {
  return value === null || value === undefined ? "[확인 필요]" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function cacheKey(item: MaterialItemLike, query: string) {
  return `${item.itemName || ""}|${item.specification || ""}|${query}`.toUpperCase();
}

export function MaterialPriceLookup({ items }: { items: MaterialItemLike[] }) {
  const materials = selectableMaterialItems(items);
  const [selected, setSelected] = useState<MaterialItemLike | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PriceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!materials.length) return null;

  async function lookup(item: MaterialItemLike, manualQuery = "") {
    const original = item.itemName?.trim() || "";
    if (!original || loading) return;
    const standardized = standardizeMaterial(original, item.specification);
    const effectiveQuery = manualQuery.trim();
    const key = cacheKey(item, effectiveQuery || standardized.standardName);
    setSelected(item);
    setQuery(effectiveQuery || standardized.standardName);
    setResult(null);
    setError("");
    const cached = memoryCache.get(key);
    if (cached) { setResult({ ...cached, cached: true }); return; }
    try {
      const stored = sessionStorage.getItem(`material-price:${key}`);
      if (stored) {
        const parsed = JSON.parse(stored) as PriceResponse;
        memoryCache.set(key, parsed);
        setResult({ ...parsed, cached: true });
        return;
      }
    } catch { /* session cache is optional */ }

    setLoading(true);
    try {
      const params = new URLSearchParams({ original });
      if (item.specification) params.set("spec", item.specification);
      if (effectiveQuery) params.set("q", effectiveQuery);
      const response = await fetch(`/api/g2b/material-prices?${params.toString()}`);
      const payload = await response.json() as PriceResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "조달청 기준가격을 조회하지 못했습니다.");
      memoryCache.set(key, payload);
      try { sessionStorage.setItem(`material-price:${key}`, JSON.stringify(payload)); } catch { /* optional */ }
      setResult(payload);
      setQuery(payload.standardName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "조달청 기준가격을 조회하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    if (loading) return;
    setSelected(null);
    setResult(null);
    setError("");
  }

  const standardized = selected?.itemName ? standardizeMaterial(selected.itemName, selected.specification) : null;

  return <>
    <section className="material-price-section" aria-labelledby="material-price-title">
      <div className="material-price-heading">
        <div><span className="section-kicker">선택 조회</span><h2 id="material-price-title">추출 자재 기준가격 조회</h2></div>
        <p>필요한 자재만 조달청 참고가격을 조회합니다. 견적검토 시 자동 호출되지 않습니다.</p>
      </div>
      <div className="material-price-items">
        {materials.map((item, index) => <div className="material-price-item" key={`${item.itemName}-${item.specification}-${index}`}>
          <div><strong>{item.itemName}</strong><span>{item.specification || "규격 [확인 필요]"}{item.unit ? ` · ${item.unit}` : ""}{item.unitPrice !== null && item.unitPrice !== undefined ? ` · 견적단가 ${won(item.unitPrice)}` : ""}</span></div>
          <button type="button" onClick={() => void lookup(item)}>기준가격 조회</button>
        </div>)}
      </div>
    </section>

    {selected && <div className="material-price-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
      <section className="material-price-dialog" role="dialog" aria-modal="true" aria-labelledby="material-price-dialog-title">
        <header><div><span className="section-kicker">조달청 공식 자료</span><h2 id="material-price-dialog-title">자재 기준가격 조회</h2></div><button type="button" className="material-price-close" aria-label="닫기" onClick={close}>×</button></header>
        <div className="material-price-summary">
          <div><span>견적서 품명</span><strong>{selected.itemName}</strong></div>
          <div><span>견적서 규격</span><strong>{selected.specification || "[확인 필요]"}</strong></div>
          <div><span>검색 표준어</span><strong>{result?.standardName || standardized?.standardName || "[확인 필요]"}</strong></div>
          <div><span>견적서 단가</span><strong>{won(selected.unitPrice)}</strong></div>
        </div>
        <form className="material-price-search" onSubmit={(event) => { event.preventDefault(); void lookup(selected, query); }}>
          <label htmlFor="material-price-query">검색어</label>
          <input id="material-price-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="품명 또는 규격을 입력하세요" />
          <button type="submit" disabled={loading || query.trim().length < 2}>{loading ? "조회 중…" : "검색"}</button>
        </form>
        {loading && <div className="material-price-state" role="status"><span className="material-price-spinner" />조달청 가격정보를 조회하고 있습니다.</div>}
        {error && <div className="material-price-state error" role="alert"><strong>기준가격을 불러오지 못했습니다.</strong><p>{error}</p><p>기존 견적서 분석 결과에는 영향을 주지 않습니다.</p></div>}
        {result && result.results.length === 0 && <div className="material-price-state empty"><strong>조달청 가격정보에서 관련 항목을 찾지 못했습니다.</strong><p>검색어를 품명 중심으로 수정하여 다시 조회해 주세요.</p></div>}
        {result && result.results.length > 0 && <div className="material-price-results">
          <div className="material-price-results-title"><strong>조달청 시설공통자재 가격정보</strong><span>{result.results.length}건{result.cached ? " · 캐시 사용" : ""}</span></div>
          <div className="material-price-table-wrap"><table><thead><tr><th>품명</th><th>규격</th><th>단위</th><th>기준가격</th><th>일치도</th><th>기준일자</th></tr></thead><tbody>
            {result.results.map((row, index) => <tr key={`${row.productName}-${row.specification}-${row.price}-${index}`}><td><strong>{row.productName}</strong>{row.field && <small>{row.field}</small>}</td><td>{row.specification}</td><td>{row.unit}</td><td className="price-cell">{won(row.price)}</td><td><span className={`material-match match-${row.matchScore >= 90 ? "high" : row.matchScore >= 60 ? "medium" : "low"}`}>{row.matchLabel}</span></td><td>{row.noticeDate || "[확인 필요]"}</td></tr>)}
          </tbody></table></div>
        </div>}
        <footer><p><strong>출처:</strong> <a href="https://www.data.go.kr/data/15129415/openapi.do" target="_blank" rel="noreferrer">조달청 나라장터 가격정보현황서비스</a></p><blockquote>조달청 시설공사 원가계산에 활용되는 참고가격입니다. 실제 거래가격은 수량, 규격, 운송조건, 지역 및 수급상황 등에 따라 달라질 수 있습니다.</blockquote></footer>
      </section>
    </div>}
  </>;
}
