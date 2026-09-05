import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "sql/0025_ove256_stable_registry_public_reads.sql"),
  "utf8",
);

/**
 * Migration 0025 also created the public catalog release projection. That half
 * is retired (ADR-0025) and leaves with the schema retirement migration; the
 * EPPO read model it created is the part still served at `/sources/eppo`.
 */
describe("OVE-256 public EPPO read-model schema", () => {
  it("keeps the public EPPO data in additive derived tables", () => {
    expect(migration).toContain(
      "create table if not exists stable_registry_public_eppo_records",
    );
    expect(migration).toContain("stable_registry_public_eppo_search_terms");
    expect(migration).toContain(
      "materialize_stable_registry_public_eppo_capture",
    );
    expect(migration).toContain(
      "after update of state on catalog_source_capture_runs",
    );
  });

  it("does not make capture units or raw/source-only payload fields public columns", () => {
    const eppoDefinition = between(
      migration,
      "create table if not exists stable_registry_public_eppo_records",
      "create index if not exists stable_registry_public_eppo_code_lookup_idx",
    );

    expect(eppoDefinition).not.toMatch(
      /raw_payload|source_only_fields|field_rights|checksum|coordinate|latitude|longitude|media|user_id/i,
    );
    expect(migration).not.toMatch(
      /update\s+catalog_source_capture_units|delete\s+from\s+catalog_source_capture_units/i,
    );
  });

  it("materializes only safe source-public names and guards incomplete JSON shapes", () => {
    expect(migration).toContain("stable_registry_public_safe_label");
    expect(migration).toContain(
      "jsonb_typeof(records.allowed_projection->'taxon_names') = 'array'",
    );
    expect(migration).toContain(
      "jsonb_typeof(records.allowed_projection->'taxon_taxonomy') = 'array'",
    );
    expect(migration).toMatch(/array_prepend\(records\.display_name/u);
  });
});

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  return source.slice(startIndex, endIndex);
}
