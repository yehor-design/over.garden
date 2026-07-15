import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../../sql/0001_walking_skeleton.sql", import.meta.url),
  "utf8",
);

describe("catalog fuzzy duplicate QA schema", () => {
  it("stores advisory pair evidence without operator or source payload data", () => {
    const tableContract = schema.match(
      /create table if not exists catalog_fuzzy_duplicate_suggestions([\s\S]*?)create unique index if not exists catalog_fuzzy_duplicate_suggestions_pair_key_uidx/,
    )?.[1];

    expect(tableContract).toBeDefined();
    expect(schema).toContain(
      "create table if not exists catalog_fuzzy_duplicate_suggestions",
    );
    expect(schema).toContain("catalog_fuzzy_duplicate_suggestions_pair_uidx");
    expect(schema).toContain(
      "catalog_fuzzy_duplicate_suggestions_reason_codes_check",
    );
    expect(schema).toContain(
      "catalog_fuzzy_duplicate_suggestions_locale_relation_check",
    );
    expect(tableContract).not.toMatch(
      /owner_user_id|journal_body|raw_payload|source_record_id|email|ip_address|user_agent/,
    );
  });

  it("accepts only the closed privacy-safe worker payload", () => {
    expect(schema).toContain("job_queue_catalog_fuzzy_duplicate_payload_check");
    expect(schema).toContain("catalog_fuzzy_duplicate_qa_refresh");
    expect(schema).toContain("payload - array['kind']::text[] = '{}'::jsonb");
  });
});
