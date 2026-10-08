import { env } from "cloudflare:workers";
import {
  buildMaterialSearchQueries,
  isReliableMaterialPriceMatch,
  normalizeMaterialText,
  scoreMaterialPrice,
  standardizeMaterial,
  type G2bMaterialPrice,
} from "@/lib/material-price";

export const runtime = "edge";

const API_ROOT = "https://apis.data.go.kr/1230000/ao/PriceInfoService";
const SOURCE_URL = "https://www.data.go.kr/data/15129415/openapi.do";
const TOTAL_ENDPOINT = "getPriceInfoListFcltyCmmnMtrilTotal";
const FIELD_ENDPOINTS = {
  civil: "getPriceInfoListFcltyCmmnMtrilEngrk",
  building: "getPriceInfoListFcltyCmmnMtrilBildng",
  mechanical: "getPriceInfoListFcltyCmmnMtrilMchnEqp",
  electrical: "getPriceInfoListFcltyCmmnMtrilElctyIrmc",
} as const;
const AUTH_CODES = new Set(["20", "30", "31", "32", "33"]);
const CACHE_TTL = 30 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: MaterialPriceResponse }>();

type RawItem = Record<string, unknown>;
type MaterialPriceResponse = {
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

class UpstreamError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

function serviceKey() {
  const bindings = env as unknown as Record<string, string | undefined>;
  const stored = bindings.DATA_GO_KR_SERVICE_KEY?.trim() || bindings.DATA_GO_KR_API_KEY?.trim();
  if (!stored) return null;
  try { return decodeURIComponent(stored); } catch { return stored; }
}

function stringValue(item: RawItem, key: string) {
  const value = item[key];
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function numberValue(item: RawItem, key: string) {
  const value = String(item[key] ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function itemArray(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as RawItem : {};
  const response = root.response && typeof root.response === "object" ? root.response as RawItem : {};
  const body = response.body && typeof response.body === "object" ? response.body as RawItem : {};
  const container = body.items;
  const candidate = container && typeof container === "object" && !Array.isArray(container)
    ? (container as RawItem).item ?? container
    : container;
  if (Array.isArray(candidate)) return candidate.filter((item): item is RawItem => Boolean(item && typeof item === "object"));
  if (candidate && typeof candidate === "object") return [candidate as RawItem];
  return [];
}

function responseCode(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as RawItem : {};
  const gateway = root.OpenAPI_ServiceResponse && typeof root.OpenAPI_ServiceResponse === "object" ? root.OpenAPI_ServiceResponse as RawItem : {};
  const common = gateway.cmmMsgHeader && typeof gateway.cmmMsgHeader === "object" ? gateway.cmmMsgHeader as RawItem : {};
  if (Object.keys(common).length) return { code: String(common.returnReasonCode ?? ""), message: String(common.returnAuthMsg ?? common.errMsg ?? "") };
  const response = root.response && typeof root.response === "object" ? root.response as RawItem : {};
  const header = response.header && typeof response.header === "object" ? response.header as RawItem : {};
  return { code: String(header.resultCode ?? ""), message: String(header.resultMsg ?? "") };
}

function mapRows(items: RawItem[], rankingName: string, rankingSpecification: string | null) {
  return items.map((item) => {
    const base = {
      productName: stringValue(item, "prdctClsfcNoNm") || "[품명 확인 필요]",
      specification: stringValue(item, "krnPrdctNm") || "[규격 확인 필요]",
      unit: stringValue(item, "unit") || "-",
      price: numberValue(item, "prce"),
      noticeDate: stringValue(item, "nticeDt") || null,
      field: stringValue(item, "bsnsDivNm") || null,
      priceType: stringValue(item, "prceDiv") || null,
      deliveryCondition: stringValue(item, "dlvryCndtnNm") || null,
    };
    return { ...base, ...scoreMaterialPrice(rankingName, rankingSpecification, base) };
  });
}

function deduplicate(rows: G2bMaterialPrice[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.productName}|${row.specification}|${row.unit}|${row.price}|${row.noticeDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.matchScore - a.matchScore || (b.noticeDate || "").localeCompare(a.noticeDate || ""));
}

async function fetchOfficial(endpoint: string, params: Record<string, string>, key: string) {
  const url = new URL(`${API_ROOT}/${endpoint}`);
  url.searchParams.set("ServiceKey", key);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "999");
  url.searchParams.set("type", "json");
  for (const [name, value] of Object.entries(params)) if (value) url.searchParams.set(name, value);

  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new UpstreamError("조달청 가격정보 조회 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", 504);
    throw new UpstreamError("조달청 가격정보 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  const text = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new UpstreamError("조달청 가격정보 서버가 올바른 JSON을 반환하지 않았습니다."); }
  const result = responseCode(payload);
  if (response.status === 429 || result.code === "22" || result.code === "23") throw new UpstreamError("조달청 API 호출 한도를 초과했습니다. 잠시 후 다시 조회해 주세요.", 429);
  if (response.status === 401 || response.status === 403 || AUTH_CODES.has(result.code)) {
    throw new UpstreamError("가격정보현황서비스 인증키가 없거나 활용신청 승인이 확인되지 않습니다. 공공데이터포털에서 해당 API의 활용신청 상태를 확인해 주세요.", 503);
  }
  if (!response.ok) throw new UpstreamError(`조달청 가격정보 서버 오류가 발생했습니다(HTTP ${response.status}).`);
  if (result.code && result.code !== "00" && result.code !== "0" && result.code !== "03") throw new UpstreamError(`조달청 가격정보 조회 오류가 발생했습니다(${result.code}${result.message ? `: ${result.message}` : ""}).`);
  return itemArray(payload);
}

function endpointsFor(category: string | null) {
  if (category && /전기|정보통신|조명/.test(category)) return [FIELD_ENDPOINTS.electrical, FIELD_ENDPOINTS.building];
  if (category && /배관|위생|기계|냉난방/.test(category)) return [FIELD_ENDPOINTS.mechanical, FIELD_ENDPOINTS.building];
  if (category && /콘크리트|외부/.test(category)) return [FIELD_ENDPOINTS.civil, FIELD_ENDPOINTS.building];
  if (category && /천장|벽체|목재|판재|바닥|도장|방수|단열|창호|문|철물/.test(category)) return [FIELD_ENDPOINTS.building];
  return [FIELD_ENDPOINTS.building, FIELD_ENDPOINTS.civil, FIELD_ENDPOINTS.mechanical, FIELD_ENDPOINTS.electrical];
}

function dateValue(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

async function fetchAcross(endpoints: string[], params: Record<string, string>, key: string) {
  const settled = await Promise.allSettled(endpoints.map((endpoint) => fetchOfficial(endpoint, params, key)));
  const rows = settled.flatMap((entry) => entry.status === "fulfilled" ? entry.value : []);
  const failures = settled.filter((entry): entry is PromiseRejectedResult => entry.status === "rejected");
  const blocking = failures.find((entry) => entry.reason instanceof UpstreamError && [429, 503].includes(entry.reason.status));
  if (blocking) throw blocking.reason;
  if (!rows.length && failures.length === endpoints.length) throw failures[0].reason;
  return rows;
}

async function queryPrices(originalName: string, specification: string | null, manualQuery: string | null, key: string) {
  const standardized = standardizeMaterial(originalName, specification);
  const rankingName = manualQuery || originalName;
  const rankingSpecification = manualQuery ? null : specification;
  const rankingStandardized = standardizeMaterial(rankingName, rankingSpecification);
  const queries = manualQuery
    ? buildMaterialSearchQueries(manualQuery, null)
    : buildMaterialSearchQueries(originalName, specification);
  const collected: RawItem[] = [];
  const now = new Date();
  const begin = new Date(now);
  begin.setUTCDate(begin.getUTCDate() - 550);

  let recent: RawItem[] = [];
  try {
    recent = await fetchOfficial(TOTAL_ENDPOINT, {
      inqryDiv: "1",
      inqryBgnDate: dateValue(begin),
      inqryEndDate: dateValue(now),
    }, key);
  } catch (error) {
    // 종합 조회의 일자 범위 오류·일시 장애는 분야별 품명 조회로 보완한다.
    if (error instanceof UpstreamError && [429, 503].includes(error.status)) throw error;
  }
  const productNameQueries = [...new Set([
    rankingStandardized.standardName,
    normalizeMaterialText(rankingName),
  ].filter(Boolean))];
  const comparableProductNames = productNameQueries.map((query) => normalizeMaterialText(query).toUpperCase().replace(/\s/g, ""));
  collected.push(...recent.filter((item) => {
    const value = normalizeMaterialText(stringValue(item, "prdctClsfcNoNm")).toUpperCase().replace(/\s/g, "");
    return comparableProductNames.some((query) => value.includes(query) || query.includes(value));
  }));

  const endpoints = endpointsFor(rankingStandardized.category || standardized.category);
  // 종합 조회는 최대 건수 때문에 일부 규격이 빠질 수 있으므로 분야별 품명 결과를 항상 합친다.
  let fieldRowsFound = false;
  for (const query of productNameQueries) {
    const rows = await fetchAcross(endpoints, { prdctClsfcNoNm: query }, key);
    collected.push(...rows);
    if (rows.length) {
      fieldRowsFound = true;
      break;
    }
  }
  // 공식 품명 조회가 비었을 때에만 규격 필드 검색을 보완 수단으로 사용한다.
  if (!fieldRowsFound) {
    for (const query of productNameQueries) {
      const rows = await fetchAcross(endpoints, { krnPrdctNm: query }, key);
      collected.push(...rows);
      if (rows.length) break;
    }
  }
  const ranked = deduplicate(mapRows(collected, rankingName, rankingSpecification));
  // 규격에만 검색어가 포함된 부속품·복합품은 일치 결과로 제시하지 않는다.
  const reliable = ranked.filter(isReliableMaterialPriceMatch);
  return { standardized, queries, results: reliable.slice(0, 30) };
}

function errorResponse(message: string, status = 503) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const originalName = params.get("original")?.trim().slice(0, 180) || "";
  const specification = params.get("spec")?.trim().slice(0, 180) || null;
  const manualQuery = params.get("q")?.trim().slice(0, 180) || null;
  if (!originalName) return errorResponse("조회할 견적서 자재명이 없습니다.", 400);
  if (manualQuery !== null && manualQuery.length < 2) return errorResponse("검색어를 2자 이상 입력해 주세요.", 400);
  const key = serviceKey();
  if (!key) return errorResponse("공공데이터포털 가격정보 API 인증키가 설정되지 않았습니다. 관리자에게 문의해 주세요.");

  const cacheKey = normalizeMaterialText(`${originalName}|${specification || ""}|${manualQuery || ""}`).toUpperCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json({ ...cached.value, cached: true }, { headers: { "cache-control": "private, max-age=300" } });
  }

  try {
    const found = await queryPrices(originalName, specification, manualQuery, key);
    const value: MaterialPriceResponse = {
      originalName,
      originalSpecification: specification,
      standardName: found.standardized.standardName,
      category: found.standardized.category,
      searchedQueries: found.queries,
      results: found.results,
      checkedAt: new Date().toISOString(),
      sourceName: "조달청 나라장터 가격정보현황서비스",
      sourceUrl: SOURCE_URL,
      endpoint: TOTAL_ENDPOINT,
    };
    if (cache.size >= 200) cache.delete(cache.keys().next().value as string);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL, value });
    return Response.json(value, { headers: { "cache-control": "private, max-age=300" } });
  } catch (error) {
    if (error instanceof UpstreamError) return errorResponse(error.message, error.status);
    return errorResponse("기준가격 조회 중 오류가 발생했습니다. 기존 견적검토 결과에는 영향을 주지 않습니다.");
  }
}
