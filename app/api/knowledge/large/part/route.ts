import { env } from "cloudflare:workers";

export const runtime = "edge";

export async function PUT(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = String(params.get("id") || "");
  const uploadId = String(params.get("uploadId") || "");
  const fileName = String(params.get("fileName") || "");
  const partNumber = Number(params.get("partNumber") || 0);
  if (!id || !uploadId || !fileName || !Number.isInteger(partNumber) || partNumber < 1) return Response.json({ error: "분할 업로드 정보를 확인해 주세요." }, { status: 400 });
  const storageKey = `knowledge/${id}/${encodeURIComponent(fileName)}`;
  try {
    const upload = env.FILES.resumeMultipartUpload(storageKey, uploadId);
    const part = await upload.uploadPart(partNumber, await request.arrayBuffer());
    return Response.json({ partNumber: part.partNumber, etag: part.etag });
  } catch (error) {
    console.error("knowledge multipart part failed", { partNumber, error });
    return Response.json({ error: `${partNumber}번째 파일 조각을 저장하지 못했습니다.` }, { status: 500 });
  }
}
