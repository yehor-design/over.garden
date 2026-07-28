import "server-only";

import {
  deletePublicDerivativeObject,
  deleteQuarantineObject,
  getPublicDerivativeUrl,
  quarantineObjectExists,
} from "@/lib/storage";
import { optionalServerEnv } from "@/lib/env";
import type { MediaLifecycleBucket } from "@/server/media/media-lifecycle-enqueue";

export const MEDIA_REVOKE_PROVE_TIMEOUT_MS = 120_000;
export const MEDIA_REVOKE_PROVE_POLL_MS = 1_000;

export interface MediaObjectReference {
  bucket: MediaLifecycleBucket;
  objectKey: string;
}

export async function revokeMediaObjectBytes(
  reference: MediaObjectReference,
): Promise<{ provedUnreachable: boolean; canonicalStatus: number | null }> {
  if (reference.bucket === "quarantine") {
    await deleteQuarantineObject(reference.objectKey);
    if (await quarantineObjectExists(reference.objectKey)) {
      throw new Error("Quarantine object remained present after delete.");
    }
    return { provedUnreachable: true, canonicalStatus: null };
  }

  const canonicalUrl = getPublicDerivativeUrl(reference.objectKey);
  await purgeCloudflareCacheUrls([canonicalUrl]);
  await deletePublicDerivativeObject(reference.objectKey);
  await purgeCloudflareCacheUrls([canonicalUrl]);

  const prove = await proveCanonicalUrlUnreachable(canonicalUrl);
  if (!prove.unreachable) {
    throw new Error(
      "Canonical public derivative URL remained reachable after delete/purge.",
    );
  }

  return {
    provedUnreachable: true,
    canonicalStatus: prove.status,
  };
}

export async function proveCanonicalUrlUnreachable(
  canonicalUrl: string,
  options: {
    timeoutMs?: number;
    pollMs?: number;
  } = {},
): Promise<{ unreachable: boolean; status: number | null }> {
  const timeoutMs = options.timeoutMs ?? MEDIA_REVOKE_PROVE_TIMEOUT_MS;
  const pollMs = options.pollMs ?? MEDIA_REVOKE_PROVE_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastStatus: number | null = null;

  while (Date.now() <= deadline) {
    lastStatus = await headStatus(canonicalUrl);
    if (lastStatus === null || lastStatus < 200 || lastStatus >= 300) {
      return { unreachable: true, status: lastStatus };
    }
    await sleep(pollMs);
  }

  return { unreachable: false, status: lastStatus };
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

async function headStatus(url: string): Promise<number | null> {
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "manual" });
    if (head.status !== 405 && head.status !== 501) {
      return head.status;
    }
  } catch {
    // Fall through to GET.
  }

  try {
    const get = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { Range: "bytes=0-0" },
    });
    return get.status;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
