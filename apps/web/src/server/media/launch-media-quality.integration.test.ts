import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  LAUNCH_CORPUS_INVENTORY_SQL,
  assertLaunchCorpusInventorySqlIsSelectOnly,
} from "@/server/launch-corpus/inventory";
import {
  publicMediaEligibilitySqlText,
} from "./public-media-eligibility";

describe("OVE-231 persisted quality receipt integration", () => {
  it("fences receipt writes and readiness by owner, generation, identity, and claim token", () => {
    const source = readFileSync(
      new URL("./media-repository.ts", import.meta.url),
      "utf8",
    );
    for (const fence of [
      '.where("owner_user_id", "=", scope.userId)',
      '.where("upload_generation_id", "=", claim.asset.upload_generation_id)',
      '.where("public_object_id", "=", claim.asset.public_object_id)',
      '.where("processing_claim_token", "=", claim.claimToken)',
      '.where("quality_policy_version", "=", LAUNCH_MEDIA_QUALITY_POLICY_VERSION)',
      '.where("quality_class", "=", "accepted")',
    ]) {
      expect(source).toContain(fence);
    }
    expect(source).toContain("quality_reason_codes: [...quality.reasonCodes]");
    expect(source).toContain("quality_metrics: { ...quality.metrics }");
  });

  it("keeps production inventory SELECT-only and free of provider identities", () => {
    expect(() => assertLaunchCorpusInventorySqlIsSelectOnly()).not.toThrow();
    const sql = LAUNCH_CORPUS_INVENTORY_SQL.launchMediaQualityCounts;
    expect(sql).toContain("quality_policy_version");
    expect(sql).toContain("legacy_unassessed");
    expect(sql).not.toMatch(/derivative_key|quarantine_key|owner_user_id/);
  });

  it("admits legacy null receipts but closes known non-accepted policies", () => {
    const sql = publicMediaEligibilitySqlText("ma");
    expect(sql).toContain("ma.quality_policy_version is null");
    expect(sql).toContain("ove231.launch-media-quality.v1");
    expect(sql).toContain("ma.quality_class = 'accepted'");
  });
});
