import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Static structural guardrails for OVE-40. These read the schema source of truth
// (SQL migration) and the generated Kysely types as text and assert that the
// "no precise location, ever" and "media privacy boundary" invariants hold
// structurally — before any query is even written.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatedTypes = readFileSync(
  join(webRoot, "src/db/generated.ts"),
  "utf8",
);
const schemaSql = readFileSync(
  join(webRoot, "sql/0001_walking_skeleton.sql"),
  "utf8",
);

const PRECISE_LOCATION_PATTERNS: ReadonlyArray<RegExp> = [
  /latitude/i,
  /longitude/i,
  /coordinate/i,
  /geohash/i,
  /geometry/i,
  /geography/i,
  /\bgps\b/i,
  /\bgeom\b/i,
  /precise[_\s-]?location/i,
];

describe("OVE-40 schema invariants — no precise location anywhere", () => {
  it("generated Kysely types declare no precise-location columns", () => {
    for (const pattern of PRECISE_LOCATION_PATTERNS) {
      expect(
        pattern.test(generatedTypes),
        `generated.ts unexpectedly matches ${pattern}`,
      ).toBe(false);
    }
  });

  it("SQL schema declares no precise-location columns", () => {
    for (const pattern of PRECISE_LOCATION_PATTERNS) {
      expect(
        pattern.test(schemaSql),
        `walking_skeleton.sql unexpectedly matches ${pattern}`,
      ).toBe(false);
    }
  });

  it("location is modeled only as a bounded region vocabulary", () => {
    const visibilityChecks = schemaSql.match(
      /location_visibility in \('region', 'hidden'\)/g,
    );
    const coarseChecks = schemaSql.match(/~ '\^\(UA\|BG\)-\[0-9\]\{2\}\$'/g);

    // spaces and plant_objects must both constrain visibility + coarse region.
    expect(visibilityChecks?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(coarseChecks?.length ?? 0).toBeGreaterThanOrEqual(2);

    for (const table of ["Spaces", "PlantObjects"]) {
      expect(generatedTypes).toContain(table);
    }
    expect(generatedTypes).toMatch(/coarse_region_code: string \| null/);
  });
});

describe("OVE-40 schema invariants — media privacy boundary", () => {
  it("exposes only final derivative identity in the current generated shape", () => {
    expect(generatedTypes).toContain("derivative_key: string");
    expect(generatedTypes).not.toContain("quarantine_key:");
    expect(generatedTypes).not.toContain("original_deleted_at:");
    expect(generatedTypes).not.toContain("processing_claim_token:");
  });

  it("constrains analytics properties to a bounded jsonb object", () => {
    expect(schemaSql).toContain("properties jsonb not null default '{}'::jsonb");
    expect(schemaSql).toContain("jsonb_typeof(properties) = 'object'");
  });
});
