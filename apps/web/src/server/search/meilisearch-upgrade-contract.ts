/**
 * OVE-198 Meilisearch upgrade contract.
 *
 * Production may move only via dual-volume Postgres rebuild onto the pinned
 * target. In-place volume upgrades, dumpless experimental upgrades, and
 * floating tags are refused.
 */

export const MEILISEARCH_UPGRADE_CONTRACT_SCHEMA =
  "ove198.meilisearchUpgrade.v1" as const;

export const MEILISEARCH_PINNED_TARGET_VERSION = "1.48.1" as const;

export const MEILISEARCH_PINNED_IMAGE_REF =
  "getmeili/meilisearch:v1.48.1@sha256:93ea15e3e46499281fb5bcd55c63e147d76680073ebd95a3a74d632176225d8a" as const;

export const MEILISEARCH_PINNED_IMAGE_DIGEST =
  "sha256:93ea15e3e46499281fb5bcd55c63e147d76680073ebd95a3a74d632176225d8a" as const;

export const MEILISEARCH_UPGRADE_STRATEGY =
  "dual_volume_postgres_rebuild" as const;

export const MEILISEARCH_ALLOWED_SOURCE_VERSION_PREFIXES = [
  "1.15.",
  "1.15",
] as const;

export const MEILISEARCH_FORBIDDEN_STRATEGIES = [
  "in_place_volume_upgrade",
  "experimental_dumpless_upgrade",
  "floating_latest",
] as const;

export type MeilisearchUpgradeStrategy =
  | typeof MEILISEARCH_UPGRADE_STRATEGY
  | (typeof MEILISEARCH_FORBIDDEN_STRATEGIES)[number]
  | string;

export type MeilisearchUpgradePreflightInput = {
  sourceVersion: string;
  targetVersion: string;
  imageRef: string;
  strategy: MeilisearchUpgradeStrategy;
};

export type MeilisearchUpgradePreflightResult =
  | { ok: true; sourceVersion: string; targetVersion: string; strategy: string }
  | { ok: false; reason: string };

function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "");
}

export function isAllowedMeilisearchUpgradeSource(sourceVersion: string): boolean {
  const normalized = normalizeVersion(sourceVersion);
  if (!/^\d+\.\d+(\.\d+)?$/.test(normalized)) {
    return false;
  }

  return MEILISEARCH_ALLOWED_SOURCE_VERSION_PREFIXES.some((prefix) => {
    if (prefix.endsWith(".")) {
      return normalized.startsWith(prefix) || normalized === prefix.slice(0, -1);
    }
    return normalized === prefix || normalized.startsWith(`${prefix}.`);
  });
}

export function evaluateMeilisearchUpgradePreflight(
  input: MeilisearchUpgradePreflightInput,
): MeilisearchUpgradePreflightResult {
  const sourceVersion = normalizeVersion(input.sourceVersion);
  const targetVersion = normalizeVersion(input.targetVersion);
  const imageRef = input.imageRef.trim();
  const strategy = input.strategy.trim();

  if (!sourceVersion) {
    return { ok: false, reason: "source version is required" };
  }
  if (!isAllowedMeilisearchUpgradeSource(sourceVersion)) {
    return {
      ok: false,
      reason: `unsupported source version ${sourceVersion}`,
    };
  }
  if (targetVersion !== MEILISEARCH_PINNED_TARGET_VERSION) {
    return {
      ok: false,
      reason: `target version must be pinned ${MEILISEARCH_PINNED_TARGET_VERSION}`,
    };
  }
  if (imageRef.includes(":latest") || imageRef.endsWith("/latest")) {
    return { ok: false, reason: "floating latest image refs are forbidden" };
  }
  if (imageRef !== MEILISEARCH_PINNED_IMAGE_REF) {
    return {
      ok: false,
      reason: "image ref must match the digest-pinned production pin",
    };
  }
  if (
    (MEILISEARCH_FORBIDDEN_STRATEGIES as readonly string[]).includes(strategy)
  ) {
    return { ok: false, reason: `forbidden upgrade strategy ${strategy}` };
  }
  if (strategy !== MEILISEARCH_UPGRADE_STRATEGY) {
    return {
      ok: false,
      reason: `strategy must be ${MEILISEARCH_UPGRADE_STRATEGY}`,
    };
  }

  return {
    ok: true,
    sourceVersion,
    targetVersion,
    strategy,
  };
}
