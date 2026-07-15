import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../../sql/0001_walking_skeleton.sql", import.meta.url),
  "utf8",
);

describe("catalog alias suggestion schema", () => {
  it("keeps generated variants detached from searchable names until review", () => {
    expect(schema).toContain("generated_from_catalog_item_name_id uuid");
    expect(schema).toContain(
      "catalog_alias_projections_generated_from_name_fkey",
    );
    expect(schema).toContain("source_name_fingerprint text");
    expect(schema).toContain("reason_codes text[]");
    expect(schema).toContain("generator_version text");
    expect(schema).toContain("reviewed_at timestamptz");
    expect(schema).toContain("reviewed_by_user_id uuid");
    expect(schema).toContain("decision_reason_code text");
    expect(schema).toContain("decision_result text");
    expect(schema).toContain(
      "catalog_alias_projections_generated_review_check",
    );
    expect(schema).toContain(
      "source_slug <> 'overgarden-alias-generator'",
    );
    expect(schema).toContain(
      "status in ('generated', 'review_needed', 'stale')",
    );
    expect(schema).toContain("catalog_item_name_id is null");
  });

  it("bounds generated evidence and decision reasons to closed enums", () => {
    for (const token of [
      "cyrtranslit_forward",
      "cyrtranslit_reverse",
      "ru_yo_fold",
      "uk_ghe_fold",
      "normalized_collision",
      "approved_generated_alias",
      "incorrect_variant",
      "locale_or_script_mismatch",
      "ambiguous_catalog_identity",
      "unsafe_generated_form",
      "other_review_reason",
      "alias_projected",
      "alias_already_projected",
      "alias_rejected",
    ]) {
      expect(schema).toContain(token);
    }
    expect(schema).not.toContain("alias_decision_note text");
  });

  it("requires an exact privacy-safe worker payload", () => {
    expect(schema).toContain("job_queue_catalog_alias_payload_check");
    expect(schema).toContain("catalog_alias_suggestions_refresh");
    expect(schema).toContain("catalogItemId");
    expect(schema).toContain(
      "payload - array['kind', 'catalogItemId']::text[] = '{}'::jsonb",
    );
  });
});
