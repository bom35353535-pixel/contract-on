import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("estimate review loads the registered building-rate Markdown source from R2", async () => {
  const page = await read("app/estimates/[id]/page.tsx");
  const review = await read("components/QuotationReview.tsx");
  assert.match(page, /env\.FILES\.get\(rateReferenceDocument\.storageKey\)/);
  assert.match(page, /name\.includes\("건축공사"\).*name\.includes\("간접공사비"\)/s);
  assert.match(page, /rateReferenceText=\{rateReferenceText\}/);
  assert.doesNotMatch(review, /지식자료 먼저 준비|지식관리에서 먼저 업로드/);
  assert.doesNotMatch(review, /section-kicker\">기본정보/);
  assert.match(review, /contract-info-title\">계약 기본정보 확인/);
});

test("current-rate reference displays registered formulas and separates rate conditions", async () => {
  const component = await read("components/CurrentRateReference.tsx");
  assert.match(component, /직접노무비 × 요율/);
  assert.match(component, /\(재료비 \+ 노무비\) × 요율/);
  assert.match(component, /\(노무비 \+ 경비 \+ 일반관리비\) × 요율/);
  assert.match(component, /amountMatches\(row\[0\], amount\).*periodMatches\(row\[1\], days\)/s);
  assert.match(component, /견적 총액을 직접공사비·추정가격에 대입한 참고 계산/);
  assert.match(component, /documentName\?\.includes\("건축공사"\)/);
  assert.match(component, /extractedConstructionText\.includes\("건축공사"\)/);
  assert.match(component, /\["건축", "전기", "통신", "소방", "전문", "기타"\]/);
  assert.match(component, /isCommonBuildingRateType \|\| hasBuildingItem/);
  assert.match(component, /usesSpecialManagementRate \? 2 : 1/);
  assert.match(component, /간접노무비·기타경비 등은 건축공사 요율을 적용하고/);
  assert.match(component, /일반관리비는 전문·전기·통신·소방·기타 공사용 요율을 적용했습니다/);
  assert.match(component, /itemQuote\("기타경비"\)/);
  assert.doesNotMatch(component, /label: "기타경비"[^\n]*quote: data\.expenses/);
  assert.match(component, /공사종류가 비어 있어 등록된 건축공사 기준으로 금액을 먼저 계산했습니다/);
  assert.match(component, /견적서 공종표의 ‘건축공사’를 근거로 등록된 건축공사 기준을 적용했습니다/);
  assert.doesNotMatch(component, /견적서 비목별 금액 재추출 필요/);
});

test("zero or blank quotation cost rows are not applicable", async () => {
  const component = await read("components/CurrentRateReference.tsx");
  assert.match(component, /row\.quote === null \|\| row\.quote === 0/);
  assert.match(component, /notApplicable\s*\? "해당 없음"/);
  assert.match(component, /row\.notApplicable \? "해당 없음" : won\(row\.quote\)/);
  assert.match(component, /견적서 금액 0원·공란/);
});

test("rate table accepts direct corrections and recognizes insurance labels without the fee suffix", async () => {
  const component = await read("components/CurrentRateReference.tsx");
  const form = await read("components/QuotationReview.tsx");
  assert.match(component, /itemQuote\("산재보험료", "산재보험"\)/);
  assert.match(component, /aria-label=\{`\$\{row\.label\} 견적서 금액 직접 입력`\}/);
  assert.match(form, /function updateRateQuote/);
  assert.match(form, /category: "사용자 입력"/);
  assert.match(form, /onQuoteChange=\{updateRateQuote\}/);
});

test("quotation extraction keeps statutory cost summary rows separate", async () => {
  const source = await read("lib/openai-estimate.ts");
  assert.match(source, /간접노무비, 기타경비, 산재보험료, 고용보험료/);
  assert.match(source, /각각 별도 items 행으로 반드시 포함하세요/);
  assert.match(source, /여러 비목을 경비 합계 하나로 합치지 마세요/);
});

test("supplier sanction lookup validates an exact business number and explains current-only coverage", async () => {
  const route = await read("app/api/g2b/sanctions/route.ts");
  const component = await read("components/SupplierSanctionCheck.tsx");
  const validator = await read("lib/business-registration.ts");
  assert.match(route, /\^\\d\{10\}\$/);
  assert.match(route, /apis\.data\.go\.kr\/1230000\/ao\/UsrInfoService02\/getUnptRsttCorpInfo02/);
  assert.match(route, /env\.DATA_GO_KR_API_KEY/);
  assert.match(route, /url\.searchParams\.set\("ServiceKey", key\)/);
  assert.match(route, /url\.searchParams\.set\("inqryDiv", "1"\)/);
  assert.match(route, /rstrtSttDt/);
  assert.doesNotMatch(route, /k-skill-proxy\.nomadamas\.org/);
  assert.match(validator, /weights = \[1, 3, 7, 1, 3, 7, 1, 3, 5\]/);
  assert.match(route, /isValidBusinessRegistrationNumber\(bizno\)/);
  assert.match(component, /유효하지 않은 사업자등록번호입니다/);
  assert.match(component, /0건은 업체의 실재 여부나 과거 제재 이력이 없다는 뜻이 아니며/);
  assert.match(component, /업체 존재 여부를 확인한 결과는 아닙니다/);
  assert.match(component, /조달청 나라장터 부정당제재업체정보/);
  assert.match(component, /businessRegistrationNumber/);
  assert.match(component, /useEffect/);
  assert.match(component, /다시 조회/);
  assert.doesNotMatch(component, /사업자등록번호 숫자 10자리를 입력해 주세요/);
});
