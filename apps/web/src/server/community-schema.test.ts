import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schemaSql = readFileSync(
  join(webRoot, "sql/0001_walking_skeleton.sql"),
  "utf8",
);

const COMMUNITY_TABLES = [
  "communities",
  "community_rules",
  "community_memberships",
  "community_moderators",
  "community_contributions",
  "community_contribution_reports",
  "community_moderation_audit_log",
] as const;

const forbiddenPayloadPattern =
  /email|phone|token|cookie|ip_address|user_agent|latitude|longitude|coordinates|precise_location|quarantine_key|derivative_key|journal_body|journal_title|profile_bio|request_metadata/i;

describe("OVE-184 community schema contract", () => {
  it("models explicit membership, canonical contributions, moderation, and audit state", () => {
    for (const table of COMMUNITY_TABLES) {
      expect(schemaSql).toContain(`create table if not exists ${table} (`);
    }

    expect(tableBody("communities")).toMatch(/journal_topic_id uuid not null/);
    expect(tableBody("community_memberships")).toMatch(
      /membership_state text not null default 'active'/,
    );
    expect(tableBody("community_contributions")).toMatch(
      /journal_entry_id uuid not null references journal_entries\(id\)/,
    );
    expect(tableBody("community_contribution_reports")).toMatch(
      /report_state text not null default 'submitted'/,
    );
    expect(tableBody("community_moderation_audit_log")).toMatch(
      /action text not null/,
    );
  });

  it("keeps copied content, precise location, media internals, and request identity out of community state", () => {
    for (const table of COMMUNITY_TABLES) {
      expect(tableBody(table)).not.toMatch(forbiddenPayloadPattern);
    }

    expect(tableBody("community_contributions")).not.toMatch(
      /\b(title|body|public_slug|visibility)\b/i,
    );
    expect(tableBody("community_memberships")).not.toMatch(
      /display_name|handle|member_count/i,
    );
  });

  it("constrains lifecycle transitions and actor-scoped uniqueness", () => {
    expect(schemaSql).toContain("communities_slug_uidx");
    expect(schemaSql).toContain("community_memberships_actor_uidx");
    expect(schemaSql).toContain("community_contributions_journal_uidx");
    expect(schemaSql).toContain("community_reports_actor_contribution_uidx");
    expect(schemaSql).toContain("community_moderators_actor_uidx");
    expect(schemaSql).toContain("community_moderation_audit_created_idx");

    expect(tableBody("communities")).toContain(
      "lifecycle_state in ('draft', 'active', 'archived')",
    );
    expect(tableBody("communities")).toContain(
      "participation_state in ('open', 'closed')",
    );
    expect(tableBody("community_memberships")).toContain(
      "membership_state in ('active', 'left', 'banned')",
    );
    expect(tableBody("community_contributions")).toContain(
      "contribution_state in ('active', 'removed')",
    );
  });

  it("preserves moderator identity required by resolved-state checks", () => {
    expect(schemaSql).toMatch(
      /community_contributions_removed_by_user_id_fkey[\s\S]*?foreign key \(removed_by_user_id\) references "user"\(id\) on delete restrict/,
    );
    expect(schemaSql).toMatch(
      /community_reports_resolved_by_user_id_fkey[\s\S]*?foreign key \(resolved_by_user_id\) references "user"\(id\) on delete restrict/,
    );
    expect(schemaSql).toMatch(
      /community_moderation_audit_actor_user_id_fkey[\s\S]*?foreign key \(actor_user_id\) references "user"\(id\) on delete restrict/,
    );
  });
});

function tableBody(table: (typeof COMMUNITY_TABLES)[number]) {
  const match = schemaSql.match(
    new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`),
  );
  expect(match?.[1], `missing schema body for ${table}`).toBeTruthy();
  return match?.[1] ?? "";
}
