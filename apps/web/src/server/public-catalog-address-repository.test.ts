import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
  type QueryResult,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";

import {
  buildCatalogIdentifierLookupQuery,
  buildCatalogItemAddressQuery,
  buildCatalogSlugHistoryLookupQuery,
  normalizeCatalogAliasValue,
  readPublicCatalogCanonicalAddress,
  requestedCatalogPath,
  resolvePublicCatalogAddress,
  resolvePublicCatalogAlias,
  resolvePublicCatalogPermalink,
} from "./public-catalog-address-repository";

const SPECIES = "11111111-1111-4111-8111-111111111111";
const FORM = "22222222-2222-4222-8222-222222222222";
const MERGED = "33333333-3333-4333-8333-333333333333";
const RETIRED = "44444444-4444-4444-8444-444444444444";
const ORPHAN_FORM = "55555555-5555-4555-8555-555555555555";
const LOOP_A = "66666666-6666-4666-8666-666666666666";
const LOOP_B = "77777777-7777-4777-8777-777777777777";
const GARDENER_CARD = "88888888-8888-4888-8888-888888888888";

class CompileOnlyDialect implements Dialect {
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

type Handler = (sql: string, parameters: readonly unknown[]) => unknown[];

function scriptedDb(handler: Handler) {
  class ScriptedConnection implements DatabaseConnection {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      return { rows: handler(compiled.sql, compiled.parameters) as R[] };
    }
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error("streaming is not scripted");
    }
  }
  class ScriptedDriver implements Driver {
    async init() {}
    async acquireConnection() {
      return new ScriptedConnection();
    }
    async beginTransaction() {}
    async commitTransaction() {}
    async rollbackTransaction() {}
    async releaseConnection() {}
    async destroy() {}
  }
  return new Kysely<Database>({
    dialect: {
      createDriver: () => new ScriptedDriver(),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createAdapter: () => new PostgresAdapter(),
      createIntrospector: (db) => new PostgresIntrospector(db),
    },
  });
}

function item(
  id: string,
  overrides: Partial<{
    catalogKind: string;
    nodeKind: string;
    publicSlug: string | null;
    identityState: string;
    status: string;
    createdByUserId: string | null;
    mergedIntoCatalogItemId: string | null;
    speciesSlug: string | null;
  }>,
) {
  return {
    id,
    catalogKind: "species",
    nodeKind: "taxon",
    publicSlug: "solanum-lycopersicum",
    identityState: "active",
    status: "seeded",
    createdByUserId: null,
    mergedIntoCatalogItemId: null,
    speciesSlug: null,
    ...overrides,
  };
}

const ITEMS: Record<string, ReturnType<typeof item>> = {
  [SPECIES]: item(SPECIES, {}),
  [FORM]: item(FORM, {
    catalogKind: "plant_variety",
    nodeKind: "cultivar",
    publicSlug: "de-barao",
    speciesSlug: "solanum-lycopersicum",
  }),
  [MERGED]: item(MERGED, {
    publicSlug: "old-merged",
    identityState: "merged",
    mergedIntoCatalogItemId: SPECIES,
  }),
  [RETIRED]: item(RETIRED, {
    catalogKind: "plant_variety",
    nodeKind: "cultivar",
    publicSlug: "retired-card",
    identityState: "retired",
  }),
  [ORPHAN_FORM]: item(ORPHAN_FORM, {
    catalogKind: "plant_variety",
    nodeKind: "cultivar",
    publicSlug: "orphan-form",
  }),
  [LOOP_A]: item(LOOP_A, {
    publicSlug: "loop-a",
    identityState: "merged",
    mergedIntoCatalogItemId: LOOP_B,
  }),
  [LOOP_B]: item(LOOP_B, {
    publicSlug: "loop-b",
    identityState: "merged",
    mergedIntoCatalogItemId: LOOP_A,
  }),
  [GARDENER_CARD]: item(GARDENER_CARD, {
    catalogKind: "plant_variety",
    nodeKind: "cultivar",
    publicSlug: "gardener-card",
    createdByUserId: "99999999-9999-4999-8999-999999999999",
  }),
};

