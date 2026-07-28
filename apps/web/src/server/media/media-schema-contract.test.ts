import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("journal media schema contract", () => {
  it("enforces the OVE-202 ten-inline media ceiling without the one-photo unique index", () => {
    const sql = readFileSync(
      new URL("../../../sql/0001_walking_skeleton.sql", import.meta.url),
      "utf8",
    );

    expect(sql).toContain(
      "drop index if exists media_assets_one_per_entry_uidx",
    );
    expect(sql).toContain(
      "drop index if exists media_assets_one_non_fixture_per_entry_uidx",
    );
    expect(sql).not.toContain(
      "create unique index if not exists media_assets_one_per_entry_uidx",
    );
    expect(sql).not.toContain(
      "create unique index if not exists media_assets_one_non_fixture_per_entry_uidx",
    );
    expect(sql).toContain("enforce_journal_entry_inline_media_limit");
    expect(sql).toContain("attached_count >= 10");
    expect(sql).toContain("usage_role = 'cover_only'");
    expect(sql).toContain("coalesce(usage_role, 'inline') = 'inline'");
    expect(sql).toContain("cover_media_asset_id");
    expect(sql).toContain("add column if not exists document_position integer");
    expect(sql).toContain("add column if not exists intrinsic_width integer");
    expect(sql).toContain("add column if not exists focal_x double precision");
    expect(sql).toContain("media_assets_focal_x_range_check");
    expect(sql).toContain(
      "create index if not exists media_assets_entry_created_idx",
    );
    expect(sql).toContain(
      "on media_assets (journal_entry_id, created_at asc, id asc)",
    );
  });

  it("stores one closed OVE-231 quality receipt while preserving legacy nulls", () => {
    const sql = readFileSync(
      new URL("../../../sql/0014_ove231_launch_media_quality.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("quality_policy_version text");
    expect(sql).toContain("quality_reason_codes text[]");
    expect(sql).toContain("quality_metrics jsonb");
    expect(sql).toContain("media_assets_quality_receipt_shape_check");
    expect(sql).toContain("'accepted', 'review_required', 'rejected'");
    expect(sql).toContain("quality_policy_version is null");
  });
});
