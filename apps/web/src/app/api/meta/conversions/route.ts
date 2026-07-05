import {
  normalizeMetaConversionsRequestBody,
  sendMetaConversionsApiEvent,
} from "@/server/meta-marketing/conversions-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const normalized = normalizeMetaConversionsRequestBody(body);

  if (!normalized) {
    return Response.json(
      { sent: false, reason: "invalid_payload" },
      { status: 400 },
    );
  }

  const result = await sendMetaConversionsApiEvent(normalized);

  return Response.json(result, {
    status: result.reason === "invalid_payload" ? 400 : 202,
  });
}
