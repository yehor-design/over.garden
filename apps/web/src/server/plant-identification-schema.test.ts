import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migration = new URL(
  "../../sql/0019_ove269_plantnet_identification.sql",
  import.meta.url,
);

describe("OVE-269 private identification schema", () => {
  it("keeps normalized requests private and constrains provider state", async () => {
    const sql = await readFile(migration, "utf8");

    expect(sql).toContain(
      "create table if not exists plant_identification_requests",
    );
    expect(sql).toContain(
      "create table if not exists plant_identification_candidates",
    );
    expect(sql).toContain(
      "create table if not exists plant_identification_decisions",
    );
    expect(sql).toContain(
      "create table if not exists plant_identification_submission_slots",
    );
    expect(sql).toContain(
      "plant_identification_requests_owner_fingerprint_uidx",
    );
    expect(sql).toContain("plant_identification_requests_owner_inflight_uidx");
    expect(sql).toContain("slot between 1 and 4");
    expect(sql).toContain("provider = 'plantnet'");
    expect(sql).toContain("capability = 'species_identification'");
    expect(sql).toContain("media_manifest::text !~*");
    expect(sql).not.toMatch(/public_projection|meilisearch|raw_payload/i);
  });
});
