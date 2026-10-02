import type { ReactNode } from "react";
import { FloatingKnowledgeChat } from "@/components/FloatingKnowledgeChat";

type ActiveSection = "home" | "contracts" | "knowledge" | "assistant" | "navigator";

export function AppShell({ children, active, contractCount }: { children: ReactNode; active: ActiveSection; contractCount: number }) {
  return (
    <div className="app-shell">
      <header className="global-header">
        <div className="brand">
          <span className="brand-mark" aria-label="계약ON">
            <span className="brand-contract">계약</span>
            <span className="brand-on">ON</span>
          </span>
          <span><strong>AI기반 학교 공사계약 도우미</strong></span>
        </div>
        <nav className="primary-tabs" aria-label="주요 업무">
          <a className={`primary-tab ${active === "home" ? "active" : ""}`} href="/" aria-current={active === "home" ? "page" : undefined}>견적 검토</a>
          <a className={`primary-tab ${active === "contracts" ? "active" : ""}`} href="/contracts" aria-current={active === "contracts" ? "page" : undefined}>계약·공사 관리<span className="nav-count">{contractCount}</span></a>
          <a className={`primary-tab ${active === "assistant" ? "active" : ""}`} href="/assistant" aria-current={active === "assistant" ? "page" : undefined}>AI 업무비서</a>
          <a className={`primary-tab ${active === "knowledge" ? "active" : ""}`} href="/knowledge" aria-current={active === "knowledge" ? "page" : undefined}>지식관리<span className="phase-chip">검색 가능</span></a>
          <a className={`primary-tab ${active === "navigator" ? "active" : ""}`} href="/navigator" aria-current={active === "navigator" ? "page" : undefined}>서울교육 사이트 찾기</a>
        </nav>
      </header>
      <main className="main-content">{children}</main>
      <FloatingKnowledgeChat />
    </div>
  );
}
