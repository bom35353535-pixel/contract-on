export type AuditCase = {
  id: string;
  sourceCaseNumber: number;
  title: string;
  summary: string;
  relatedRegulations: string;
  actualCase: string;
  sourceText: string;
  matchReason?: string;
};

export type AuditCaseContext = {
  projectName: string | null;
  constructionType: string | null;
  totalAmount: number | null;
  supplyAmount?: number | null;
  plannedStartDate: string | null;
  plannedCompletionDate: string | null;
};

const SUBSECTION_NAMES = /^(관련\s*(?:규정|법령|근거)|실제\s*감사사례|감사\s*지적(?:사항|내용)?|감사사례|지적(?:사항|내용))$/;
const AUDIT_TITLE_HINT = /(부적정|소홀|미체결|미징구|미부과|미확보|미준수|위반|부당|부적절|미흡|과다|누락|오류|분할|선정|처리|산정)/;

function cleanHeading(value: string) {
  return value.replace(/^\s*(?:감사\s*사례|사례)\s*/i, "").replace(/^\s*(?:제)?\d+\s*(?:번|[.)、:-])?\s*/, "").trim();
}

function plainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_`>#|\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarize(value: string) {
  const text = plainText(value);
  if (!text) return "원문 감사사례의 자세한 내용은 아래에서 확인할 수 있습니다.";
  const sentences = text.match(/[^.!?。]+[.!?。]?/g)?.map((item) => item.trim()).filter(Boolean) || [text];
  const summary = sentences.slice(0, 2).join(" ");
  return summary.length <= 220 ? summary : `${summary.slice(0, 217).trim()}…`;
}

function extractSubsection(body: string, names: RegExp) {
  const headings = [...body.matchAll(/^#{2,6}\s+(.+)$/gm)];
  for (let index = 0; index < headings.length; index += 1) {
    const title = headings[index][1].trim().replace(/[：:]$/, "");
    if (!names.test(title)) continue;
    const start = (headings[index].index || 0) + headings[index][0].length;
    const end = headings[index + 1]?.index ?? body.length;
    return body.slice(start, end).trim();
  }
  return "";
}

export function parseAuditCases(markdown: string): AuditCase[] {
  const headings = [...markdown.matchAll(/^(#{1,3})\s+(.+)$/gm)]
    .map((match) => {
      const rawTitle = match[2].trim();
      const numberMatch = rawTitle.match(/^\s*(?:(?:감사\s*사례|사례)\s*)?(?:제)?(\d+)\s*(?:번|[.)、:-])?/i);
      const title = cleanHeading(rawTitle);
      return { index: match.index || 0, end: (match.index || 0) + match[0].length, level: match[1].length, rawTitle, title, number: numberMatch ? Number(numberMatch[1]) : null };
    })
    .filter((heading) => !SUBSECTION_NAMES.test(heading.title.replace(/[：:]$/, "")) && (heading.number !== null || AUDIT_TITLE_HINT.test(heading.title)));

  return headings.map((heading, index) => {
    const body = markdown.slice(heading.end, headings[index + 1]?.index ?? markdown.length).trim();
    const relatedRegulations = extractSubsection(body, /^관련\s*(?:규정|법령|근거)$/);
    const actualCase = extractSubsection(body, /^(?:실제\s*)?감사사례$|^감사\s*지적(?:사항|내용)?$|^지적(?:사항|내용)$/) || body;
    const sourceCaseNumber = heading.number ?? index + 1;
    return {
      id: `AUDIT_${String(sourceCaseNumber).padStart(2, "0")}`,
      sourceCaseNumber,
      title: heading.title,
      summary: summarize(actualCase),
      relatedRegulations,
      actualCase,
      sourceText: `${heading.rawTitle}\n${body}`,
    };
  });
}

function normalize(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/g, "");
}

function durationDays(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return null;
  return Math.floor((endTime - startTime) / 86_400_000) + 1;
}

function curatedScore(title: string, projectText: string) {
  let score = 0;
  const matchesTitle = (pattern: RegExp, points: number) => { if (pattern.test(title)) score += points; };
  if (/(전기|조명|배선|전기설비)/.test(projectText)) {
    matchesTitle(/전기.*분리발주/, 14); matchesTitle(/도급자\s*선정/, 7); matchesTitle(/시설공사.*업무처리/, 6);
  }
  if (/(소방|감지기|스프링클러|유도등)/.test(projectText)) {
    matchesTitle(/하자담보.*책임기간/, 12); matchesTitle(/도급자\s*선정/, 7); matchesTitle(/(?:전기|소방).*분리발주/, 9);
  }
  if (/철거/.test(projectText)) {
    matchesTitle(/건설폐기물/, 14); matchesTitle(/설계변경/, 10); matchesTitle(/시설공사.*업무처리/, 7);
  }
  if (/(인테리어|환경개선|교실개선|도서실개선|화장실개선|실내공사)/.test(projectText)) {
    matchesTitle(/설계.*계약업무.*소홀/, 11); matchesTitle(/분할\s*수의계약/, 9); matchesTitle(/도급자\s*선정/, 8); matchesTitle(/설계변경/, 8);
  }
  if (/(방수|도장|페인트)/.test(projectText)) {
    matchesTitle(/도급자\s*선정/, 10); matchesTitle(/설계변경/, 9); matchesTitle(/분할\s*수의계약/, 8);
  }
  if (/(특허|신기술|특허공법|신공법)/.test(projectText)) matchesTitle(/특허기술.*협약.*미체결/, 16);
  return score;
}

function amountScore(item: AuditCase, context: AuditCaseContext) {
  const amount = context.totalAmount;
  if (!amount && !context.supplyAmount) return 0;
  const source = normalize(item.sourceText);
  const title = normalize(item.title);
  const exceedsTwoTenMillionEstimatedPrice =
    (context.supplyAmount !== null && context.supplyAmount !== undefined && context.supplyAmount > 20_000_000)
    || (amount !== null && amount >= 22_000_000);
  if (
    exceedsTwoTenMillionEstimatedPrice
    && /시설공사설계계약업무처리소홀/.test(title)
    && /(2천만원|20000000)/.test(source)
  ) return 30;
  if (!amount) return 0;
  if (amount > 10_000_000 && /인지세/.test(title) && /(1천만원|10000000)/.test(source)) return 7;
  if (amount >= 15_000_000 && /(?:면허|도급자선정)/.test(title) && /(1천5백만원|15000000)/.test(source)) return 7;
  if (amount >= 20_000_000 && /(?:수의계약|산업안전보건관리비)/.test(title) && /(2천만원|20000000)/.test(source)) return 6;
  if (amount > 30_000_000 && /준공검사조서/.test(title) && /(3천만원|30000000)/.test(source)) return 7;
  if (amount >= 50_000_000 && /계약보증/.test(title) && /(5천만원|50000000)/.test(source)) return 7;
  return 0;
}

function buildMatchReason(item: AuditCase, context: AuditCaseContext, matchedTokens: string[]) {
  const title = normalize(item.title);
  const amount = context.totalAmount;
  const exceedsTwoTenMillionEstimatedPrice =
    (context.supplyAmount !== null && context.supplyAmount !== undefined && context.supplyAmount > 20_000_000)
    || (amount !== null && amount >= 22_000_000);

  if (exceedsTwoTenMillionEstimatedPrice && /시설공사설계계약업무처리소홀/.test(title)) {
    return "현재 공사금액이 추정가격 2천만 원 초과 여부를 확인해야 하는 구간이므로 계약방법과 원가계산 검토에 참고할 사례입니다.";
  }
  if (/철거/.test(normalize(`${context.projectName || ""} ${context.constructionType || ""}`)) && /건설폐기물/.test(title)) {
    return "현재 공사명에 철거 작업이 포함되어 있어 건설폐기물 처리와 정산 과정에서 발생한 지적사례를 안내합니다.";
  }
  if (/전기|조명|배선/.test(normalize(`${context.projectName || ""} ${context.constructionType || ""}`)) && /전기.*분리발주/.test(title)) {
    return "현재 공사에 전기·조명·배선 작업이 포함되어 있어 전기공사 분리발주 여부를 확인할 때 참고할 사례입니다.";
  }
  if (/소방|감지기|스프링클러|유도등/.test(normalize(`${context.projectName || ""} ${context.constructionType || ""}`)) && /하자담보|분리발주/.test(title)) {
    return "현재 공사에 소방 관련 작업이 포함되어 있어 분리발주 또는 하자담보 기준을 확인할 때 참고할 사례입니다.";
  }
  if (/인테리어|환경개선|교실개선|도서실개선|화장실개선|실내공사/.test(normalize(`${context.projectName || ""} ${context.constructionType || ""}`))) {
    return "현재 공사가 실내 환경개선 성격이므로 설계·업체선정·계약절차에서 발생한 유사 지적사례를 안내합니다.";
  }
  if (matchedTokens.length > 0) {
    return `현재 공사명·공종의 핵심어(${matchedTokens.slice(0, 2).join(", ")})가 이 사례의 공사내용과 일치하여 안내합니다.`;
  }
  if (amountScore(item, context) > 0) {
    return "현재 공사금액이 이 감사사례에서 다루는 계약·정산 기준과 관련되어 있어 안내합니다.";
  }
  return "현재 공사의 공종과 업무단계가 이 감사사례의 지적내용과 관련되어 있어 참고 사례로 안내합니다.";
}

export function selectRelevantAuditCases(cases: AuditCase[], context: AuditCaseContext, limit = 5) {
  const projectText = normalize(`${context.projectName || ""} ${context.constructionType || ""}`);
  const tokens = [`${context.projectName || ""}`, `${context.constructionType || ""}`]
    .join(" ").split(/[^0-9a-z가-힣]+/i).map(normalize).filter((token) => token.length >= 2 && !["공사", "학교", "기타공사", "건축공사"].includes(token));
  const days = durationDays(context.plannedStartDate, context.plannedCompletionDate);
  return cases.map((item) => {
    const haystack = normalize(`${item.title} ${item.sourceText}`);
    let score = curatedScore(normalize(item.title), projectText) + amountScore(item, context);
    const matchedTokens = tokens.filter((token) => haystack.includes(token));
    for (const token of matchedTokens) score += normalize(item.title).includes(token) ? 6 : 2;
    if (days !== null && /공사기간|준공기한|지연/.test(item.sourceText) && /기간|준공|지연/.test(projectText)) score += 3;
    return { item, score, matchedTokens };
  }).filter(({ score }) => score >= 6).sort((a, b) => b.score - a.score || a.item.sourceCaseNumber - b.item.sourceCaseNumber).slice(0, Math.max(1, Math.min(limit, 5))).map(({ item, matchedTokens }) => ({
    ...item,
    matchReason: buildMatchReason(item, context, matchedTokens),
  }));
}
