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
  EXTENSION_PACK_DECISION_ACTIONS,
  EXTENSION_PACK_ROW_CLASSES,
  isExtensionPackExceptionClass,
} from "@/lib/stable-registry/extension-pack-actions";

import {
  buildEnqueueExtensionPackBuildJobQuery,
  parentScopeAllowsPackKind,
  STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND,
} from "./extension-pack-repository";

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
  "sql/0027_ove328_stable_registry_extension_packs.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

describe("OVE-328 migration 0027 extension pack schema", () => {
  it("reserves 0027 for pack persistence over the existing release model", () => {
    expect(existsSync(migrationPath)).toBe(true);
    for (const table of [
      "catalog_registry_extension_packs",
      "catalog_registry_extension_pack_rows",
      "catalog_registry_extension_pack_names",
      "catalog_registry_extension_pack_user_names",
    ]) {
      expect(migration).toContain(`create table if not exists ${table}`);
    }
    // It reuses OVE-255 releases and the OVE-257 projection rather than
    // creating a second release model or a second search owner.
    expect(migration).toContain("references catalog_registry_releases(id)");
    expect(migration).toContain("stable_registry_product_catalog_records");
    expect(migration).not.toContain(
      "create table if not exists catalog_registry_releases",
    );
  });

  it("makes pack identity the artifact so replay cannot fork a second pack", () => {
    expect(migration).toContain(
      "unique (source_slug, declared_source_version, artifact_digest)",
    );
    expect(migration).toContain("extension pack identity is immutable");
  });

  it("requires a bound parent before a row can be product eligible", () => {
    // INV-02: a variety or breed without an active parent species is held.
    expect(migration).toContain(
      "row_class <> 'product_eligible' or parent_catalog_item_id is not null",
    );
  });

  it("keeps one official denomination per parent, locale, and pack", () => {
    expect(migration).toContain(
      "catalog_registry_extension_pack_rows_candidate_uidx",
    );
    expect(migration).toContain("normalized_denomination");
  });

  it("keeps name_class in the names key so a duplicate spelling is not dropped", () => {
    expect(migration).toContain(
      "primary key (pack_row_id, name_class, locale, normalized_name)",
    );
  });

  it("freezes approved pack rows and only lets pack state advance", () => {
    expect(migration).toContain("approved extension pack rows are immutable");
    expect(migration).toContain("extension pack state may only advance");
  });

  it("passes only an opaque pack id through the worker queue", () => {
    expect(migration).toContain(
      "job_queue_stable_registry_extension_pack_build_payload_check",
    );
    expect(migration).toContain(
      "payload - array['kind', 'packId']::text[] = '{}'::jsonb",
    );
  });

  it("never reads a raw payload or a location field into the projection", () => {
    expect(migration).toContain("stable_registry_public_safe_label");
    expect(migration).not.toMatch(/latitude|longitude/iu);
    expect(migration).not.toContain("raw_payload");
  });
});

describe("extension pack vocabulary", () => {
  it("exposes exactly the closed owner decision set", () => {
    expect(EXTENSION_PACK_DECISION_ACTIONS).toEqual([
      "bind_parent",
      "same_item",
      "different_item",
      "add_alias",
      "defer",
      "reject",
    ]);
  });

  it("treats only unresolved classes as exception groups", () => {
    const exceptions = EXTENSION_PACK_ROW_CLASSES.filter(
      isExtensionPackExceptionClass,
    );
    // `clean` and `product_eligible` are batch-approvable, `rejected` is
    // terminal, so none of them belongs in the owner's exception inbox.
    expect(exceptions).toEqual([
      "needs_parent",
      "collision",
      "duplicate",
      "rights_blocked",
      "review_needed",
    ]);
  });
});

describe("parent binding kind rules", () => {
  it("binds a breed only to an animal-capable parent", () => {
    expect(parentScopeAllowsPackKind("animal", "breed")).toBe(true);
    expect(parentScopeAllowsPackKind("either", "breed")).toBe(true);
    expect(parentScopeAllowsPackKind("plant", "breed")).toBe(false);
  });

  it("binds a variety only to a plant-capable parent", () => {
    expect(parentScopeAllowsPackKind("plant", "plant_variety")).toBe(true);
    expect(parentScopeAllowsPackKind("either", "plant_variety")).toBe(true);
    expect(parentScopeAllowsPackKind("animal", "plant_variety")).toBe(false);
  });
});

describe("worker enqueue contract", () => {
  it("sends only the opaque pack id on the canonical matching queue", () => {
    const compiled = buildEnqueueExtensionPackBuildJobQuery(
      testDb,
      "00000000-0000-4000-8000-000000328001",
    ).compile();

    expect(compiled.sql).toContain('insert into "job_queue"');
    const payload = compiled.parameters.find(
      (parameter) =>
        typeof parameter === "object" &&
        parameter !== null &&
        "kind" in (parameter as Record<string, unknown>),
    ) as Record<string, unknown> | undefined;
    expect(payload).toEqual({
      kind: STABLE_REGISTRY_EXTENSION_PACK_BUILD_KIND,
      packId: "00000000-0000-4000-8000-000000328001",
    });
    // No source row, denomination, or artifact travels through the queue.
    expect(Object.keys(payload ?? {})).toEqual(["kind", "packId"]);
  });
});
