import aliasesSource from "@/data/material-aliases.json";

export type MaterialAlias = {
  standardName: string;
  aliases: string[];
  category: string;
};

export type MaterialItemLike = {
  category?: string | null;
  trade?: string | null;
  itemName?: string | null;
  specification?: string | null;
  unit?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  amount?: number | null;
  sourceText?: string | null;
};

export type StandardizedMaterial = {
  originalName: string;
  originalSpecification: string | null;
  standardName: string;
  normalizedSpecification: string | null;
  category: string | null;
  matchedAlias: string | null;
};

export type G2bMaterialPrice = {
  productName: string;
  specification: string;
  unit: string;
  price: number | null;
  noticeDate: string | null;
  field: string | null;
  priceType: string | null;
  deliveryCondition: string | null;
  matchLabel: "상세규격 일치" | "주요규격 일치" | "품명 일치" | "관련 품목";
  matchScore: number;
};

export const materialAliases = aliasesSource as MaterialAlias[];

export function normalizeMaterialText(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[㎜]/g, "mm")
    .replace(/[ΦØ⌀]/g, "Ø")
    .replace(/[×xX*]/g, "×")
    .replace(/(\d(?:\.\d+)?)\s*[tT]\b/g, "$1T")
    .replace(/\bMM\b/gi, "mm")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣØ.×+/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparable(value: string) {
  return normalizeMaterialText(value).toUpperCase().replace(/[\s×+/().-]/g, "");
}

function comparableSpecificationToken(value: string) {
  return normalizeMaterialText(value).toUpperCase().replace(/\s/g, "");
}

function specificationTokensEqual(wanted: string, actual: string) {
  const left = comparableSpecificationToken(wanted);
  const right = comparableSpecificationToken(actual);
  if (left === right) return true;
  // 견적서 규격에 단위가 생략된 경우 나라장터의 mm 표기와 같은 치수로 비교한다.
  return right === `${left}MM` || left === `${right}MM`;
}

export function extractSpecificationTokens(value: string) {
  const normalized = normalizeMaterialText(value).toUpperCase();
  const matches = normalized.match(/(?:Ø\s*)?\d+(?:\.\d+)?(?:\s*×\s*\d+(?:\.\d+)?){0,3}\s*(?:MM|CM|M|A|T|D|SQ|W|H|L)?|\b(?:VG\d|VP|VU|CAT\d[E]?|CV|F-CV|HIV|MCCB|ELB|ELCB)\b/g) || [];
  return [...new Set(matches.map((token) => token.replace(/\s+/g, "")))];
}

function findAlias(input: string) {
  const haystack = comparable(input);
  let best: { entry: MaterialAlias; alias: string } | null = null;
  for (const entry of materialAliases) {
    for (const alias of entry.aliases) {
      const needle = comparable(alias);
      if (!needle || !haystack.includes(needle)) continue;
      if (!best || needle.length > comparable(best.alias).length) best = { entry, alias };
    }
  }
  return best;
}

export function standardizeMaterial(originalName: string, specification?: string | null): StandardizedMaterial {
  // 견적서 원문은 표시용 originalName으로 보존하고, 조회 문자열만 별도로 정규화한다.
  const normalizedName = normalizeMaterialText(originalName);
  const normalizedSpec = specification ? normalizeMaterialText(specification) : "";
  const match = findAlias(`${normalizedName} ${normalizedSpec}`);
  const tokens = extractSpecificationTokens(`${normalizedName} ${normalizedSpec}`);
  return {
    originalName: originalName.trim(),
    originalSpecification: specification?.trim() || null,
    standardName: match?.entry.standardName || normalizedName,
    normalizedSpecification: tokens.join(" × ") || normalizedSpec || null,
    category: match?.entry.category || null,
    matchedAlias: match?.alias || null,
  };
}

export function buildMaterialSearchQueries(originalName: string, specification?: string | null) {
  const material = standardizeMaterial(originalName, specification);
  const originalFull = normalizeMaterialText(`${originalName} ${specification || ""}`);
  const standardFull = normalizeMaterialText(`${material.standardName} ${material.normalizedSpecification || ""}`);
  const specTokens = extractSpecificationTokens(`${originalName} ${specification || ""}`);
  const primarySpec = specTokens.slice(0, Math.max(1, specTokens.length - 1)).join(" ");
  return [...new Set([
    originalFull,
    standardFull,
    primarySpec ? `${material.standardName} ${primarySpec}` : "",
    material.standardName,
  ].map(normalizeMaterialText).filter(Boolean))];
}

