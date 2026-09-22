export type FieldCheckImportance = "normal" | "high";
export type FieldCheckStatus = "PENDING" | "NORMAL" | "NEEDS_REVIEW" | "NOT_APPLICABLE";

export type FieldChecklistDefinition = {
  id: string;
  category: string;
  group: string;
  title: string;
  importance: FieldCheckImportance;
  keywords: string[];
  enabled: true;
};

export type FieldChecklistPhoto = { id: string; name: string; storageKey: string };
export type FieldChecklistDetail = {
  templateId: string;
  templateVersion: number;
  category: string;
  group: string;
  importance: FieldCheckImportance;
  order: number;
  memo: string;
  actionNote: string;
  resolved: boolean;
  photos: FieldChecklistPhoto[];
};

export const FIELD_CHECKLIST_TEMPLATE_VERSION = 3;

const HIGH_RISK_TERMS = ["계약내용과", "계약내역 및 설계내용", "추가 작업", "임의", "변경이 필요한", "규격이 계약내용", "수량", "공법"];

function toPoliteChecklistTitle(title: string) {
  if (title.endsWith("확인해 주세요.")) return title;
  return title
    .replace(/있지는 않은가$/, "있지는 않나요?")
    .replace(/있지 않은가$/, "있지 않나요?")
    .replace(/있는가$/, "있나요?")
    .replace(/않았는가$/, "않았나요?")
    .replace(/않은가$/, "않나요?")
    .replace(/없는가$/, "없나요?")
    .replace(/했는가$/, "했나요?")
    .replace(/되었는가$/, "되었나요?")
    .replace(/하는가$/, "하나요?")
    .replace(/한가$/, "한가요?")
    .replace(/인가$/, "인가요?")
    .replace(/는가$/, "나요?");
}

function section(prefix: string, category: string, group: string, titles: string[], keywords: string[] = []) {
  return titles.map((sourceTitle, index): FieldChecklistDefinition => {
    const title = toPoliteChecklistTitle(sourceTitle);
    return ({
    id: `${prefix}_${String(index + 1).padStart(3, "0")}`,
    category,
    group,
    title,
    importance: HIGH_RISK_TERMS.some((term) => title.includes(term)) ? "high" : "normal",
    keywords,
    enabled: true,
    });
  });
}

export const COMMON_FIELD_CHECKLIST: FieldChecklistDefinition[] = [
  ...section("COMMON_SCHEDULE", "공통", "공정", [
    "예정된 공정대로 작업이 진행되고 있는가",
    "현재 진행상황을 볼 때 준공기한 내 완료가 가능한가",
    "특별한 사유 없이 공사가 지연되거나 장기간 중단되어 있지는 않은가",
  ]),
  ...section("COMMON_CONTRACT", "공통", "계약내용 및 시공", [
    "계약내역 및 설계내용과 동일하게 시공하고 있는가",
    "계약에 없는 추가 작업을 임의로 하고 있지는 않은가",
    "설계·수량·규격·공법 등이 임의로 변경되지 않았는가",
    "현장에서 변경이 필요한 사항이 발생하지 않았는가",
  ]),
  ...section("COMMON_MATERIAL", "공통", "자재", [
    "계약한 규격 및 제품의 자재를 사용하고 있는가",
    "현장에 반입된 주요 자재의 규격 및 수량을 확인했는가",
    "계약내용과 다른 자재로 임의 대체하지 않았는가",
  ]),
  ...section("COMMON_QUALITY", "공통", "품질 및 환경", [
    "디자인과 색상이 학교 공간 및 사용 목적에 적합한가",
    "사용된 자재가 친환경 자재이며 관련 표시·인증자료가 있는가",
  ]),
  ...section("COMMON_RECORD", "공통", "기록", [
    "주요 공정의 작업 전·중·후 사진을 촬영하고 있는가",
    "천장 내부, 벽체 내부, 배관, 배선 등 마감 후 확인하기 어려운 부분을 시공 전에 사진으로 남겼는가",
    "준공검사 시 확인이 필요한 주요 작업 내용을 기록하고 있는가",
  ]),
  ...section("COMMON_SAFETY", "공통", "현장 안전", [
    "작업구역이 학생 및 교직원의 이동 동선과 적절히 분리되어 있는가",
    "공사구역 출입통제 및 안전표지가 설치되어 있는가",
    "작업자가 필요한 안전보호구를 착용하고 있는가",
    "공사 자재 및 장비가 학생·교직원의 통행에 위험을 주지 않도록 관리되고 있는가",
    "소음·분진·악취 등이 학교 운영에 미치는 영향을 최소화하고 있는가",
    "작업 후 현장 정리 및 청소가 적절히 이루어지고 있는가",
    "폐기물 및 철거 잔재가 안전하게 보관·반출되고 있는가",
    "모서리·돌출부·단차 등 학생이 다칠 수 있는 위험요소가 없는가",
  ]),
];