const RETIRED_AT = new Date("2026-09-01T00:00:00.000Z");
const HISTORY = [
  { namespace: "species", slug: "solanum-lycopersicum", catalogItemId: SPECIES, validTo: null },
  { namespace: "species", slug: "lycopersicon-esculentum", catalogItemId: SPECIES, validTo: RETIRED_AT },
  { namespace: "form", slug: "de-barao", catalogItemId: FORM, validTo: null },
  { namespace: "form", slug: "de-barao-0000000101", catalogItemId: FORM, validTo: RETIRED_AT },
  { namespace: "species", slug: "old-merged", catalogItemId: MERGED, validTo: null },
  { namespace: "form", slug: "retired-card", catalogItemId: RETIRED, validTo: null },
  { namespace: "form", slug: "orphan-form", catalogItemId: ORPHAN_FORM, validTo: null },
  { namespace: "species", slug: "loop-a", catalogItemId: LOOP_A, validTo: null },
  { namespace: "form", slug: "gardener-card", catalogItemId: GARDENER_CARD, validTo: null },
];
const IDENTIFIERS = [{ scheme: "eppo", value: "LYPES", catalogItemId: SPECIES }];

function fixtureDb(log: string[] = []) {
  return scriptedDb((sql, parameters) => {
    log.push(sql);
    if (sql.includes('from "catalog_item_slug_history"')) {
      const [slug, ...rest] = parameters;
      const namespaces = rest.slice(0, -1) as string[];
      return HISTORY.filter(
        (row) => row.slug === slug && namespaces.includes(row.namespace),
      )
        .sort(
          (a, b) => (a.validTo === null ? 0 : 1) - (b.validTo === null ? 0 : 1),
        )
        .slice(0, 1);
    }
    if (sql.includes('from "catalog_items"')) {
      const [id] = parameters;
      const found = ITEMS[id as string];
      return found ? [found] : [];
    }
    if (sql.includes('from "catalog_item_identifiers"')) {
      const [scheme, value] = parameters;
      return IDENTIFIERS.filter((row) => row.scheme === scheme && row.value === value);
    }
    throw new Error(`Unexpected statement: ${sql}`);
  });
}

describe("public catalog address queries", () => {
  const compileDb = new Kysely<Database>({ dialect: new CompileOnlyDialect() });

  it("reads one history row per slug, the live assignment before a retired one", () => {
    const compiled = buildCatalogSlugHistoryLookupQuery(compileDb, "de-barao", [
      "form",
      "species",
    ]).compile();
    expect(compiled.sql).toContain('from "catalog_item_slug_history"');
    expect(compiled.sql).toContain('"catalog_item_slug_history"."slug" = $1');
    expect(compiled.sql).toContain('"catalog_item_slug_history"."namespace" in ($2, $3)');
    expect(compiled.sql).toContain(
      'order by case when "catalog_item_slug_history"."valid_to" is null then 0 else 1 end, "catalog_item_slug_history"."valid_from" desc limit $4',
    );
    expect(compiled.parameters).toEqual(["de-barao", "form", "species", 1]);
  });

  it("reads the node's kind, slug, lifecycle, merge target and species", () => {
    const compiled = buildCatalogItemAddressQuery(compileDb, SPECIES).compile();
    expect(compiled.sql).toContain('"catalog_items"."merged_into_catalog_item_id" as "mergedIntoCatalogItemId"');
    expect(compiled.sql).toContain('"catalog_items"."created_by_user_id" as "createdByUserId"');
    expect(compiled.sql).toContain("form_relation.relation_type = 'form_of'");
    expect(compiled.sql).toContain('where "catalog_items"."id" = $1');
    expect(compiled.parameters).toEqual([SPECIES]);
  });

  it("reads the oldest node carrying an identifier", () => {
    const compiled = buildCatalogIdentifierLookupQuery(compileDb, "eppo", "LYPES").compile();
    expect(compiled.sql).toBe(
      'select "catalog_item_identifiers"."catalog_item_id" as "catalogItemId" from "catalog_item_identifiers" where "catalog_item_identifiers"."scheme" = $1 and "catalog_item_identifiers"."value" = $2 order by "catalog_item_identifiers"."created_at" asc limit $3',
    );
    expect(compiled.parameters).toEqual(["eppo", "LYPES", 1]);
  });
});

