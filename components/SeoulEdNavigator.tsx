"use client";

import { useEffect, useMemo, useState } from "react";

type Site = {
  id: number;
  group: string;
  category: string;
  subcategory: string;
  name: string;
  organization: string;
  url: string;
  urlMode: "ok" | "unknown" | "internal";
  useCase: string;
  keywords: string[];
  aliases: string[];
  login: string;
  loginLabel: string;
  owner: string;
  status: string;
  statusLabel: string;
  verifiedDate: string;
  priority: "A" | "B" | "C";
  priorityLabel: string;
  usageLevel: "S" | "A" | "B" | "C";
  note: string;
};

type Category = { id: string; label: string; description: string };
type Assignment = { task: string; siteName: string; reason: string; keywords: string[] };
type PageMode = "home" | "map" | "all" | "favorites";

const STORAGE_FAVORITES = "contract-on-navigator-favorites";
const STORAGE_RECENT = "contract-on-navigator-recent";
const STOPWORDS = new Set(["업무", "담당", "관련", "확인", "필요", "사이트", "처리", "합니다", "있습니다"]);
const WORK_TERMS = ["공사", "계약", "선금", "보증", "학교", "회계", "시설", "안전", "통학", "버스", "교육", "공무직", "운영위원회", "급여", "복지", "채용", "민원", "정보공개", "개인정보", "폐기물", "연수", "급식"];

function tokens(value: string) {
  const base = value.toLowerCase().split(/[^0-9a-z가-힣]+/).map((word) => word.trim()).filter((word) => word.length >= 2 && !STOPWORDS.has(word));
  const expanded = base.flatMap((word) => [word, ...WORK_TERMS.filter((term) => word.length > term.length && word.includes(term))]);
  return Array.from(new Set(expanded));
}

