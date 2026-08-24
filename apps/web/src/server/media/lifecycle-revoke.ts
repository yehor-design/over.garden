import "server-only";

import {
  deletePublicDerivativeObject,
  getPublicDerivativeUrl,
  probePublicDerivativeObjectState,
} from "@/lib/storage";
import { optionalServerEnv } from "@/lib/env";
import type { MediaLifecycleBucket } from "@/server/media/media-lifecycle-enqueue";

export const MEDIA_REVOKE_PROVE_TIMEOUT_MS = 12_000;
export const MEDIA_REVOKE_PROVE_POLL_MS = 1_000;
const MEDIA_PROVIDER_REQUEST_TIMEOUT_MS = 5_000;

export interface MediaObjectReference {
  bucket: MediaLifecycleBucket;
  objectKey: string;
}

export type MediaUnreachabilityOutcome =
  | "confirmed_gone"
  | "still_reachable"
  | "indeterminate_transport"
  | "indeterminate_auth"
  | "provider_error";

export interface MediaUnreachabilityProof {
  outcome: MediaUnreachabilityOutcome;
  canonicalStatus: number | null;
}

export async function revokeMediaObjectBytes(
  reference: MediaObjectReference,
): Promise<MediaUnreachabilityProof> {
  const canonicalUrl = getPublicDerivativeUrl(reference.objectKey);
  await purgeCloudflareCacheUrls([canonicalUrl]);
  await deletePublicDerivativeObject(
    reference.objectKey,
    AbortSignal.timeout(MEDIA_PROVIDER_REQUEST_TIMEOUT_MS),
  );
  await purgeCloudflareCacheUrls([canonicalUrl]);

  const providerState = await probePublicDerivativeObjectState(
    reference.objectKey,
    AbortSignal.timeout(MEDIA_PROVIDER_REQUEST_TIMEOUT_MS),
  );
  if (providerState !== "not_found") {
    return { outcome: providerOutcome(providerState), canonicalStatus: null };
  }

  const prove = await proveCanonicalUrlUnreachable(canonicalUrl);
  return prove;
}

export async function proveCanonicalUrlUnreachable(
  canonicalUrl: string,
  options: {
    timeoutMs?: number;
    pollMs?: number;
  } = {},
): Promise<MediaUnreachabilityProof> {
  const timeoutMs = options.timeoutMs ?? MEDIA_REVOKE_PROVE_TIMEOUT_MS;
  const pollMs = options.pollMs ?? MEDIA_REVOKE_PROVE_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastStatus: number | null = null;
  let firstAttempt = true;

  while (firstAttempt || Date.now() <= deadline) {
    firstAttempt = false;
    const read = await canonicalStatus(canonicalUrl);
    lastStatus = read.canonicalStatus;
    if (read.outcome !== "still_reachable") return read;
    await sleep(pollMs);
  }

  return { outcome: "still_reachable", canonicalStatus: lastStatus };
}

async function purgeCloudflareCacheUrls(urls: string[]): Promise<void> {
  const zoneId = optionalServerEnv("CLOUDFLARE_ZONE_ID");
  const apiToken = optionalServerEnv("CLOUDFLARE_CACHE_PURGE_API_TOKEN");
  if (!zoneId || !apiToken) {
    // Local MinIO and environments without a Zone Cache Purge token rely on
    // origin delete + canonical prove. When Cloudflare starts returning HIT for
    // media.over.garden, set both env vars; attempted purge failures still fail
    // the job (never swallowed).
    return;
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ files: urls }),
      signal: AbortSignal.timeout(MEDIA_PROVIDER_REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error("Cloudflare cache purge request failed.");
  }

  const body = (await response.json()) as { success?: boolean };
  if (body.success !== true) {
    throw new Error("Cloudflare cache purge was rejected.");
  }
}

async function canonicalStatus(url: string): Promise<MediaUnreachabilityProof> {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(MEDIA_PROVIDER_REQUEST_TIMEOUT_MS),
    });
    if (head.status !== 405 && head.status !== 501) {
      return classifyCanonicalStatus(head.status);
    }
  } catch {
    // Fall through to GET.
  }

  try {
    const get = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(MEDIA_PROVIDER_REQUEST_TIMEOUT_MS),
    });
    return classifyCanonicalStatus(get.status);
  } catch {
    return { outcome: "indeterminate_transport", canonicalStatus: null };
  }
}

function classifyCanonicalStatus(status: number): MediaUnreachabilityProof {
  if (status === 404 || status === 410) {
    return { outcome: "confirmed_gone", canonicalStatus: status };
  }
  if (status === 401 || status === 403) {
    return { outcome: "indeterminate_auth", canonicalStatus: status };
  }
  if (status >= 500) {
    return { outcome: "provider_error", canonicalStatus: status };
  }
  return { outcome: "still_reachable", canonicalStatus: status };
}

function providerOutcome(
  state: Awaited<ReturnType<typeof probePublicDerivativeObjectState>>,
): MediaUnreachabilityOutcome {
  if (state === "not_found") return "confirmed_gone";
  if (state === "present") return "still_reachable";
  return state;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
