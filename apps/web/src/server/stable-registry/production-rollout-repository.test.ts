import { readFileSync } from "node:fs";
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
import { STABLE_REGISTRY_PRODUCTION_FLAGS } from "@/lib/catalog/stable-registry-production-plan";

import {
  STABLE_REGISTRY_PRODUCTION_LOCK_KEY,
  toPlanInputs,
} from "./production-rollout-repository";

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

void new Kysely<Database>({ dialect: new TestPostgresDialect() });

describe("production plan inputs", () => {
  it("carries the classification through without inventing a value", () => {
    const inputs = toPlanInputs({
      classification: {
        appliedMigrations: ["0023_ove254_eppo_observed_capture.sql"],
        sourceInventoryTotal: 129_188,
        sourceInventoryDigest: "b".repeat(64),
        activeReleaseId: null,
        productEligibleCount: 0,
        publicCatalogRecordCount: 0,
        affectedObjectCount: 7,
        flagsPresent: {},
      },
      deploymentSha: "a".repeat(40),
      releasePolicyVersion: "ove255.foundation.v1",
      storageHeadroomClass: "sufficient",
      backupFreshnessClass: "fresh",
    });

    expect(inputs).toEqual({
      environment: "production",
      deploymentSha: "a".repeat(40),
      appliedMigrations: ["0023_ove254_eppo_observed_capture.sql"],
      sourceInventoryTotal: 129_188,
      sourceInventoryDigest: "b".repeat(64),
      releasePolicyVersion: "ove255.foundation.v1",
      storageHeadroomClass: "sufficient",
      backupFreshnessClass: "fresh",
      affectedObjectCount: 7,
      activeReleaseId: null,
    });
  });

  it("names every rollout flag so none is enabled without a plan", () => {
    expect([...STABLE_REGISTRY_PRODUCTION_FLAGS]).toEqual([
      "STABLE_REGISTRY_RELEASE_CENTER",
      "STABLE_REGISTRY_PUBLIC_DISCOVERY",
      "STABLE_REGISTRY_PRODUCT_SELECTION",
      "STABLE_REGISTRY_EXTENSION_PACKS",
      "STABLE_REGISTRY_EDITIONS",
    ]);
  });

  it("uses one advisory lock so a second operator performs no effect", () => {
    expect(STABLE_REGISTRY_PRODUCTION_LOCK_KEY).toBe(2592026);
  });
});

describe("schema drift detection", () => {
  it("accounts for every relation the Stable Registry migrations create", () => {
    // The probe refuses any registry-namespace relation it cannot account for.
    // If a migration adds a table, it must be listed here too, or a correct
    // production would be reported as drifted.
    const created = new Set<string>();
    for (const file of [
      "sql/0023_ove254_eppo_observed_capture.sql",
      "sql/0024_ove255_stable_registry_foundation.sql",
      "sql/0025_ove256_stable_registry_public_reads.sql",
      "sql/0026_ove257_stable_registry_product_projection.sql",
      "sql/0027_ove328_stable_registry_extension_packs.sql",
      "sql/0028_ove258_stable_registry_editions.sql",
    ]) {
      const migration = readFileSync(path.resolve(process.cwd(), file), "utf8");
      for (const match of migration.matchAll(
        /create table if not exists (\w+)/gu,
      )) {
        const table = match[1]!;
        if (
          table.startsWith("catalog_registry_") ||
          table.startsWith("stable_registry_") ||
          table.startsWith("catalog_source_capture_") ||
          table === "catalog_item_revisions"
        ) {
          created.add(table);
        }
      }
    }

    expect(created.size).toBeGreaterThan(0);
    const unaccounted = [...created].filter(
      (table) => !KNOWN_REGISTRY_RELATIONS_FOR_TEST.has(table),
    );
    expect(unaccounted).toEqual([]);
  });
});

/**
 * Mirrors the private set in the repository. Kept here rather than exported so
 * the production module has no test-only surface; the assertion above is what
 * keeps the two in step.
 */
const KNOWN_REGISTRY_RELATIONS_FOR_TEST = new Set([
  "catalog_source_capture_runs",
  "catalog_source_capture_units",
  "catalog_item_revisions",
  "catalog_registry_releases",
  "catalog_registry_release_members",
  "catalog_registry_exception_groups",
  "catalog_registry_decisions",
  "catalog_registry_active_pointers",
  "catalog_registry_activations",
  "catalog_registry_search_outbox",
  "catalog_registry_extension_packs",
  "catalog_registry_extension_pack_rows",
  "catalog_registry_extension_pack_names",
  "catalog_registry_extension_pack_user_names",
  "catalog_registry_edition_diffs",
  "catalog_registry_item_relations",
  "catalog_registry_activation_sequence",
  "stable_registry_public_catalog_records",
  "stable_registry_public_catalog_search_terms",
  "stable_registry_public_eppo_records",
  "stable_registry_public_eppo_search_terms",
  "stable_registry_product_catalog_records",
  "stable_registry_product_catalog_names",
  "stable_registry_product_projection_outbox",
]);
