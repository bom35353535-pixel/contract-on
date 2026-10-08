import type { AuditCase } from "@/lib/audit-cases";

type DetailSection = "regulations" | "case";

const SECTION_HEADING: Record<DetailSection, RegExp> = {
  regulations: /^(?:관련\s*(?:규정|법령|근거)|적용\s*규정)\s*[:：]?\s*$/,
  case: /^(?:(?:실제\s*)?감사\s*사례|감사\s*지적(?:사항|내용)?|지적\s*사항|사례)\s*[:：]?\s*$/,
};

const SECTION_PREFIX: Record<DetailSection, RegExp> = {
  regulations: /^(?:관련\s*(?:규정|법령|근거)|적용\s*규정)\s*[:：]?\s*/,
  case: /^(?:(?:실제\s*)?감사\s*사례|감사\s*지적(?:사항|내용)?|지적\s*사항|사례)\s*[:：]?\s*/,
};

function cleanAuditLines(value: string, section: DetailSection) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(?:-{3,}|\*{3,}|_{3,})$/.test(line) && !/^```/.test(line))
    .map((line) => line
      .replace(/^#{1,6}\s*/, "")
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\\+$/, "")
      .trim())
    .filter((line) => line && !SECTION_HEADING[section].test(line))
    .map((line) => line.replace(SECTION_PREFIX[section], "").trim())
    .filter(Boolean);
}

function AuditText({ value, section }: { value: string; section: DetailSection }) {
  const lines = cleanAuditLines(value, section);
  return <div className="audit-detail-body">
    {lines.map((line, index) => <p key={`${index}-${line.slice(0, 24)}`}>{line}</p>)}
  </div>;
}

export function RelatedAuditCases({ cases, sourceStatus }: { cases: AuditCase[]; sourceStatus: "READY" | "MISSING" | "INVALID" }) {
  return <section className="related-audit-cases" aria-labelledby="related-audit-title">
    <div className="related-audit-heading">
      <span className="section-kicker">등록자료 참고</span>
      <h3 id="related-audit-title">관련 감사사례</h3>
      <p>현재 공사정보와 관련성이 높은 감사 지적사례입니다.</p>
    </div>
    {sourceStatus !== "READY" ? <p className="audit-case-empty">[확인 필요] 등록된 감사사례 자료를 불러오지 못했습니다.</p>
      : cases.length === 0 ? <p className="audit-case-empty">현재 공사정보와 직접 관련된 감사사례가 없습니다.</p>
      : <div className="audit-case-list">{cases.map((item, index) => <article className={`audit-case-item${index === 0 ? " priority" : ""}`} key={item.id}>
        <div className="audit-case-title-row">
          <span className="audit-case-rank">{index + 1}</span>
          <h4>{item.title}</h4>
          {index === 0 && <span className="audit-priority-badge">우선 확인</span>}
        </div>
        <div className="audit-match-reason">
          <strong>이 사례를 보여주는 이유</strong>
          <span>{item.matchReason || "현재 공사의 공종과 업무단계가 이 감사사례의 지적내용과 관련되어 있어 안내합니다."}</span>
        </div>
        <details>
          <summary>자세히 보기 <span aria-hidden="true">⌄</span></summary>
          <div className="audit-case-detail">
            {item.relatedRegulations && <section className="audit-detail-panel audit-regulations" aria-label="관련 규정">
              <header className="audit-detail-header"><h5>관련 규정</h5></header>
              <AuditText value={item.relatedRegulations} section="regulations" />
            </section>}
            <section className="audit-detail-panel audit-finding" aria-label="실제 감사사례">
              <header className="audit-detail-header"><h5>실제 감사사례</h5></header>
              <AuditText value={item.actualCase} section="case" />
            </section>
          </div>
        </details>
      </article>)}</div>}
    <small className="audit-source-note">근거자료: 공사계약 Q&amp;A 및 사례연습(2025. 6.)_감사사례만.md</small>
  </section>;
}
