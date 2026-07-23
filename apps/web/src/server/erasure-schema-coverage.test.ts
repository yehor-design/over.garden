import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertErasureCoverageCompleteness,
  ERASURE_SCHEMA_COVERAGE,
  ERASURE_SCHEMA_COVERAGE_VERSION,
  ERASURE_SQL_DISCOVERY_REQUIRED_IDS,
  listErasureCoverageEntries,
} from "./erasure-schema-coverage";

describe("OVE-192 erasure schema coverage", () => {
  it("exposes a versioned owned coverage manifest", () => {
    expect(ERASURE_SCHEMA_COVERAGE_VERSION).toBe("ove192.erasure-schema.v1");
    expect(listErasureCoverageEntries().length).toBeGreaterThan(40);
    assertErasureCoverageCompleteness({
      discoveredPathIds: listErasureCoverageEntries().map((entry) => entry.id),
    });
  });

  it("classifies community restrict FKs as anonymize without weaken", () => {
    for (const id of [
      "community_contributions.removed_by_user_id",
      "community_contribution_reports.resolved_by_user_id",
      "community_moderation_audit_log.actor_user_id",
    ]) {
      const entry = ERASURE_SCHEMA_COVERAGE.find((candidate) => candidate.id === id);
      expect(entry?.disposition).toBe("anonymize");
    }
  });

  it("classifies engagement likes as not-account-linkable", () => {
    const entry = ERASURE_SCHEMA_COVERAGE.find(
      (candidate) => candidate.id === "engagement_likes.anonymous_device_hash",
    );
    expect(entry?.disposition).toBe("not-account-linkable");
  });

  it("requires OVE-203 identity and OVE-207 cover inventory", () => {
    for (const id of ERASURE_SQL_DISCOVERY_REQUIRED_IDS) {
      expect(
        ERASURE_SCHEMA_COVERAGE.some((entry) => entry.id === id),
      ).toBe(true);
    }

    const sql = readFileSync(
      join(process.cwd(), "sql/0001_walking_skeleton.sql"),
      "utf8",
    );
    expect(sql).toContain("cover_media_asset_id");
    expect(sql).toContain("usage_role");
    expect(sql).toContain("user_handle_registry");
    expect(sql).toContain("cleanup_pending");
  });
});
