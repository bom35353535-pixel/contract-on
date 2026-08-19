import Link from "next/link";
import type { ReactNode } from "react";

type ActiveSection = "home" | "contracts" | "knowledge";

export function AppShell({ children, active, contractCount }: { children: ReactNode; active: ActiveSection; contractCount: number }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">AI</span>
          <span><strong>공사계약 통합지원</strong><small>교육행정 업무시스템</small></span>
        </div>
        <nav className="side-nav" aria-label="주요 메뉴">
          <Link className={`nav-item ${active === "home" ? "active" : ""}`} href="/" aria-current={active === "home" ? "page" : undefined}><span className="nav-icon">⌂</span> 홈</Link>
          <Link className={`nav-item ${active === "contracts" ? "active" : ""}`} href="/contracts" aria-current={active === "contracts" ? "page" : undefined}><span className="nav-icon">▤</span> 계약 현황<span className="nav-count">{contractCount}</span></Link>
          <Link className={`nav-item ${active === "knowledge" ? "active" : ""}`} href="/knowledge" aria-current={active === "knowledge" ? "page" : undefined}><span className="nav-icon">⌕</span> 지식관리<span className="phase-chip">검색 가능</span></Link>
        </nav>
        <div className="principle-card">
          <span className="principle-eyebrow">업무 원칙</span>
          <strong>한 번만 입력하고,<br />끝까지 관리합니다.</strong>
          <p>AI가 검토하고 담당자가 결정합니다.</p>
        </div>
        <div className="user-card">
          <span className="avatar">행정</span>
          <span><strong>계약업무 담당자</strong><small>교육행정 · 담당자</small></span>
          <span className="sample-chip">샘플</span>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
