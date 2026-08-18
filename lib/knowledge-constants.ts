export const KNOWLEDGE_CATEGORIES = [
  "계약", "노임단가", "제비율", "산업안전보건관리비", "하자",
  "계약서류", "착공서류", "준공서류", "공사중 체크사항", "자재가격", "기타",
] as const;

export const SUPPORTED_EXTENSIONS = ["pdf", "docx", "xlsx", "csv", "txt"] as const;
export const NO_EVIDENCE_MESSAGE = "등록된 지식자료에서 확인할 수 없습니다.";
export const PROTOTYPE_MAX_FILE_SIZE = 15 * 1024 * 1024;