describe("resolvePublicCatalogAddress (ADR-0026 D8)", () => {
  it("recognises the canonical species and form addresses", async () => {
    const db = fixtureDb();
    await expect(
      resolvePublicCatalogAddress(
        { kind: "species", speciesSlug: "solanum-lycopersicum", formSlug: null },
        db,
      ),
    ).resolves.toEqual({
      status: "canonical",
      catalogItemId: SPECIES,
      canonicalPath: "/species/solanum-lycopersicum",
    });
    await expect(
      resolvePublicCatalogAddress(
        { kind: "species", speciesSlug: "solanum-lycopersicum", formSlug: "de-barao" },
        db,
      ),
    ).resolves.toEqual({
      status: "canonical",
      catalogItemId: FORM,
      canonicalPath: "/species/solanum-lycopersicum/de-barao",
    });
  });

  it("redirects historical slugs, a form under a stale species slug and the legacy paths", async () => {
    const db = fixtureDb();
    const redirectToSpecies = {
      status: "redirect",
      catalogItemId: SPECIES,
      canonicalPath: "/species/solanum-lycopersicum",
    };
    const redirectToForm = {
      status: "redirect",
      catalogItemId: FORM,
      canonicalPath: "/species/solanum-lycopersicum/de-barao",
    };
    await expect(
      resolvePublicCatalogAddress(
        { kind: "species", speciesSlug: "lycopersicon-esculentum", formSlug: null },
        db,
      ),
    ).resolves.toEqual(redirectToSpecies);
    await expect(
      resolvePublicCatalogAddress(
        { kind: "species", speciesSlug: "lycopersicon-esculentum", formSlug: "de-barao" },
        db,
      ),
    ).resolves.toEqual(redirectToForm);
    await expect(
      resolvePublicCatalogAddress(
        { kind: "species", speciesSlug: "solanum-lycopersicum", formSlug: "de-barao-0000000101" },
        db,
      ),
    ).resolves.toEqual(redirectToForm);
    await expect(
      resolvePublicCatalogAddress(
        { kind: "legacy", catalogKind: "plant_variety", slug: "de-barao-0000000101" },
        db,
      ),
    ).resolves.toEqual(redirectToForm);
    await expect(
      resolvePublicCatalogAddress(
        { kind: "legacy", catalogKind: "breed", slug: "solanum-lycopersicum" },
        db,
      ),
    ).resolves.toEqual(redirectToSpecies);
  });

  it("keeps a form without a species at its legacy address until a species exists", async () => {
    const db = fixtureDb();
    await expect(
      resolvePublicCatalogAddress(
        { kind: "legacy", catalogKind: "plant_variety", slug: "orphan-form" },
        db,
      ),
    ).resolves.toEqual({
      status: "canonical",
      catalogItemId: ORPHAN_FORM,
      canonicalPath: "/variety/orphan-form",
    });
    await expect(
      resolvePublicCatalogAddress(
        { kind: "species", speciesSlug: "orphan-form", formSlug: null },
        db,
      ),
    ).resolves.toEqual({
      status: "redirect",
      catalogItemId: ORPHAN_FORM,
      canonicalPath: "/variety/orphan-form",
    });
  });

  it("follows a merge to the surviving node and gives up on a merge loop", async () => {
    const db = fixtureDb();
    await expect(
      resolvePublicCatalogAddress(
        { kind: "species", speciesSlug: "old-merged", formSlug: null },
        db,
      ),
    ).resolves.toEqual({
      status: "redirect",
      catalogItemId: SPECIES,
      canonicalPath: "/species/solanum-lycopersicum",
    });
    await expect(
      resolvePublicCatalogAddress({ kind: "species", speciesSlug: "loop-a", formSlug: null }, db),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("answers not found for unknown, retired and gardener-created cards", async () => {
    const db = fixtureDb();
    for (const slug of ["no-such-organism", "retired-card", "gardener-card"]) {
      await expect(
        resolvePublicCatalogAddress({ kind: "species", speciesSlug: slug, formSlug: null }, db),
        slug,
      ).resolves.toEqual({ status: "not_found" });
    }
    await expect(readPublicCatalogCanonicalAddress(db, RETIRED)).resolves.toBeNull();
    await expect(readPublicCatalogCanonicalAddress(db, FORM)).resolves.toEqual({
      catalogItemId: FORM,
      catalogKind: "plant_variety",
      nodeKind: "cultivar",
      publicSlug: "de-barao",
      speciesSlug: "solanum-lycopersicum",
      canonicalPath: "/species/solanum-lycopersicum/de-barao",
      permalinkPath: `/id/${FORM}`,
    });
  });

  it("spells the requested path the way the proxy saw it", () => {
    expect(
      requestedCatalogPath({ kind: "species", speciesSlug: "a", formSlug: null }),
    ).toBe("/species/a");
    expect(requestedCatalogPath({ kind: "species", speciesSlug: "a", formSlug: "b" })).toBe(
      "/species/a/b",
    );
    expect(requestedCatalogPath({ kind: "legacy", catalogKind: "breed", slug: "c" })).toBe(
      "/breed/c",
    );
  });
});

describe("permalink and alias resolvers", () => {
  it("resolves /id/{uuid} to the canonical page and refuses anything that is not a UUID", async () => {
    const log: string[] = [];
    const db = fixtureDb(log);
    await expect(resolvePublicCatalogPermalink(SPECIES, db)).resolves.toEqual({
      status: "redirect",
      catalogItemId: SPECIES,
      canonicalPath: "/species/solanum-lycopersicum",
    });
    await expect(resolvePublicCatalogPermalink(MERGED, db)).resolves.toEqual({
      status: "redirect",
      catalogItemId: SPECIES,
      canonicalPath: "/species/solanum-lycopersicum",
    });
    log.length = 0;
    await expect(resolvePublicCatalogPermalink("not-a-uuid", db)).resolves.toEqual({
      status: "not_found",
    });
    await expect(
      resolvePublicCatalogPermalink("99999999-9999-4999-8999-999999999999", db),
    ).resolves.toEqual({ status: "not_found" });
    expect(log).toHaveLength(1);
  });

  it("resolves an external identifier case-insensitively where the scheme is, and 404s the rest", async () => {
    const log: string[] = [];
    const db = fixtureDb(log);
    await expect(resolvePublicCatalogAlias("eppo", "lypes", db)).resolves.toEqual({
      status: "redirect",
      catalogItemId: SPECIES,
      canonicalPath: "/species/solanum-lycopersicum",
    });
    await expect(resolvePublicCatalogAlias("eppo", "ZZZZZ", db)).resolves.toEqual({
      status: "not_found",
    });
    log.length = 0;
    await expect(resolvePublicCatalogAlias("eppo", "../etc", db)).resolves.toEqual({
      status: "not_found",
    });
    expect(log).toHaveLength(0);
  });

  it("normalizes identifier values the way each scheme publishes them", () => {
    expect(normalizeCatalogAliasValue("eppo", " lypes ")).toBe("LYPES");
    expect(normalizeCatalogAliasValue("eppo", "LY")).toBeNull();
    expect(normalizeCatalogAliasValue("wikidata", "q23501")).toBe("Q23501");
    expect(normalizeCatalogAliasValue("wikidata", "23501")).toBeNull();
    expect(normalizeCatalogAliasValue("gbif", "2930137")).toBe("2930137");
    expect(normalizeCatalogAliasValue("gbif", "gbif:2930137")).toBeNull();
    expect(normalizeCatalogAliasValue("col", "3W4WV")).toBe("3W4WV");
    expect(normalizeCatalogAliasValue("col", "a/b")).toBeNull();
    expect(normalizeCatalogAliasValue("col", "x".repeat(121))).toBeNull();
  });
});