const TRADE_SECTIONS: Record<string, FieldChecklistDefinition[]> = {
  "건축·인테리어": section("ARCH", "건축·인테리어", "건축공사", [
    "철거 범위가 계약내용과 일치하는가", "철거 대상이 아닌 기존 시설물이 보호되고 있는가",
    "벽체·천장·바닥 등 주요 자재의 규격이 계약내용과 일치하는가", "마감 후 확인하기 어려운 내부 시공상태를 사진으로 남겼는가",
    "벽체·바닥·천장의 수평 및 수직 상태가 적절한가", "들뜸·균열·파손·마감불량 등이 없는가",
    "공사 중 기존 시설물이 훼손되지 않았는가", "문·창호·가구 등 주변 시설과 간섭되는 부분이 없는가",
  ], ["건축", "인테리어", "환경개선"]),
  "전기": section("ELEC", "전기", "전기공사", [
    "작업 전 필요한 경우 전원이 안전하게 차단되어 있는가", "감전 및 누전 방지조치가 되어 있는가",
    "배선·케이블·차단기 등의 규격이 계약내용과 일치하는가", "조명·콘센트·스위치 등의 제품 규격이 계약내용과 일치하는가",
    "설치 위치가 설계 또는 협의한 위치와 일치하는가", "천장 내부 등 마감 후 확인하기 어려운 배선 상태를 사진으로 남겼는가",
    "배선 정리 및 결선 상태가 적절한가", "설치 후 기기가 정상적으로 작동하는가",
  ], ["전기", "배선", "조명", "LED"]),
  "기계·설비": section("MECH", "기계·설비", "기계·설비공사", [
    "배관 및 설비기기의 규격이 계약내용과 일치하는가", "배관 연결부에 누수 가능성이 없는가",
    "매립되는 배관을 마감 전에 사진으로 남겼는가", "설비기기의 설치 위치가 적절한가",
    "장비 및 배관이 견고하게 고정되어 있는가", "밸브 등 유지관리 장치가 접근 가능한 위치에 설치되어 있는가",
    "설치 후 정상작동 여부를 확인했는가", "소음·진동·누수 등의 이상이 없는가",
  ], ["기계", "설비", "배관", "냉난방"]),
  "방수": section("WATERPROOF", "방수", "방수공사", [
    "기존 방수층 철거 및 바탕정리가 적절하게 이루어졌는가", "방수재 제품 및 규격이 계약내용과 일치하는가",
    "시공 전 바탕면의 상태를 확인했는가", "방수층 시공과정을 사진으로 남겼는가",
    "배수구·모서리·벽체 접합부 등 취약부분이 적절하게 시공되고 있는가", "방수층 훼손 여부를 확인했는가",
    "필요한 경우 담수시험 등 누수 확인을 실시했는가", "보호층 및 마감 시공 전에 방수상태를 확인했는가",
  ], ["방수", "옥상", "누수"]),
  "도장": section("PAINT", "도장", "도장공사", [
    "도장 전 기존 면의 바탕정리가 적절한가", "도료 제품·규격·색상이 계약내용과 일치하는가",
    "계약내용에 따른 도장 횟수를 준수하고 있는가", "도장 누락 부분이 없는가",
    "흘러내림·들뜸·얼룩 등 마감불량이 없는가", "주변 시설물에 도료가 묻지 않도록 보호조치가 되어 있는가",
    "충분한 건조시간을 확보하고 있는가",
  ], ["도장", "페인트"]),
  "창호": section("WINDOW", "창호", "창호공사", [
    "창호 및 유리의 제품·규격이 계약내용과 일치하는가", "설치 위치 및 방향이 적절한가",
    "창호의 수직·수평 상태가 적절한가", "창문의 개폐가 원활한가", "틈새·누수 가능성이 없는가",
    "실리콘 및 방수 마감상태가 적절한가", "유리·프레임 등에 파손이나 스크래치가 없는가",
  ], ["창호", "창문", "유리"]),
  "철거": section("DEMO", "철거", "철거공사", [
    "철거 범위가 계약내용과 일치하는가", "철거 대상이 아닌 시설물이 적절하게 보호되고 있는가",
    "필요한 전기·가스·급수 등이 안전하게 차단되어 있는가", "학생 및 교직원의 접근을 적절히 통제하고 있는가",
    "분진 및 소음 방지조치가 되어 있는가", "철거 폐기물이 적절하게 분리 및 반출되고 있는가",
    "철거 과정에서 기존 구조물이나 설비가 불필요하게 훼손되지 않았는가",
  ], ["철거"]),
  "통신": section("COMM", "통신", "통신공사", [
    "케이블 및 통신장비 규격이 계약내용과 일치하는가", "케이블 포설 경로가 적절한가",
    "배선이 정리되어 있고 식별 가능하도록 관리되고 있는가", "천장 내부 등 마감 후 확인이 어려운 부분을 사진으로 남겼는가",
    "기존 네트워크 또는 통신설비에 영향을 주지 않는가", "설치 후 통신 및 장비가 정상적으로 작동하는가",
  ], ["통신", "방송", "네트워크"]),
  "소방": section("FIRE", "소방", "소방공사", [
    "소방설비 제품 및 규격이 계약내용과 일치하는가", "감지기·스프링클러·유도등 등의 설치 위치가 적절한가",
    "기존 소방시설의 기능을 임의로 중단하거나 훼손하지 않았는가", "배관 및 배선 상태가 적절한가",
    "천장 마감 전 배관 및 배선 상태를 사진으로 남겼는가", "설치 후 정상 작동 여부를 확인했는가",
  ], ["소방", "감지기", "스프링클러", "유도등"]),
  "포장·외부환경": section("EXTERIOR", "포장·외부환경", "포장·외부환경공사", [
    "철거 및 굴착 범위가 계약내용과 일치하는가", "바닥 기초 및 다짐상태가 적절한가",
    "포장재의 재질·두께·규격이 계약내용과 일치하는가", "배수 방향 및 구배가 적절한가",
    "맨홀·배수구 등 주변 마감상태가 적절한가", "단차 등 학생 보행에 위험한 부분이 없는가",
    "시공 후 주변 시설물이 훼손되지 않았는가",
  ], ["포장", "운동장", "외부환경", "배수"]),
  "조경": section("LANDSCAPE", "조경", "조경공사", [
    "수목 및 자재의 종류·규격·수량이 계약내용과 일치하는가", "식재 위치가 계획과 일치하는가",
    "식재 깊이 및 지지대 설치가 적절한가", "기존 수목 및 시설물이 보호되고 있는가",
    "토사 및 잔재가 통행에 방해되지 않게 관리되고 있는가", "작업 후 주변이 정리되어 있는가",
  ], ["조경", "수목", "식재"]),
};

