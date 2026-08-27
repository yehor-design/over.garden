import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";
import {
  buildFoundationPlan,
  foundationBuildDigest,
} from "./foundation-builder";
import {
  buildEnqueueFoundationBuildJobQuery,
  buildInsertFoundationReleaseQuery,
  REGISTRY_DECISION_ACTIONS,
  STABLE_REGISTRY_FOUNDATION_BUILD_KIND,
} from "./release-repository";

class TestPostgresDialect implements Dialect {
  createDriver(): Driver {
    return new DummyDriver();
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}

const testDb = new Kysely<Database>({ dialect: new TestPostgresDialect() });
const releaseId = "00000000-0000-4000-8000-000000000255";
const captureId = "00000000-0000-4000-8000-000000000254";
const snapshotId = "00000000-0000-4000-8000-000000000253";
const ownerId = "00000000-0000-4000-8000-000000000001";
const digest = "a".repeat(64);
const migrationPath = path.resolve(
  process.cwd(),
  "sql/0024_ove255_stable_registry_foundation.sql",
);

describe("Stable Registry Foundation release contracts", () => {
  it("reserves migration 0024 for append-only release state rather than source projection", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    for (const table of [
      "catalog_item_revisions",
      "catalog_registry_releases",
      "catalog_registry_release_members",
      "catalog_registry_exception_groups",
      "catalog_registry_decisions",
      "catalog_registry_activations",
      "catalog_registry_search_outbox",
    ]) {
      expect(migration).toContain(`create table if not exists ${table}`);
    }
    expect(migration).toContain("catalog_item_revisions_append_only");
    expect(migration).toContain("catalog_registry_release_members_append_only");
    expect(migration).toContain("catalog_registry_decisions_append_only");
    expect(migration).toContain("catalog_registry_activations_append_only");
    expect(migration).toContain("catalog_registry_releases_state_transition");
    expect(migration).toContain("catalog_registry_exception_groups_transition");
    expect(migration).toContain(
      "approved registry preview digest is immutable",
    );
    expect(migration).toContain(
      "registry release activation receipt is immutable",
    );
    expect(migration).toContain("overgarden.registry_actor_erasure_rekey");
    expect(migration).toContain("00000000-0000-4000-8000-00000000ead1");
    expect(migration).toContain("'foundation' or (capture_id is not null");
    expect(migration).toContain("'stable_registry_foundation_build'");
    expect(migration).not.toMatch(
      /insert\s+into\s+(?:catalog_items|catalog_item_names|catalog_source_links)/iu,
    );
  });

  it("classifies source facts deterministically and keeps authority-unresolved facts grouped", () => {
    const plan = buildFoundationPlan({
      captureManifestSha256: digest,
      records: [
        {
          rightsCleared: true,
          objectKind: "plant",
          hasRequiredHierarchy: true,
          hasDeterministicAuthorityMapping: true,
        },
        {
          rightsCleared: true,
          objectKind: "animal",
          hasRequiredHierarchy: true,
          hasDeterministicAuthorityMapping: false,
        },
        {
          rightsCleared: false,
          objectKind: "plant",
          hasRequiredHierarchy: true,
          hasDeterministicAuthorityMapping: true,
        },
      ],
    });

    expect(plan.counts).toMatchObject({
      auto_ready: 1,
      needs_review: 1,
      source_only: 1,
      product_eligible: 0,
    });
    expect(plan.exceptionGroups.map((group) => group.reason)).toEqual([
      "authority_corroboration_required",
      "source_only_or_ineligible",
    ]);
    expect(JSON.stringify(plan)).not.toMatch(/latitude|longitude|raw_payload/i);
  });

  it("uses the capture receipt and policy version for a stable draft key", () => {
    expect(
      foundationBuildDigest({
        captureId,
        captureManifestSha256: digest,
      }),
    ).toBe(
      foundationBuildDigest({
        captureId,
        captureManifestSha256: digest,
      }),
    );
    expect(() =>
      foundationBuildDigest({ captureId, captureManifestSha256: "bad" }),
    ).toThrow("Invalid capture manifest digest.");
  });

  it("enqueues only the opaque release UUID for the worker", () => {
    const compiled = buildEnqueueFoundationBuildJobQuery(
      testDb,
      releaseId,
    ).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(JSON.stringify(compiled.parameters)).toContain(
      STABLE_REGISTRY_FOUNDATION_BUILD_KIND,
    );
    expect(JSON.stringify(compiled.parameters)).toContain(releaseId);
    expect(JSON.stringify(compiled.parameters)).not.toMatch(
      /raw_payload|source_only_fields|latitude|longitude/i,
    );
  });

  it("writes a Foundation release with no source payload and an explicit safe summary", () => {
    const compiled = buildInsertFoundationReleaseQuery(testDb, {
      captureId,
      sourceSnapshotId: snapshotId,
      createdByUserId: ownerId,
      buildDigest: digest,
    }).compile();

    expect(compiled.sql).toContain("catalog_registry_releases");
    expect(compiled.parameters).toContain("foundation");
    expect(compiled.parameters).toContain(captureId);
    expect(compiled.parameters).toContain(snapshotId);
    expect(compiled.parameters).not.toContain("raw_payload");
  });

  it("keeps the closed owner decision vocabulary exact", () => {
    expect(REGISTRY_DECISION_ACTIONS).toEqual([
      "same_concept",
      "different_concept",
      "add_alias",
      "keep_current",
      "create_successor",
      "defer",
      "block_rule",
    ]);
  });

  it("uses distinct aggregate counts so member and exception joins cannot inflate a receipt", () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        "src/server/stable-registry/release-repository.ts",
      ),
      "utf8",
    );
    expect(source).toContain(
      'count(distinct members.id)::int as "memberCount"',
    );
    expect(source).toContain("count(distinct groups.id) filter");
    expect(source).not.toContain("raw_payload");
    expect(source).not.toContain("source_only_fields");
  });
});