const NON_MATERIAL_PATTERN = /노무비|인건비|경비|보험료|관리비|이윤|부가세|세금|운반비|폐기물|철거|시공비|설치비|공임|일위대가|합계|소계/;
const MATERIAL_CATEGORY_PATTERN = /자재|재료|금속|강재|콘크리트|배관|전기|통신|조명|바닥|타일|도장|방수|단열|창호|철물|위생|기계|냉난방/;

const LABOR_CONTEXT_MARKERS = ["노무비", "인건비", "노임", "직종"];
const LABOR_OCCUPATIONS = new Set([
  "작업반장", "보통인부", "특별인부", "조력공", "제도사", "비계공", "형틀목공", "철근공",
  "철공", "철판공", "철골공", "용접공", "배관공", "도장공", "내선전공", "통신내선공",
  "건축목공", "조적공", "미장공", "타일공", "방수공",
]);
const LABOR_OCCUPATION_SUFFIXES = ["반장", "인부", "기술자", "기사", "목공", "전공", "철공", "용접공", "배관공", "도장공", "미장공", "타일공", "방수공"];

export function isLaborItemForMaterialLookup(item: MaterialItemLike) {
  const name = normalizeMaterialText(item.itemName || "").replace(/\s+/g, "");
  const laborContext = `${item.category || ""} ${item.trade || ""}`;
  return LABOR_CONTEXT_MARKERS.some((marker) => laborContext.includes(marker))
    || LABOR_OCCUPATIONS.has(name)
    || LABOR_OCCUPATION_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

export function isMaterialItem(item: MaterialItemLike) {
  const name = item.itemName?.trim() || "";
  const context = `${item.category || ""} ${item.trade || ""} ${name} ${item.specification || ""} ${item.sourceText || ""}`;
  if (!name || NON_MATERIAL_PATTERN.test(name) || isLaborItemForMaterialLookup(item)) return false;
  return Boolean(findAlias(context) || MATERIAL_CATEGORY_PATTERN.test(`${item.category || ""} ${item.trade || ""}`));
}

export function selectableMaterialItems(items: MaterialItemLike[]) {
  const seen = new Set<string>();
  return items.filter(isMaterialItem).filter((item) => {
    const key = comparable(`${item.itemName || ""} ${item.specification || ""}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scoreMaterialPrice(queryName: string, querySpecification: string | null, row: Omit<G2bMaterialPrice, "matchLabel" | "matchScore">) {
  const standardized = standardizeMaterial(queryName, querySpecification);
  const nameNeedle = comparable(standardized.standardName);
  const originalNameNeedle = comparable(queryName);
  const productName = comparable(row.productName);
  // 규격란에 검색어가 우연히 들어 있는 부속품을 본 품목으로 판정하지 않는다.
  // 예: "철판" 검색 시 규격에 EGI 철판이 적힌 안전펜스는 관련 품목일 뿐이다.
  const nameMatch = Boolean(
    (nameNeedle && (productName.includes(nameNeedle) || nameNeedle.includes(productName))) ||
    (originalNameNeedle && (productName.includes(originalNameNeedle) || originalNameNeedle.includes(productName)))
  );
  const wantedTokens = extractSpecificationTokens(`${queryName} ${querySpecification || ""}`);
  const rowTokens = extractSpecificationTokens(`${row.productName} ${row.specification}`);
  const matched = wantedTokens.filter((token) => rowTokens.some((rowToken) => specificationTokensEqual(token, rowToken))).length;
  const exactSpec = wantedTokens.length > 0 && matched === wantedTokens.length;
  const majorSpec = matched > 0;
  const matchLabel: G2bMaterialPrice["matchLabel"] = exactSpec && nameMatch ? "상세규격 일치" : majorSpec && nameMatch ? "주요규격 일치" : nameMatch ? "품명 일치" : "관련 품목";
  const score = (nameMatch ? 60 : 0) + (exactSpec ? 35 : majorSpec ? 20 : 0) + Math.min(5, matched);
  return { matchLabel, matchScore: score };
}

export function isReliableMaterialPriceMatch(row: G2bMaterialPrice) {
  return row.matchLabel !== "관련 품목" && row.matchScore >= 60;
}
