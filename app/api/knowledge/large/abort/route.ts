import { env } from "cloudflare:workers";

export const runtime = "edge";

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const id = String(body.id || "");
  const uploadId = String(body.uploadId || "");
  const fileName = String(body.fileName || "");
  if (!id || !uploadId || !fileName) return Response.json({ ok: true });
  try {
    const storageKey = `knowledge/${id}/${encodeURIComponent(fileName)}`;
    await env.FILES.resumeMultipartUpload(storageKey, uploadId).abort();
  } catch (error) {
    console.error("knowledge multipart abort failed", error);
  }
  return Response.json({ ok: true });
}
