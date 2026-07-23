import { describe, expect, it } from "vitest";

import {
  evaluateMeilisearchUpgradePreflight,
  MEILISEARCH_PINNED_IMAGE_DIGEST,
  MEILISEARCH_PINNED_IMAGE_REF,
  MEILISEARCH_PINNED_TARGET_VERSION,
  MEILISEARCH_UPGRADE_STRATEGY,
  isAllowedMeilisearchUpgradeSource,
} from "./meilisearch-upgrade-contract";

describe("OVE-198 Meilisearch upgrade contract", () => {
  it("accepts the audited 1.15.x dual-volume path onto the pinned target", () => {
    expect(isAllowedMeilisearchUpgradeSource("1.15.2")).toBe(true);
    expect(isAllowedMeilisearchUpgradeSource("v1.15")).toBe(true);

    const result = evaluateMeilisearchUpgradePreflight({
      sourceVersion: "1.15.2",
      targetVersion: MEILISEARCH_PINNED_TARGET_VERSION,
      imageRef: MEILISEARCH_PINNED_IMAGE_REF,
      strategy: MEILISEARCH_UPGRADE_STRATEGY,
    });

    expect(result).toEqual({
      ok: true,
      sourceVersion: "1.15.2",
      targetVersion: "1.48.1",
      strategy: "dual_volume_postgres_rebuild",
    });
    expect(MEILISEARCH_PINNED_IMAGE_DIGEST).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("refuses floating latest, in-place, dumpless, and wrong targets", () => {
    expect(
      evaluateMeilisearchUpgradePreflight({
        sourceVersion: "1.15.2",
        targetVersion: "1.48.1",
        imageRef: "getmeili/meilisearch:latest",
        strategy: MEILISEARCH_UPGRADE_STRATEGY,
      }).ok,
    ).toBe(false);

    expect(
      evaluateMeilisearchUpgradePreflight({
        sourceVersion: "1.15.2",
        targetVersion: "1.48.1",
        imageRef: MEILISEARCH_PINNED_IMAGE_REF,
        strategy: "in_place_volume_upgrade",
      }).ok,
    ).toBe(false);

    expect(
      evaluateMeilisearchUpgradePreflight({
        sourceVersion: "1.15.2",
        targetVersion: "1.48.1",
        imageRef: MEILISEARCH_PINNED_IMAGE_REF,
        strategy: "experimental_dumpless_upgrade",
      }).ok,
    ).toBe(false);

    expect(
      evaluateMeilisearchUpgradePreflight({
        sourceVersion: "1.15.2",
        targetVersion: "1.49.0",
        imageRef: MEILISEARCH_PINNED_IMAGE_REF,
        strategy: MEILISEARCH_UPGRADE_STRATEGY,
      }).ok,
    ).toBe(false);

    expect(
      evaluateMeilisearchUpgradePreflight({
        sourceVersion: "1.14.0",
        targetVersion: "1.48.1",
        imageRef: MEILISEARCH_PINNED_IMAGE_REF,
        strategy: MEILISEARCH_UPGRADE_STRATEGY,
      }).ok,
    ).toBe(false);
  });
});
