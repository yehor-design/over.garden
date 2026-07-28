import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertErasureCoverageCompleteness,
  discoverErasurePathsFromWalkingSkeletonSql,
  ERASURE_SCHEMA_COVERAGE,
  ERASURE_SCHEMA_COVERAGE_VERSION,
  ERASURE_SQL_DISCOVERY_REQUIRED_IDS,
  listErasureCoverageEntries,
} from "./erasure-schema-coverage";

describe("OVE-215 erasure schema coverage", () => {
  it("exposes a versioned owned coverage manifest", () => {
    expect(ERASURE_SCHEMA_COVERAGE_VERSION).toBe("ove215.erasure-schema.v2");
    expect(listErasureCoverageEntries().length).toBeGreaterThan(40);
    const sql = readFileSync(
      join(process.cwd(), "sql/0001_walking_skeleton.sql"),
      "utf8",
    );
    assertErasureCoverageCompleteness({
      discoveredPathIds: discoverErasurePathsFromWalkingSkeletonSql(sql),
    });
  });

  it.each([
    [
      "user FK",
      `create table if not exists synthetic_identity (\n  id uuid primary key,\n  owner_user_id uuid\n);\nalter table synthetic_identity add constraint synthetic_identity_owner_fkey foreign key (owner_user_id) references "user"(id);`,
      "synthetic_identity.owner_user_id",
    ],
    [
      "soft identity column",
      `create table if not exists synthetic_identity (\n  id uuid primary key,\n  recovery_email text\n);`,
      "synthetic_identity.recovery_email",
    ],
    [
      "JSON identity path",
      `create table if not exists synthetic_identity (\n  id uuid primary key,\n  identity_payload jsonb check ((identity_payload->>'userId') is not null)\n);`,
      "synthetic_identity.identity_payload.userId",
    ],
  ])("fails closed for an unclassified %s", (_label, sqlFixture, expectedPath) => {
    const discovered = discoverErasurePathsFromWalkingSkeletonSql(sqlFixture);
    expect(discovered).toContain(expectedPath);
    expect(() =>
      assertErasureCoverageCompleteness({ discoveredPathIds: discovered }),
    ).toThrow(expectedPath);
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
