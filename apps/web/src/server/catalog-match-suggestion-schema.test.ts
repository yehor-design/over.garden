import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../../sql/0001_walking_skeleton.sql", import.meta.url),
  "utf8",
);

describe("catalog match suggestion decision schema", () => {
  it("binds stale-decision protection to semantic source and alias evidence", () => {
    expect(schema).toContain("source_updated_at_snapshot timestamptz");
    expect(schema).toContain("target_updated_at_snapshot timestamptz");
    expect(schema).toContain("target_catalog_item_name_id uuid");
    expect(schema).toContain("source_matching_fingerprint text check");
    expect(schema).toContain("source_matching_fingerprint is not null");
    expect(schema).toContain("target_matching_fingerprint text");
    expect(schema).toContain("catalog_match_suggestions_target_name_fkey");
    expect(schema).toContain(
      "catalog_match_suggestions_matching_fingerprint_check",
    );
    expect(schema).toContain("catalog_match_suggestions_target_snapshot_check");
  });

  it("stores a closed relational audit trail for approved and rejected decisions", () => {
    expect(schema).toContain("decision_reason_code text");
    expect(schema).toContain("decision_result text");
    expect(schema).toContain("decision_affected_object_count integer");
    expect(schema).toContain("approved_canonical_match");
    expect(schema).toContain("suggestion_rejected");
    expect(schema).toContain("catalog_merged");
    expect(schema).not.toContain("decision_note text");
  });
});
