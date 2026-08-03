import "server-only";

import { createHash } from "node:crypto";

import sharp from "sharp";

import { requiredServerEnv } from "@/lib/env";

export const PLANTNET_POLICY_VERSION = "ove269.plantnet-species.v1";
export const PLANTNET_SPECIES_DEADLINE_MS = 15_000;
export const PLANTNET_MAX_IMAGES = 5;
export const PLANTNET_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const PLANTNET_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export const PLANTNET_ORGANS = [
  "auto",
  "leaf",
  "flower",
  "fruit",
  "bark",
] as const;
export type PlantNetOrgan = (typeof PLANTNET_ORGANS)[number];

export type PlantNetFailureClass =
  | "provider_rejected_non_plant"
  | "no_species_found"
  | "quota_exhausted"
  | "rate_limited"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_schema";

export class PlantNetAdapterError extends Error {
  constructor(readonly code: PlantNetFailureClass) {
    super(`Pl@ntNet species identification failed: ${code}.`);
  }
}

export interface PlantNetImageInput {
  bytes: Buffer;
  organ: PlantNetOrgan;
}

export interface PlantNetCandidate {
  rank: number;
  score: number;
  scientificName: string;
  genus: string | null;
  family: string | null;
}

export interface PlantNetIdentificationResult {
  candidates: PlantNetCandidate[];
  modelVersion: string | null;
  quotaRemaining: number | null;
  durationMs: number;
}

interface PlantNetResponse {
  results?: unknown;
  version?: unknown;
  remainingIdentificationRequests?: unknown;
}

export interface PlantNetSpeciesAdapterDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  apiKey?: string;
  enabled?: boolean;
}

export function isPlantNetSpeciesIdentificationEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return booleanServerEnvFrom(env, "PLANTNET_SPECIES_IDENTIFICATION_ENABLED");
}

