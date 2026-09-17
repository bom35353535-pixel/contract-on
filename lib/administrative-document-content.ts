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

function shownPeriod(contract: Pick<ContractDraftSource, "plannedStartDate" | "plannedCompletionDate">) {
  return `${shownDate(contract.plannedStartDate)} ~ ${shownDate(contract.plannedCompletionDate)}`;
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
