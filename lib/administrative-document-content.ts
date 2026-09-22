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

function editableMarkdown(value: string) {
  return value
    .replace(/```[^\n]*\n?/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*---+\s*$/gm, "")
    .replace(/\\\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildConstructionPlanContent(contract: ContractDraftSource, registeredTemplate: string) {
  const template = editableMarkdown(registeredTemplate);
  if (!template) return "";
  const replacements: Array<[RegExp, string]> = [
    [/\{\{\s*공사명\s*\}\}|\[\[\s*공사명\s*\]\]/g, contract.projectName],
    [/\{\{\s*공사목적\s*\}\}|\[\[\s*공사목적\s*\]\]/g, contract.purpose],
    [/\{\{\s*공사장소\s*\}\}|\[\[\s*공사장소\s*\]\]/g, contract.location],
    [/\{\{\s*공사기간\s*\}\}|\[\[\s*공사기간\s*\]\]/g, shownPeriod(contract)],
    [/\{\{\s*공사금액\s*\}\}|\[\[\s*공사금액\s*\]\]/g, shownMoney(contract.contractAmount)],
    [/\{\{\s*계약업체\s*\}\}|\[\[\s*계약업체\s*\]\]/g, contract.companyName],
  ];
  return replacements.reduce((content, [pattern, replacement]) => content.replace(pattern, replacement), template);
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
