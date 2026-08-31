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
  catalogTypeaheadObjectKindScopeMatches,
  toCatalogTypeaheadDocument,
  catalogTypeaheadHitToSuggestion,
} from "@/server/search/catalog-documents";
import {
  buildActiveStableRegistryProductTrigramTypeaheadQuery,
  buildActiveStableRegistryProductTypeaheadQuery,
  buildActiveStableRegistryProductTypeaheadReindexRowsQuery,
  isStableRegistryObjectKindScope,
  objectKindScopeMatches,
  STABLE_REGISTRY_OBJECT_KIND_SCOPES,
  STABLE_REGISTRY_PRODUCT_MAX_SUGGESTIONS,
  STABLE_REGISTRY_PRODUCT_QUERY_DEADLINE_MS,
  STABLE_REGISTRY_PRODUCT_TRIGRAM_THRESHOLD,
  normalizeStableRegistryProductQuery,
} from "./product-projection-repository";

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
  "sql/0026_ove257_stable_registry_product_projection.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

const releaseId = "00000000-0000-4000-8000-000000257900";
const revisionId = "00000000-0000-4000-8000-000000257901";
const itemId = "00000000-0000-4000-8000-000000257001";

function registryHit(overrides: Record<string, unknown> = {}) {
  return {
    catalogItemId: itemId,
    displayName: "Solanum lycopersicum",
    canonicalName: "Solanum lycopersicum",
    normalizedName: "solanum lycopersicum",
    locale: "la",
    itemLocale: "la",
    status: "confirmed",
    source: "stable_registry",
    catalogKind: "species",
    eligibilityScope: "stable_registry",
    objectKindScope: "either",
    publicSlug: "solanum-lycopersicum",
    registryReleaseId: releaseId,
    revisionId,
    nameClass: "scientific",
    ...overrides,
  };
}

describe("OVE-257 migration 0026 product projection schema", () => {
  it("reserves 0026 for a release-scoped product projection, not a mutable catalog flag", () => {
    expect(existsSync(migrationPath)).toBe(true);

    for (const table of [
      "stable_registry_product_catalog_records",
      "stable_registry_product_catalog_names",
      "stable_registry_product_projection_outbox",
    ]) {
      expect(migration).toContain(`create table if not exists ${table}`);
    }
    expect(migration).toContain(
      "create or replace function materialize_stable_registry_product_release",
    );
    expect(migration).toContain(
      "catalog_registry_product_projection_materialize",
    );
  });

  it("derives membership only from an active foundation release marked product_eligible", () => {
    expect(migration).toContain("members.eligibility = 'product_eligible'");
    expect(migration).toContain("releases.release_kind = 'foundation'");
    expect(migration).toContain("releases.state = 'active'");
    // A merged or split revision is history, never a selectable identity.
    expect(migration).toContain(
      "revisions.identity_relation not in ('merged_into', 'split_from')",
    );
  });

  it("keeps species selectable by both object kinds instead of guessing one", () => {
    expect(migration).toContain(
      "check (object_kind_scope in ('plant', 'animal', 'either'))",
    );
    expect(migration).toContain("when 'breed' then 'animal'");
    expect(migration).toContain("when 'plant_variety' then 'plant'");
    expect(migration).toContain("else 'either'");
  });

  it("passes every projected label through the public-safe allowlist", () => {
    // The projection must not become a second, laxer text boundary than the
    // OVE-256 public read model.
    expect(migration).toContain("stable_registry_public_safe_label");
    expect(migration).not.toMatch(/latitude|longitude/i);
    expect(migration).not.toContain("allowed_projection");
    expect(migration).not.toContain("raw_response");
  });

  it("records a durable per-identity projection intent for the derived index", () => {
    expect(migration).toContain(
      "insert into stable_registry_product_projection_outbox",
    );
    expect(migration).toContain(
      "check (state in ('pending', 'processing', 'done', 'failed'))",
    );
  });
});

