export function documentNameFromFileName(fileName: string) {
  const trimmed = fileName.trim();
  const withoutExtension = trimmed.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || trimmed;
}

export function safeFileName(name: string) {
  return name.replace(/[^0-9A-Za-z가-힣._-]/g, "_").slice(-120) || "document";
}
