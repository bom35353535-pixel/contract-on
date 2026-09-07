import { env } from "cloudflare:workers";

export const runtime = "edge";

const OFFICIAL_API_URL = "https://apis.data.go.kr/1230000/ao/UsrInfoService02/getUnptRsttCorpInfo02";
const OFFICIAL_SOURCE = "https://www.data.go.kr/data/15129466/openapi.do";
const AUTH_ERROR_CODES = new Set(["20", "21", "30", "31", "32", "33"]);

function textValue(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function itemArray(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const response = root.response && typeof root.response === "object" ? root.response as Record<string, unknown> : {};
  const body = response.body && typeof response.body === "object" ? response.body as Record<string, unknown> : {};
  const itemContainer = body.items && typeof body.items === "object" ? body.items as Record<string, unknown> : null;
  const candidate = itemContainer?.item ?? body.items;
  if (Array.isArray(candidate)) return candidate.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  if (candidate && typeof candidate === "object") return [candidate as Record<string, unknown>];
  return [];
}

function gatewayAuthError(text: string) {
  if (!text.includes("OpenAPI_ServiceResponse")) return null;
  const code = text.match(/<returnReasonCode>([^<]*)<\/returnReasonCode>/)?.[1]?.trim() || "";
  const message = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/)?.[1]?.trim() || "인증 오류";
  return AUTH_ERROR_CODES.has(code) ? { code, message } : null;
}

function serviceKey() {
  const stored = env.DATA_GO_KR_API_KEY?.trim();
  if (!stored) return null;
  try {
    return decodeURIComponent(stored);
  } catch {
    return stored;
  }
}

function errorResponse(error: string, status = 503) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const bizno = new URL(request.url).searchParams.get("bizno")?.replace(/\D/g, "") || "";
  if (!/^\d{10}$/.test(bizno)) return errorResponse("사업자등록번호 숫자 10자리를 확인해 주세요.", 400);

  const key = serviceKey();
  if (!key) return errorResponse("공공데이터포털 API 인증키가 설정되지 않았습니다. 관리자에게 문의해 주세요.");

  const url = new URL(OFFICIAL_API_URL);
  url.searchParams.set("ServiceKey", key);
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("type", "json");
  url.searchParams.set("inqryDiv", "1");
  url.searchParams.set("bizno", bizno);

  try {
    const upstream = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await upstream.text();

    if (upstream.status === 401 || upstream.status === 403) {
      return errorResponse("공공데이터포털에서 인증키 사용을 거부했습니다. 해당 서비스의 활용신청·승인 상태를 확인해 주세요.");
    }
    if (!upstream.ok) {
      return errorResponse(`조달청 공식 조회 서비스가 응답하지 않았습니다(HTTP ${upstream.status}). 잠시 후 다시 조회해 주세요.`, 502);
    }

    const authError = gatewayAuthError(text);
    if (authError) {
      const detail = authError.code === "31" ? "인증키 사용기간을 확인해 주세요." : "해당 서비스의 활용신청·승인 상태와 인증키를 확인해 주세요.";
      return errorResponse(`공공데이터포털 인증 오류입니다. ${detail}`);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return errorResponse("조달청 공식 조회 서비스가 올바른 JSON 응답을 반환하지 않았습니다.", 502);
    }

    const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const response = root.response && typeof root.response === "object" ? root.response as Record<string, unknown> : {};
    const header = response.header && typeof response.header === "object" ? response.header as Record<string, unknown> : {};
    const resultCode = String(header.resultCode ?? "").trim();
    if (AUTH_ERROR_CODES.has(resultCode)) {
      return errorResponse("공공데이터포털 인증 오류입니다. 해당 서비스의 활용신청·승인 상태와 인증키를 확인해 주세요.");
    }
    if (resultCode && resultCode !== "00" && resultCode !== "0") {
      return errorResponse(`조달청 공식 조회 오류가 발생했습니다(${resultCode}). 잠시 후 다시 조회해 주세요.`, 502);
    }

    const items = itemArray(payload).map((item) => ({
      corpName: textValue(item, ["bizNm", "corpNm", "corpName", "업체명"]),
      startDate: textValue(item, ["rstrtSttDt", "rsttBgnDate", "startDate", "제재시작일"]),
      endDate: textValue(item, ["rstrtEndDt", "rsttEndDate", "endDate", "제재종료일"]),
      institution: textValue(item, ["dminsttNm", "insttNm", "institution", "처분기관"]),
      status: textValue(item, ["rstrtProgrsNm", "rsttProgrsNm", "status", "진행상태"]),
      reason: textValue(item, ["rstrtRsn", "rstrtRsnCn", "rsttRsn", "rsttRsnCn", "lglBasisCn", "reason", "제재사유"]),
    }));

    return Response.json({
      bizno,
      totalCount: items.length,
      checkedAt: new Date().toISOString(),
      items,
      sourceName: "조달청 나라장터 부정당제재업체정보",
      sourceUrl: OFFICIAL_SOURCE,
      coverage: "조회시점 현재 유효한 부정당제재만 확인하며, 만료·해제된 과거 이력과 나라장터 미등록 업체는 조회범위에 포함되지 않습니다.",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return errorResponse("조달청 공식 조회 응답 시간이 초과되었습니다. 잠시 후 다시 조회해 주세요.", 504);
    }
    return errorResponse("조달청 공식 조회 연결에 실패했습니다. 잠시 후 다시 조회해 주세요.", 502);
  }
}