describe("active product eligibility predicate", () => {
  it("only ever reads through the live foundation pointer and an active release", () => {
    const compiled = buildActiveStableRegistryProductTypeaheadQuery(
      testDb,
      "solanum",
      "plant",
    ).compile();

    expect(compiled.sql).toContain("catalog_registry_active_pointers");
    expect(compiled.sql).toContain('"pointers"."release_family" = $');
    expect(compiled.sql).toContain('"releases"."state" = $');
    expect(compiled.parameters).toContain("foundation");
    expect(compiled.parameters).toContain("active");
  });

  it("admits a scoped kind and the both-kinds species scope, and nothing else", () => {
    const compiled = buildActiveStableRegistryProductTypeaheadQuery(
      testDb,
      "solanum",
      "animal",
    ).compile();

    expect(compiled.sql).toContain('"records"."object_kind_scope" = $');
    expect(compiled.parameters).toContain("animal");
    expect(compiled.parameters).toContain("either");
    expect(compiled.parameters).not.toContain("plant");
  });

  it("bounds the row scan so a large corpus cannot become an unbounded read", () => {
    const compiled = buildActiveStableRegistryProductTypeaheadQuery(
      testDb,
      "sol",
      "plant",
      STABLE_REGISTRY_PRODUCT_MAX_SUGGESTIONS,
    ).compile();

    expect(compiled.sql).toContain("limit");
    expect(STABLE_REGISTRY_PRODUCT_QUERY_DEADLINE_MS).toBe(500);
    expect(STABLE_REGISTRY_PRODUCT_MAX_SUGGESTIONS).toBe(8);
  });

  it("rebuilds the derived index from the projection rather than mutable catalog rows", () => {
    const compiled =
      buildActiveStableRegistryProductTypeaheadReindexRowsQuery(
        testDb,
      ).compile();

    expect(compiled.sql).toContain("stable_registry_product_catalog_records");
    expect(compiled.sql).toContain("catalog_registry_active_pointers");
    expect(compiled.sql).not.toContain('from "catalog_items"');
  });

  it("normalizes and bounds a hostile query before it reaches Postgres", () => {
    expect(
      normalizeStableRegistryProductQuery("  Solanum   Lycopersicum "),
    ).toBe("solanum lycopersicum");
    expect(normalizeStableRegistryProductQuery("x".repeat(400))).toHaveLength(
      120,
    );
  });
});

describe("object kind scope", () => {
  it("treats `either` as selectable by both kinds and never as unknown", () => {
    expect(STABLE_REGISTRY_OBJECT_KIND_SCOPES).toEqual([
      "plant",
      "animal",
      "either",
    ]);
    expect(objectKindScopeMatches("either", "plant")).toBe(true);
    expect(objectKindScopeMatches("either", "animal")).toBe(true);
    expect(objectKindScopeMatches("plant", "animal")).toBe(false);
    expect(objectKindScopeMatches("animal", "plant")).toBe(false);
    expect(isStableRegistryObjectKindScope("unknown")).toBe(false);
  });

  it("shares one scope rule with the derived search document boundary", () => {
    expect(catalogTypeaheadObjectKindScopeMatches("either", "animal")).toBe(
      true,
    );
    expect(catalogTypeaheadObjectKindScopeMatches("plant", "animal")).toBe(
      false,
    );
  });
});

