export type ContractDraftSource = {
  projectName: string;
  purpose: string;
  location: string;
  contractAmount: number;
  companyName: string;
  contractMethod: string | null;
  plannedStartDate: string | null;
  plannedCompletionDate: string | null;
};

function shownDate(value: string | null) {
  return value ? value.replaceAll("-", ".") : "[확인 필요]";
}

function shownMoney(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function shownPlanMoney(value: number) {
  return value > 0 ? `금${shownMoney(value)}` : "금000원";
}

function planSubject(projectName: string) {
  return projectName.trim().replace(/\s*(?:공사|사업)\s*$/, "").trim() || projectName.trim();
}

function shownPeriod(contract: Pick<ContractDraftSource, "plannedStartDate" | "plannedCompletionDate">) {
  return `${shownDate(contract.plannedStartDate)} ~ ${shownDate(contract.plannedCompletionDate)}`;
}

function objectParticle(value: string) {
  const last = value.trim().charCodeAt(value.trim().length - 1);
  const hasFinalConsonant = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return hasFinalConsonant ? "을" : "를";
}

export function buildConstructionPlanContent(contract: ContractDraftSource, registeredTemplate: string) {
  if (!registeredTemplate.trim()) return "";
  const subject = planSubject(contract.projectName);
  return [
    `제목: ${subject} 사업 추진 계획(안)`,
    "",
    "1. 관련: 000",
    `2. 우리학교 ${subject} 사업계획을 다음과 같이 수립하고자 합니다.`,
    `   가. 사 업 명: ${contract.projectName}`,
    `   나. 예 산 액: ${shownPlanMoney(contract.contractAmount)}`,
    `      1. 공 사 비: ${shownPlanMoney(contract.contractAmount)}`,
    "      2. 일반수용비: 금000원",
    "      3. 비 품 비: 금000원",
    "   다. 사업내용",
    `      1. (공사) ${contract.purpose || "000"}`,
    "      2. (물품) 000",
    "",
    "붙임  성립전예산요구서 1부.  끝.",
  ].join("\n");
}

export function buildPurchaseRequestContent(contract: ContractDraftSource) {
  return [
    `${contract.projectName} 공사를 다음과 같이 시행하고자 합니다.`,
    "",
    `1. 공 사 명: ${contract.projectName}`,
    `2. 공사목적: ${contract.purpose}`,
    `3. 공사장소: ${contract.location}`,
    `4. 공사기간: ${shownPeriod(contract)}`,
    `5. 공사금액: ${shownMoney(contract.contractAmount)}`,
    `6. 계약업체: ${contract.companyName}`,
    "",
    "붙임  견적서 1부.  끝.",
  ].join("\n");
}

export function buildInternalApprovalContent(contract: ContractDraftSource, contractMethod = contract.contractMethod || "나라장터 전자계약") {
  return [
    `제목: ${contract.projectName} 계약 추진`,
    "",
    `${contract.projectName} 공사 계약을 다음과 같이 추진하고자 합니다.`,
    "",
    `1. 공 사 명: ${contract.projectName}`,
    `2. 공사목적: ${contract.purpose}`,
    `3. 공사장소: ${contract.location}`,
    `4. 공사기간: ${shownPeriod(contract)}`,
    `5. 공사금액: ${shownMoney(contract.contractAmount)}`,
    `6. 계약업체: ${contract.companyName}`,
    `7. 계약방법: ${contractMethod}`,
    "",
    "붙임  견적서 1부.  끝.",
  ].join("\n");
}

export function replaceContractMethod(content: string, contractMethod: string) {
  const value = contractMethod.trim() || "[담당자 확인 필요]";
  return /^7\. 계약방법:.*$/m.test(content)
    ? content.replace(/^7\. 계약방법:.*$/m, `7. 계약방법: ${value}`)
    : `${content.trimEnd()}\n7. 계약방법: ${value}`;
}
