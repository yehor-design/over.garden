import {
  buildEphemeralMediaUploadReservation,
  parseEphemeralMediaReservation,
} from "@/lib/media/ephemeral-staging-contract";
import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { issueEphemeralStagingCapability } from "@/server/media/ephemeral-staging-capability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    return privateNoStore(documentMutationAdmissionResponse(admission));
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 4_096) return invalidReservation();
  const body = await readBoundedJson(request, 4_096);
  if (body === null) return invalidReservation();
  const reservation = parseEphemeralMediaReservation(body);
  if (!reservation) return invalidReservation();
  try {
    const issued = await issueEphemeralStagingCapability({
      ownerUserId: admission.scope.userId,
      ...reservation,
    });
    return privateNoStore(
      Response.json(
        buildEphemeralMediaUploadReservation({
          stagingOrigin: resolveStagingBaseUrl(),
          binding: {
            stagingSessionId: reservation.stagingSessionId,
            mediaAssetId: reservation.mediaAssetId,
            generation: reservation.generation,
          },
          uploadCapability: issued.capability,
          expiresAtSeconds: issued.expiresAtSeconds,
          nowSeconds: issued.issuedAtSeconds,
        }),
      ),
    );
  } catch {
    return privateNoStore(
      Response.json(
        { code: "staging_reservation_unavailable" },
        { status: 503 },
      ),
    );
  }
}

function resolveStagingBaseUrl() {
  const configured = process.env.EPHEMERAL_MEDIA_STAGING_BASE_URL;
  const value = configured?.trim() || "https://media-stage.over.garden";
  const url = new URL(value);
  const hasUnexpectedUrlParts = Boolean(
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash,
  );
  const isExactProductionOrigin =
    url.href === "https://media-stage.over.garden/";
  const isLocalDevelopmentOrigin =
    process.env.VERCEL_ENV !== "production" &&
    url.protocol === "http:" &&
    url.hostname === "localhost" &&
    !hasUnexpectedUrlParts;
  if (
    hasUnexpectedUrlParts ||
    (!isExactProductionOrigin && !isLocalDevelopmentOrigin)
  ) {
    throw new Error("staging_base_url_invalid");
  }
  return url;
}

function invalidReservation() {
  return privateNoStore(
    Response.json({ code: "staging_reservation_invalid" }, { status: 400 }),
  );
}

function privateNoStore(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function readBoundedJson(request: Request, maxBytes: number) {
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
    "application/json"
  ) {
    return null;
  }
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
