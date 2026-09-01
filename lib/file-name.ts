export function documentNameFromFileName(fileName: string) {
  const trimmed = fileName.trim();
  const withoutExtension = trimmed.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || trimmed;
}
