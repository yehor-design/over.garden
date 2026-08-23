import {
  EPHEMERAL_MEDIA_ALLOWED_ORIGINS,
  isUuid,
} from "../../../src/lib/media/ephemeral-staging-contract";

export type WorkerRoute =
  | {
      operation: "upload";
      stagingSessionId: string;
      mediaAssetId: string;
      generation: number;
    }
  | {
      operation: "delete";
      stagingSessionId: string;
      mediaAssetId: string;
      generation: number;
    }
  | { operation: "claim"; stagingSessionId: string }
  | { operation: "finalize"; stagingSessionId: string }
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
  }
  if (
    segments.length === 5 &&
    isUuid(segments[2]) &&
    isUuid(segments[3]) &&
    /^(?:[1-9]\d*)$/.test(segments[4] ?? "")
  ) {
    const generation = Number(segments[4]);
    if (!Number.isSafeInteger(generation)) return null;
    if (method === "PUT") {
      return {
        operation: "upload",
        stagingSessionId: segments[2],
        mediaAssetId: segments[3],
        generation,
      };
    }
    if (method === "DELETE") {
      return {
        operation: "delete",
        stagingSessionId: segments[2],
        mediaAssetId: segments[3],
        generation,
      };
    }
  }
  return null;
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
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Content-Length, Content-SHA256",
    "Access-Control-Expose-Headers": "ETag",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
}
