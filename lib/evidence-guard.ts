import { NO_EVIDENCE_MESSAGE } from "./knowledge-constants.ts";
import type { OpenAIKnowledgeResponse } from "./openai-knowledge";

export type ReadyKnowledgeDocument = {
  id: string;
  documentName: string;
  originalName: string;
  openaiFileId: string | null;
};

export function finalizeKnowledgeAnswer(response: OpenAIKnowledgeResponse, readyDocuments: ReadyKnowledgeDocument[]) {
  const readyByFile = new Map(readyDocuments.filter((document) => document.openaiFileId).map((document) => [document.openaiFileId!, document]));
  let answer = "";
  const citedFileIds = new Set<string>();
  const searchedFileIds = new Set<string>();

  for (const item of response.output || []) {
    for (const result of item.results || []) {
      if (result.file_id && readyByFile.has(result.file_id)) searchedFileIds.add(result.file_id);
    }
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) answer += content.text;
      for (const annotation of content.annotations || []) {
        if (annotation.type === "file_citation" && annotation.file_id && readyByFile.has(annotation.file_id)) {
          citedFileIds.add(annotation.file_id);
        }
      }
    }
  }

  const validFileIds = [...citedFileIds].filter((fileId) => searchedFileIds.has(fileId));
  if (!answer.trim() || /\bNO_EVIDENCE\b/.test(answer) || validFileIds.length === 0) {
    return { answer: NO_EVIDENCE_MESSAGE, sources: [], evidenceStatus: "NO_EVIDENCE" as const };
  }

  return {
    answer: answer.trim(),
    evidenceStatus: "SUPPORTED" as const,
    sources: validFileIds.map((fileId) => {
      const document = readyByFile.get(fileId)!;
      return { documentId: document.id, documentName: document.documentName, filename: document.originalName };
    }),
  };
}
