export const runtime = "edge";

const PROXY_URL = "https://k-skill-proxy.nomadamas.org/v1/g2b/sanctioned-supplier";
const OFFICIAL_SOURCE = "https://www.data.go.kr/data/15129466/openapi.do";

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
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const result = data.result && typeof data.result === "object" ? data.result as Record<string, unknown> : data;
  const response = result.response && typeof result.response === "object" ? result.response as Record<string, unknown> : null;
  const body = response?.body && typeof response.body === "object" ? response.body as Record<string, unknown> : null;
  const itemContainer = body?.items && typeof body.items === "object" ? body.items as Record<string, unknown> : null;
  const candidates = [result.items, data.items, body?.items, itemContainer?.item];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    if (candidate && typeof candidate === "object") return [candidate as Record<string, unknown>];
  }
  return [];
}

export async function GET(request: Request) {
  const bizno = new URL(request.url).searchParams.get("bizno")?.replace(/\D/g, "") || "";
  if (!/^\d{10}$/.test(bizno)) return Response.json({ error: "사업자등록번호 숫자 10자리를 입력해 주세요." }, { status: 400 });

  try {
    const upstream = await fetch(`${PROXY_URL}?bizno=${encodeURIComponent(bizno)}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return Response.json({ error: "공식 부정당제재 조회 연결이 일시적으로 지연되고 있습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
    }
    const payload: unknown = await upstream.json();
    const items = itemArray(payload).map((item) => ({
      corpName: textValue(item, ["corpNm", "corpName", "업체명"]),
      startDate: textValue(item, ["rsttBgnDate", "startDate", "제재시작일"]),
      endDate: textValue(item, ["rsttEndDate", "endDate", "제재종료일"]),
      institution: textValue(item, ["insttNm", "institution", "처분기관"]),
      status: textValue(item, ["rsttProgrsNm", "status", "진행상태"]),
      reason: textValue(item, ["rsttRsn", "rsttRsnCn", "lglBasisCn", "reason", "제재사유"]),
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
  } catch {
    return Response.json({ error: "공식 부정당제재 조회 연결이 일시적으로 지연되고 있습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}
