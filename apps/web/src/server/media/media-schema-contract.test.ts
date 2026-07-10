import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("journal media schema contract", () => {
  it("supports bounded gallery readback without weakening the one-photo composer", () => {
    const sql = readFileSync(
      new URL("../../../sql/0001_walking_skeleton.sql", import.meta.url),
      "utf8",
    );

    expect(sql).toContain(
      "drop index if exists media_assets_one_per_entry_uidx",
    );
    expect(sql).not.toContain(
      "create unique index if not exists media_assets_one_per_entry_uidx",
    );
    expect(sql).toContain(
      "create unique index if not exists media_assets_one_non_fixture_per_entry_uidx",
    );
    expect(sql).toContain("and quarantine_key not like 'visual-fixtures/%'");
    expect(sql).toContain(
      "create index if not exists media_assets_entry_created_idx",
    );
    expect(sql).toContain(
      "on media_assets (journal_entry_id, created_at asc, id asc)",
    );
  });
});
