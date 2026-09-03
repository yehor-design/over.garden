import {
  EPHEMERAL_MEDIA_ALLOWED_ORIGINS,
  isEphemeralMediaVariant,
  isUuid,
  type EphemeralMediaVariant,
} from "../../../src/lib/media/ephemeral-staging-contract";

export type WorkerRoute =
  | {
      operation: "upload";
      stagingSessionId: string;
      mediaAssetId: string;
      generation: number;
      /** `0` for the primary object; the long edge for a variant (`/v1280`). */
      variant: EphemeralMediaVariant;
    }
  | {
      operation: "delete";
      stagingSessionId: string;
      mediaAssetId: string;
      generation: number;
      variant: EphemeralMediaVariant;
    }
  | { operation: "claim"; stagingSessionId: string }
  | { operation: "finalize"; stagingSessionId: string }
  /** Extends the session lease under the session capability (OVE-372). */
  | { operation: "touch"; stagingSessionId: string }
  | { operation: "status" };

export function parseWorkerRoute(
  pathname: string,
  method: string,
): WorkerRoute | null {
  if (pathname === "/v1/status" && method === "GET")
    return { operation: "status" };
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "v1" || segments[1] !== "staging") return null;
  if (segments.length === 4 && isUuid(segments[2])) {
    if (segments[3] === "claim" && method === "POST") {
      return { operation: "claim", stagingSessionId: segments[2] };
    }
    if (segments[3] === "finalize" && method === "POST") {
      return { operation: "finalize", stagingSessionId: segments[2] };
    }
    if (segments[3] === "touch" && method === "POST") {
      return { operation: "touch", stagingSessionId: segments[2] };
    }
  }
  if (
    (segments.length === 5 || segments.length === 6) &&
    isUuid(segments[2]) &&
    isUuid(segments[3]) &&
    /^(?:[1-9]\d*)$/.test(segments[4] ?? "")
  ) {
    const generation = Number(segments[4]);
    if (!Number.isSafeInteger(generation)) return null;
    const variant = parseVariantSegment(segments[5]);
    if (variant === null) return null;
    if (method === "PUT") {
      return {
        operation: "upload",
        stagingSessionId: segments[2],
        mediaAssetId: segments[3],
        generation,
        variant,
      };
    }
    if (method === "DELETE") {
      return {
        operation: "delete",
        stagingSessionId: segments[2],
        mediaAssetId: segments[3],
        generation,
        variant,
      };
    }
  }
  return null;
}

/** `undefined` is the primary; `v1280` or `v480` names a variant. */
function parseVariantSegment(
  segment: string | undefined,
): EphemeralMediaVariant | null {
  if (segment === undefined) return 0;
  const match = /^v([1-9]\d{1,4})$/.exec(segment);
  if (!match) return null;
  const variant = Number(match[1]);
  return isEphemeralMediaVariant(variant) ? variant : null;
}

export function corsHeaders(
  origin: string,
  method: string,
): Record<string, string> | null {
  if (
    !(EPHEMERAL_MEDIA_ALLOWED_ORIGINS as readonly string[]).includes(origin) ||
    !["GET", "PUT", "POST", "DELETE", "OPTIONS"].includes(method)
  ) {
    return null;
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    // OVE-372: an upload describes its dimensions in headers, so the
    // preflight must admit them or the browser never sends the PUT.
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Content-Length, Content-SHA256, X-Media-Width, X-Media-Height",
    "Access-Control-Expose-Headers": "ETag",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
}