describe("derived document boundary for active release identities", () => {
  it("carries the release facets a stale hit can be validated against", () => {
    const document = toCatalogTypeaheadDocument({
      id: itemId,
      displayName: "Solanum lycopersicum",
      canonicalName: "Solanum lycopersicum",
      normalizedName: "solanum lycopersicum",
      catalogKind: "species",
      status: "confirmed",
      source: "stable_registry",
      createdByUserId: null,
      itemLocale: "la",
      aliasNormalizedName: "solanum lycopersicum",
      aliasLocale: "la",
      isPrimary: true,
      eligibilityScope: "stable_registry",
      objectKindScope: "either",
      publicSlug: "solanum-lycopersicum",
      registryReleaseId: releaseId,
      revisionId,
      nameClass: "scientific",
    });

    expect(document).not.toBeNull();
    expect(document?.eligibilityScope).toBe("stable_registry");
    expect(document?.objectKindScope).toBe("either");
    expect(document?.registryReleaseId).toBe(releaseId);
  });

  it("refuses a registry-scoped row whose release facets are incomplete", () => {
    for (const broken of [
      { publicSlug: undefined },
      { registryReleaseId: undefined },
      { revisionId: undefined },
      { nameClass: "invented" },
    ]) {
      const document = toCatalogTypeaheadDocument({
        id: itemId,
        displayName: "Solanum lycopersicum",
        canonicalName: "Solanum lycopersicum",
        normalizedName: "solanum lycopersicum",
        catalogKind: "species",
        status: "confirmed",
        source: "stable_registry",
        createdByUserId: null,
        itemLocale: "la",
        aliasNormalizedName: "solanum lycopersicum",
        aliasLocale: "la",
        isPrimary: true,
        eligibilityScope: "stable_registry",
        objectKindScope: "either",
        publicSlug: "solanum-lycopersicum",
        registryReleaseId: releaseId,
        revisionId,
        nameClass: "scientific",
        ...broken,
      });
      expect(document).toBeNull();
    }
  });

  it("scopes the document key to the release so an edition cannot overwrite history", () => {
    const first = toCatalogTypeaheadDocument({
      id: itemId,
      displayName: "Solanum lycopersicum",
      canonicalName: "Solanum lycopersicum",
      normalizedName: "solanum lycopersicum",
      catalogKind: "species",
      status: "confirmed",
      source: "stable_registry",
      createdByUserId: null,
      itemLocale: "la",
      aliasNormalizedName: "solanum lycopersicum",
      aliasLocale: "la",
      isPrimary: true,
      eligibilityScope: "stable_registry",
      objectKindScope: "either",
      publicSlug: "solanum-lycopersicum",
      registryReleaseId: releaseId,
      revisionId,
      nameClass: "scientific",
    });
    const second = toCatalogTypeaheadDocument({
      id: itemId,
      displayName: "Solanum lycopersicum",
      canonicalName: "Solanum lycopersicum",
      normalizedName: "solanum lycopersicum",
      catalogKind: "species",
      status: "confirmed",
      source: "stable_registry",
      createdByUserId: null,
      itemLocale: "la",
      aliasNormalizedName: "solanum lycopersicum",
      aliasLocale: "la",
      isPrimary: true,
      eligibilityScope: "stable_registry",
      objectKindScope: "either",
      publicSlug: "solanum-lycopersicum",
      registryReleaseId: "00000000-0000-4000-8000-000000257902",
      revisionId,
      nameClass: "scientific",
    });

    expect(first?.id).not.toBe(second?.id);
  });

  it("refuses a hit that claims registry scope without the registry source", () => {
    expect(
      catalogTypeaheadHitToSuggestion(registryHit({ source: "internal_seed" })),
    ).toBeNull();
    expect(
      catalogTypeaheadHitToSuggestion(registryHit({ status: "seeded" })),
    ).toBeNull();
    expect(
      catalogTypeaheadHitToSuggestion(
        registryHit({ publicSlug: "Not A Slug" }),
      ),
    ).toBeNull();
  });

  it("accepts a complete registry hit and keeps its scope for the picker filter", () => {
    const suggestion = catalogTypeaheadHitToSuggestion(registryHit());

    expect(suggestion).not.toBeNull();
    expect(suggestion?.objectKindScope).toBe("either");
    expect(suggestion?.registryReleaseId).toBe(releaseId);
    expect(suggestion?.nameClass).toBe("scientific");
  });
});

describe("trigram typeahead", () => {
  it("reaches the trigram index and pins the similarity floor in the predicate", () => {
    const compiled = buildActiveStableRegistryProductTrigramTypeaheadQuery(
      testDb,
      "помдор",
      "plant",
    ).compile();

    // `%` is what reaches the GIN index; the explicit comparison beside it is
    // what makes the result independent of `pg_trgm.similarity_threshold`.
    expect(compiled.sql).toContain("%");
    expect(compiled.sql).toContain("similarity(lower(");
    expect(compiled.parameters).toContain(
      STABLE_REGISTRY_PRODUCT_TRIGRAM_THRESHOLD,
    );
    expect(compiled.parameters).toContain("помдор");
  });

  it("applies every guard the substring query applies", () => {
    const trigram = buildActiveStableRegistryProductTrigramTypeaheadQuery(
      testDb,
      "помдор",
      "plant",
    ).compile();
    const substring = buildActiveStableRegistryProductTypeaheadQuery(
      testDb,
      "помідор",
      "plant",
    ).compile();

    // The active-release projection, the release family, and the object-kind
    // scope must all be present, so a fuzzy hit cannot reach a gardener
    // through a weaker predicate than an exact hit.
    for (const guard of [
      "catalog_registry_active_pointers",
      "catalog_registry_releases",
      "stable_registry_product_catalog_records",
    ]) {
      expect(trigram.sql).toContain(guard);
      expect(substring.sql).toContain(guard);
    }
    for (const parameter of ["foundation", "active", "plant", "either"]) {
      expect(trigram.parameters).toContain(parameter);
      expect(substring.parameters).toContain(parameter);
    }
  });

  it("ranks by similarity instead of the substring case ladder", () => {
    const compiled = buildActiveStableRegistryProductTrigramTypeaheadQuery(
      testDb,
      "помдор",
      "plant",
    ).compile();

    expect(compiled.sql).toContain("order by similarity(lower(");
    expect(compiled.sql).not.toContain("like");
  });

  it("keeps the interactive deadline unchanged", () => {
    expect(STABLE_REGISTRY_PRODUCT_QUERY_DEADLINE_MS).toBe(500);
  });
});