export async function identifyPlantSpecies(
  images: readonly PlantNetImageInput[],
  deps: PlantNetSpeciesAdapterDeps = {},
): Promise<PlantNetIdentificationResult> {
  const enabled = deps.enabled ?? isPlantNetSpeciesIdentificationEnabled();
  if (!enabled) throw new PlantNetAdapterError("provider_unavailable");
  if (images.length < 1 || images.length > PLANTNET_MAX_IMAGES) {
    throw new PlantNetAdapterError("provider_schema");
  }
  if (!images.every((image) => isPlantNetOrgan(image.organ))) {
    throw new PlantNetAdapterError("provider_schema");
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const apiKey = deps.apiKey ?? requiredServerEnv("PLANTNET_API_KEY");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PLANTNET_SPECIES_DEADLINE_MS,
  );
  const startedAt = now();

  try {
    const form = new FormData();
    let totalBytes = 0;
    for (const image of images) {
      const normalized = await reencodePlantNetImage(image.bytes);
      totalBytes += normalized.bytes.byteLength;
      if (totalBytes > PLANTNET_MAX_TOTAL_BYTES) {
        throw new PlantNetAdapterError("provider_schema");
      }
      // This static name deliberately cannot disclose the uploaded filename.
      form.append(
        "images",
        new Blob(
          [
            normalized.bytes.buffer.slice(
              normalized.bytes.byteOffset,
              normalized.bytes.byteOffset + normalized.bytes.byteLength,
            ) as ArrayBuffer,
          ],
          { type: "image/jpeg" },
        ),
        "plant.jpg",
      );
      form.append("organs", image.organ);
    }

    const endpoint = new URL("https://my-api.plantnet.org/v2/identify/all");
    endpoint.searchParams.set("api-key", apiKey);
    endpoint.searchParams.set("no-reject", "false");
    endpoint.searchParams.set("include-related-images", "false");
    endpoint.searchParams.set("nb-results", "5");
    endpoint.searchParams.set("detailed", "false");

    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new PlantNetAdapterError("provider_timeout");
      }
      throw new PlantNetAdapterError("provider_unavailable");
    }

    if (!response.ok) {
      throw new PlantNetAdapterError(
        await classifyPlantNetFailureResponse(response),
      );
    }

    let body: PlantNetResponse;
    try {
      body = (await response.json()) as PlantNetResponse;
    } catch {
      throw new PlantNetAdapterError("provider_schema");
    }
    const candidates = normalizePlantNetCandidates(body.results);
    if (candidates.length === 0) {
      throw new PlantNetAdapterError("no_species_found");
    }

    return {
      candidates,
      modelVersion: boundedText(body.version, 120),
      quotaRemaining: boundedNonNegativeInteger(
        body.remainingIdentificationRequests,
      ),
      durationMs: Math.min(
        Math.max(now() - startedAt, 0),
        PLANTNET_SPECIES_DEADLINE_MS,
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function reencodePlantNetImage(source: Buffer): Promise<{
  bytes: Buffer;
  sha256: string;
}> {
  if (
    source.byteLength === 0 ||
    source.byteLength > PLANTNET_MAX_SOURCE_BYTES
  ) {
    throw new PlantNetAdapterError("provider_schema");
  }
  let bytes: Buffer;
  try {
    bytes = await sharp(source, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new PlantNetAdapterError("provider_schema");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > PLANTNET_MAX_SOURCE_BYTES) {
    throw new PlantNetAdapterError("provider_schema");
  }
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function buildPlantNetFingerprint(input: {
  ownerUserId: string;
  images: readonly { derivativeSha256: string; organ: PlantNetOrgan }[];
}) {
  const stableImages = [...input.images]
    .map((image) => `${image.derivativeSha256}:${image.organ}`)
    .sort()
    .join("|");
  return createHash("sha256")
    .update(
      `${PLANTNET_POLICY_VERSION}|all|${input.ownerUserId}|${stableImages}`,
    )
    .digest("hex");
}

export function classifyPlantNetStatus(status: number): PlantNetFailureClass {
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404 || status === 422) {
    return "provider_rejected_non_plant";
  }
  if (status === 401 || status === 403 || status >= 500) {
    return "provider_unavailable";
  }
  return "provider_schema";
}

async function classifyPlantNetFailureResponse(
  response: Response,
): Promise<PlantNetFailureClass> {
  if (response.status !== 429) return classifyPlantNetStatus(response.status);

  // Pl@ntNet uses HTTP 429 for both a short request-rate limit and the daily
  // account allowance. The error text is inspected only in memory to preserve
  // a truthful receipt; it is never returned, logged, or stored.
  const detail = await response.text().catch(() => "");
  return /(?:daily|quota|allowance|identification limit)/i.test(detail)
    ? "quota_exhausted"
    : "rate_limited";
}

function normalizePlantNetCandidates(results: unknown): PlantNetCandidate[] {
  if (!Array.isArray(results)) return [];
  const normalized: PlantNetCandidate[] = [];
  for (const result of results.slice(0, PLANTNET_MAX_IMAGES)) {
    if (!isRecord(result)) continue;
    const species = isRecord(result.species) ? result.species : null;
    const genus = isRecord(species?.genus) ? species.genus : null;
    const family = isRecord(species?.family) ? species.family : null;
    const scientificName = boundedText(
      species?.scientificNameWithoutAuthor ?? species?.scientificName,
      240,
    );
    const score =
      typeof result.score === "number" && Number.isFinite(result.score)
        ? Math.min(Math.max(result.score, 0), 1)
        : null;
    if (!scientificName || score === null) continue;
    normalized.push({
      rank: normalized.length + 1,
      score,
      scientificName,
      genus: boundedText(genus?.scientificName, 120),
      family: boundedText(family?.scientificName, 120),
    });
  }
  return normalized;
}

function boundedText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 && normalized.length <= maximum
    ? normalized
    : null;
}

function boundedNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlantNetOrgan(value: string): value is PlantNetOrgan {
  return (PLANTNET_ORGANS as readonly string[]).includes(value);
}

function booleanServerEnvFrom(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  return value === "true" || value === "1";
}
