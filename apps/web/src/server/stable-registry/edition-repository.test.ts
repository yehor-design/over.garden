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
  EDITION_DECISION_ACTIONS,
  EDITION_DIFF_CLASSES,
  EDITION_RELATION_KINDS,
  isEditionBlockingDiffClass,
  isEditionReviewableDiffClass,
} from "@/lib/stable-registry/edition-actions";

import {
  buildEditionDiffGroupsQuery,
  buildEnqueueEditionBuildJobQuery,
  relationKindForDecision,
  STABLE_REGISTRY_EDITION_BUILD_KIND,
} from "./edition-repository";

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
const migrationPath = path.resolve(
  process.cwd(),
  "sql/0028_ove258_stable_registry_editions.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

describe("OVE-258 migration 0028 edition schema", () => {
  it("reserves 0028 for diffs, relations, and an activation sequence", () => {
    expect(existsSync(migrationPath)).toBe(true);
    for (const table of [
      "catalog_registry_edition_diffs",
      "catalog_registry_item_relations",
      "catalog_registry_activation_sequence",
    ]) {
      expect(migration).toContain(`create table if not exists ${table}`);
    }
  });

  it("keeps relations and activation receipts append-only", () => {
    expect(migration).toContain("registry item relations are append-only");
    expect(migration).toContain("registry activation receipts are append-only");
    expect(migration).toContain("approved edition diff groups are immutable");
  });

  it("stores the affected-object impact as an aggregate, never as user rows", () => {
    expect(migration).toContain("affected_object_count integer not null");
    expect(migration).toContain("affected_object_digest text not null");
    // The impact function counts objects; it never selects an owner or a journal.
    expect(migration).toContain(
      "create or replace function stable_registry_edition_affected_objects",
    );
    expect(migration).not.toContain("owner_user_id");
    expect(migration).not.toContain("journal_entries");
  });

  it("orders the pointer history so rollback appends instead of rewriting", () => {
    expect(migration).toContain("unique (release_family, sequence_number)");
    expect(migration).toContain(
      "check (transition in ('activate', 'rollback', 'forward'))",
    );
    expect(migration).toContain("unique (receipt_digest)");
  });

  it("derives a compatibility relation without reassigning a garden object", () => {
    expect(migration).toContain("merged_into_catalog_item_id is not null");
    expect(migration).toContain("on conflict do nothing");
    // A backfill must never touch plant_objects.catalog_item_id.
    expect(migration).not.toMatch(/update\s+plant_objects/iu);
  });

  it("refuses a self-referencing or targetless relation", () => {
    expect(migration).toContain(
      "catalog_registry_item_relations_distinct_check",
    );
    expect(migration).toContain(
      "catalog_registry_item_relations_target_shape_check",
    );
  });
});

describe("edition vocabulary", () => {
  it("exposes the closed owner decision set", () => {
    expect(EDITION_DECISION_ACTIONS).toEqual([
      "keep_current",
      "add_alias",
      "same_concept",
      "different_concept",
      "create_successor",
      "record_equivalence",
      "record_split",
      "defer",
      "block_rule",
    ]);
    expect(EDITION_RELATION_KINDS).toEqual([
      "same_concept",
      "equivalent_to",
      "replaced_by",
      "split_into",
    ]);
  });

  it("never asks the owner to review an unchanged record", () => {
    const reviewable = EDITION_DIFF_CLASSES.filter(
      isEditionReviewableDiffClass,
    );
    expect(reviewable).not.toContain("unchanged");
    // That exclusion is the whole point: workload tracks change, not corpus.
    expect(reviewable).toHaveLength(EDITION_DIFF_CLASSES.length - 1);
  });

  it("blocks approval only on classes that change or retire an identity", () => {
    expect(EDITION_DIFF_CLASSES.filter(isEditionBlockingDiffClass)).toEqual([
      "correction",
      "supersession",
      "split",
      "rights_change",
    ]);
    // Additions and aliases are additive, so they never hold up an edition.
    expect(isEditionBlockingDiffClass("addition")).toBe(false);
    expect(isEditionBlockingDiffClass("alias")).toBe(false);
  });
});

describe("decision to relation mapping", () => {
  it("records a relation only for the four identity decisions", () => {
    expect(relationKindForDecision("same_concept")).toBe("same_concept");
    expect(relationKindForDecision("record_equivalence")).toBe("equivalent_to");
    expect(relationKindForDecision("create_successor")).toBe("replaced_by");
    expect(relationKindForDecision("record_split")).toBe("split_into");
  });

  it("records no relation for an owner judgement that changes no identity", () => {
    for (const action of [
      "keep_current",
      "add_alias",
      "different_concept",
      "defer",
      "block_rule",
    ] as const) {
      expect(relationKindForDecision(action)).toBeNull();
    }
  });
});

describe("diff group reads", () => {
  it("scopes every read to one release", () => {
    const compiled = buildEditionDiffGroupsQuery(
      testDb,
      "00000000-0000-4000-8000-000000000258",
    ).compile();

    expect(compiled.sql).toContain("catalog_registry_edition_diffs");
    expect(compiled.sql).toContain('"release_id" = $');
    expect(compiled.parameters).toContain(
      "00000000-0000-4000-8000-000000000258",
    );
    // Aggregate columns only: no denomination and no object identity.
    expect(compiled.sql).not.toContain("canonical_name");
    expect(compiled.sql).not.toContain("plant_object");
  });
});

describe("preparing an edition", () => {
  it("hands the comparison to the worker under one idempotent key", () => {
    const releaseId = "00000000-0000-4000-8000-000000000258";
    const compiled = buildEnqueueEditionBuildJobQuery(
      testDb,
      releaseId,
    ).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    expect(compiled.parameters).toContain("matching");
    // A second prepare of the same draft must not queue a second comparison.
    expect(compiled.parameters).toContain(
      `stable-registry-edition:${releaseId}`,
    );
    expect(compiled.sql).toContain("on conflict");

    // The payload carries one opaque release id and nothing else: the worker
    // reads what it needs from Postgres rather than from the queue.
    const payload = compiled.parameters.find(
      (parameter) =>
        typeof parameter === "object" &&
        parameter !== null &&
        "kind" in parameter,
    );
    expect(payload).toEqual({
      kind: STABLE_REGISTRY_EDITION_BUILD_KIND,
      releaseId,
    });
  });

  it("names the kind the worker manifest consumes", () => {
    expect(STABLE_REGISTRY_EDITION_BUILD_KIND).toBe(
      "stable_registry_edition_build",
    );
  });
});