const TYPE_MAP: Record<string, string[]> = {
  "건축공사": ["건축·인테리어"], "전기공사": ["전기"], "소방공사": ["소방"], "방송통신공사": ["통신"],
};

const PROJECT_RULES: Array<[RegExp, string[]]> = [
  [/화장실/, ["건축·인테리어", "기계·설비", "전기"]],
  [/(?:LED|조명|전기|배선|콘센트)/i, ["전기"]],
  [/(?:옥상|방수|누수)/, ["방수"]],
  [/(?:냉난방|냉방|난방|보일러|배관|설비)/, ["기계·설비", "전기"]],
  [/(?:도장|페인트)/, ["도장"]], [/(?:창호|창문|유리)/, ["창호"]], [/(?:철거)/, ["철거"]],
  [/(?:통신|방송|네트워크)/, ["통신"]], [/(?:소방|감지기|스프링클러|유도등)/, ["소방"]],
  [/(?:포장|운동장|외부환경)/, ["포장·외부환경"]], [/(?:조경|수목|식재)/, ["조경"]],
  [/(?:건축|인테리어|환경개선)/, ["건축·인테리어"]],
];

function normalize(value: string) { return value.toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/g, ""); }

export function getApplicableFieldChecklist(constructionType: string, projectName: string) {
  const categories = new Set(TYPE_MAP[constructionType] || []);
  for (const [pattern, matches] of PROJECT_RULES) if (pattern.test(projectName)) matches.forEach((match) => categories.add(match));
  const combined = [...COMMON_FIELD_CHECKLIST, ...[...categories].flatMap((category) => TRADE_SECTIONS[category] || [])];
  const unique = new Map<string, FieldChecklistDefinition>();
  for (const item of combined) if (!unique.has(normalize(item.title))) unique.set(normalize(item.title), item);
  return { categories: [...categories], items: [...unique.values()] };
}

export function createFieldChecklistDetail(item: FieldChecklistDefinition, order: number): FieldChecklistDetail {
  return { templateId: item.id, templateVersion: FIELD_CHECKLIST_TEMPLATE_VERSION, category: item.category, group: item.group, importance: item.importance, order, memo: "", actionNote: "", resolved: false, photos: [] };
}

export function parseFieldChecklistDetail(value: string): FieldChecklistDetail {
  try {
    const parsed = JSON.parse(value) as Partial<FieldChecklistDetail>;
    return {
      templateId: parsed.templateId || "LEGACY", templateVersion: Number(parsed.templateVersion || 1), category: parsed.category || "공통", group: parsed.group || "기타",
      importance: parsed.importance === "high" ? "high" : "normal", order: Number(parsed.order || 0), memo: parsed.memo || "",
      actionNote: parsed.actionNote || "", resolved: Boolean(parsed.resolved), photos: Array.isArray(parsed.photos) ? parsed.photos : [],
    };
  } catch {
    return { templateId: "LEGACY", templateVersion: 1, category: "공통", group: "기타", importance: "normal", order: 0, memo: value, actionNote: "", resolved: false, photos: [] };
  }
}

export function getReviewGuidance(title: string) {
  if (title.includes("추가 작업")) return { title: "추가 작업이 발생했습니다.", body: "계약에 포함된 작업인지 확인하고 필요한 경우 계약담당자와 변경계약 여부를 검토하세요." };
  if (/자재|제품/.test(title)) return { title: "계약내용과 다른 자재 가능성이 있습니다.", body: "제품·규격을 계약내역과 비교하고 계약담당자와 확인하세요." };
  return { title: "계약내용과 다른 시공 가능성이 있습니다.", body: "현장에서 업체와 구두로만 처리하지 말고 계약내역 및 설계변경 필요 여부를 확인하세요." };
}