function scoreSite(site: Site, queryTokens: string[], assignments: Assignment[]) {
  if (!queryTokens.length) return site.usageLevel === "S" ? 20 : site.usageLevel === "A" ? 12 : site.priority === "A" ? 6 : 1;
  const name = `${site.name} ${site.aliases.join(" ")}`.toLowerCase();
  const work = `${site.category} ${site.subcategory} ${site.useCase} ${site.keywords.join(" ")} ${site.owner} ${site.organization}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (name.includes(token)) score += 10;
    if (work.includes(token)) score += 5;
  }
  const assignmentHit = assignments.some((assignment) => {
    if (!(site.name.includes(assignment.siteName) || assignment.siteName.includes(site.name))) return false;
    return queryTokens.some((token) => `${assignment.task} ${assignment.reason} ${assignment.keywords.join(" ")}`.toLowerCase().includes(token));
  });
  if (assignmentHit) score += 7;
  if (score > 0) score += site.usageLevel === "S" ? 5 : site.usageLevel === "A" ? 3 : 0;
  return score;
}

function statusClass(status: string) {
  if (status === "ok") return "ok";
  if (status === "down") return "down";
  return "check";
}

export function SeoulEdNavigator() {
  const [sites, setSites] = useState<Site[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [mode, setMode] = useState<PageMode>("home");
  const [favorites, setFavorites] = useState<number[]>([]);
  const [recent, setRecent] = useState<number[]>([]);
  const [detail, setDetail] = useState<Site | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/navigator-data/sites.json").then((response) => response.json() as Promise<Site[]>),
      fetch("/navigator-data/categories.json").then((response) => response.json() as Promise<Category[]>),
      fetch("/navigator-data/assignments.json").then((response) => response.json() as Promise<Assignment[]>),
    ]).then(([siteRows, categoryRows, assignmentRows]) => {
      setSites(siteRows);
      setCategories(categoryRows.filter((category) => siteRows.some((site) => site.group === category.id)));
      setAssignments(assignmentRows);
    }).finally(() => setLoading(false));
    try {
      setFavorites(JSON.parse(localStorage.getItem(STORAGE_FAVORITES) || "[]") as number[]);
      setRecent(JSON.parse(localStorage.getItem(STORAGE_RECENT) || "[]") as number[]);
    } catch {
      setFavorites([]); setRecent([]);
    }
  }, []);

  const results = useMemo(() => {
    const queryTokens = tokens(submittedQuery || (mode === "all" ? query : ""));
    let rows = sites.map((site) => ({ site, score: scoreSite(site, queryTokens, assignments) }));
    if (selectedGroup) rows = rows.filter((row) => row.site.group === selectedGroup);
    if (mode === "favorites") rows = rows.filter((row) => favorites.includes(row.site.id));
    if (queryTokens.length) rows = rows.filter((row) => row.score > 0);
    return rows.sort((a, b) => b.score - a.score || a.site.name.localeCompare(b.site.name, "ko"));
  }, [assignments, favorites, mode, query, selectedGroup, sites, submittedQuery]);

  const matchedGroups = useMemo(() => {
    const counts = new Map<string, number>();
    results.forEach(({ site }) => counts.set(site.group, (counts.get(site.group) || 0) + 1));
    return categories.filter((category) => counts.has(category.id)).map((category) => ({ ...category, count: counts.get(category.id) || 0 }));
  }, [categories, results]);

  function runSearch(value = query) {
    setQuery(value);
    setSubmittedQuery(value.trim());
    setSelectedGroup("");
    setMode("home");
  }

  function toggleFavorite(id: number) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(next));
      return next;
    });
  }

  function openSite(site: Site) {
    const next = [site.id, ...recent.filter((id) => id !== site.id)].slice(0, 5);
    setRecent(next);
    localStorage.setItem(STORAGE_RECENT, JSON.stringify(next));
    if (site.urlMode === "ok" && /^https?:\/\//.test(site.url)) window.open(site.url, "_blank", "noopener,noreferrer");
    else setDetail(site);
  }

  const visibleResults = results.slice(0, mode === "all" || mode === "favorites" || selectedGroup ? 96 : 24);
  const recentSites = recent.map((id) => sites.find((site) => site.id === id)).filter(Boolean) as Site[];

  return <div className="sen-navigator">
    <header className="sen-hero">
      <div><span className="section-kicker">서울교육 업무사이트 내비게이터</span><h1>내 업무에 필요한 사이트,<br />이제 찾지 마세요.</h1><p>업무분장이나 지금 하려는 일을 입력하면 관련 교육행정 사이트를 바로 안내합니다.</p></div>
      <div className="sen-hero-badge"><strong>{sites.length || "-"}</strong><span>등록 사이트</span></div>
    </header>

    <nav className="sen-local-nav" aria-label="서울교육 사이트 찾기 메뉴">
      {([['home', '홈'], ['map', '업무지도'], ['all', '전체 사이트'], ['favorites', `즐겨찾기 ${favorites.length}`]] as const).map(([value, label]) => <button key={value} className={mode === value ? "active" : ""} type="button" onClick={() => { setMode(value); setSelectedGroup(""); if (value !== "home") setSubmittedQuery(""); }}>{label}</button>)}
    </nav>

    <section className="sen-search-card">
      <label htmlFor="sen-work-search">지금 하려는 업무를 입력하세요.</label>
      <div><textarea id="sen-work-search" rows={2} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); runSearch(); } }} placeholder="예: 공사계약, 선금 보증서 확인, 위험성평가" /><button type="button" onClick={() => runSearch()} disabled={!query.trim()}>내 업무 분석하기</button></div>
      <div className="sen-examples">{["공사계약", "학교회계", "시설관리", "산업안전", "통학버스", "교육공무직", "학교운영위원회"].map((word) => <button type="button" key={word} onClick={() => runSearch(word)}>{word}</button>)}</div>
    </section>

    {loading ? <div className="sen-empty">사이트 데이터를 불러오고 있습니다.</div> : <>
      {submittedQuery && <section className="sen-result-summary"><div><strong>“{submittedQuery}” 관련 업무를 찾았습니다.</strong><span>추천 사이트 {results.length}개</span></div><div>{matchedGroups.slice(0, 6).map((group) => <button key={group.id} type="button" onClick={() => setSelectedGroup(group.id)}>{group.label} {group.count}</button>)}</div></section>}

      {(mode === "map" || mode === "home") && <section className="sen-map-section">
        <div className="sen-section-head"><div><h2>나의 업무지도</h2><p>업무 분야를 선택하면 관련 사이트만 모아볼 수 있습니다.</p></div><button type="button" onClick={() => { setSelectedGroup(""); setSubmittedQuery(""); }}>전체 보기</button></div>
        <div className="sen-work-map"><div className="sen-map-center">내 업무</div>{categories.map((category) => <button key={category.id} type="button" className={selectedGroup === category.id || matchedGroups.some((group) => group.id === category.id) && submittedQuery ? "active" : ""} onClick={() => { setSelectedGroup(category.id); setMode("map"); }}><strong>{category.label}</strong><span>{category.description}</span></button>)}</div>
      </section>}

      <section className="sen-results-section">
        <div className="sen-section-head"><div><h2>{mode === "favorites" ? "즐겨찾기" : selectedGroup ? `${categories.find((category) => category.id === selectedGroup)?.label || "업무"} 사이트` : submittedQuery ? "추천 사이트" : mode === "all" ? "전체 업무사이트" : "자주 찾는 사이트"}</h2><p>{visibleResults.length}개 사이트를 표시합니다.</p></div>{mode === "all" && <input aria-label="전체 사이트 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="사이트명·업무명 검색" />}</div>
        {visibleResults.length ? <div className="sen-site-grid">{visibleResults.map(({ site }) => <article className="sen-site-card" key={site.id}>
          <div className="sen-site-card-top"><span>{categories.find((category) => category.id === site.group)?.label || site.category}</span><button type="button" className={favorites.includes(site.id) ? "favorite" : ""} onClick={() => toggleFavorite(site.id)} aria-label={`${site.name} 즐겨찾기`}>{favorites.includes(site.id) ? "★" : "☆"}</button></div>
          <button className="sen-site-name" type="button" onClick={() => setDetail(site)}>{site.name}</button>
          <p>{site.useCase}</p>
          <dl><div><dt>운영기관</dt><dd>{site.organization || "[확인 필요]"}</dd></div><div><dt>로그인</dt><dd>{site.loginLabel || "[확인 필요]"}</dd></div></dl>
          <div className="sen-site-card-bottom"><span className={`sen-status ${statusClass(site.status)}`}>{site.statusLabel || "[확인 필요]"}</span><button type="button" onClick={() => openSite(site)}>{site.urlMode === "ok" ? "사이트 열기" : "접속 정보 보기"}</button></div>
        </article>)}</div> : <div className="sen-empty">관련 사이트를 찾지 못했습니다. 검색어를 조금 간단하게 입력해 보세요.</div>}
      </section>

      {mode === "home" && recentSites.length > 0 && <section className="sen-recent"><h2>최근 사용한 사이트</h2><div>{recentSites.map((site) => <button type="button" key={site.id} onClick={() => openSite(site)}>{site.name}</button>)}</div></section>}
    </>}

    {detail && <div className="sen-detail-backdrop" role="presentation" onMouseDown={() => setDetail(null)}><aside className="sen-detail-panel" role="dialog" aria-modal="true" aria-labelledby="sen-detail-title" onMouseDown={(event) => event.stopPropagation()}><button className="sen-detail-close" type="button" onClick={() => setDetail(null)}>닫기</button><span>{categories.find((category) => category.id === detail.group)?.label || detail.category}</span><h2 id="sen-detail-title">{detail.name}</h2><p>{detail.useCase}</p><dl><div><dt>운영기관</dt><dd>{detail.organization || "[확인 필요]"}</dd></div><div><dt>세부 업무</dt><dd>{detail.subcategory || detail.category}</dd></div><div><dt>로그인</dt><dd>{detail.loginLabel || "[확인 필요]"}</dd></div><div><dt>운영상태</dt><dd>{detail.statusLabel || "[확인 필요]"}</dd></div><div><dt>최종 확인일</dt><dd>{detail.verifiedDate || "[확인 필요]"}</dd></div><div><dt>담당 업무</dt><dd>{detail.owner || "[확인 필요]"}</dd></div></dl>{detail.note && <div className="sen-detail-note"><strong>주의사항</strong><p>{detail.note}</p></div>}<button className="sen-detail-open" type="button" onClick={() => openSite(detail)} disabled={detail.urlMode !== "ok"}>사이트 바로가기</button></aside></div>}
  </div>;
}
