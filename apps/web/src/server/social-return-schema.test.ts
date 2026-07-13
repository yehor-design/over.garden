import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schemaSql = readFileSync(
  join(webRoot, "sql/0001_walking_skeleton.sql"),
  "utf8",
);

const forbiddenPayloadPattern =
  /email|phone|latitude|longitude|coordinates|quarantine|derivative_key|ip_address|user_agent|journal_text|comment_body|private_text|payload|delivery_address/i;

describe("OVE-183 social return schema", () => {
  it("makes comments idempotent and preserves explicit moderation tombstones", () => {
    const body = tableBody("engagement_comments");

    expect(body).toContain("client_mutation_id text not null");
    expect(body).toContain("'removed'");
    expect(schemaSql).toContain("engagement_comments_author_mutation_uidx");
  });

  it("stores actor-scoped object and topic follows without copied target content", () => {
    const body = tableBody("engagement_follows");

    expect(body).toContain("follower_user_id uuid not null");
    expect(body).toContain("target_kind text not null");
    expect(body).toContain("target_ref text not null");
    expect(body).toContain("follow_state text not null");
    expect(body).not.toMatch(forbiddenPayloadPattern);
    expect(schemaSql).toContain("engagement_follows_actor_target_uidx");
  });

  it("keeps comment reports actor-scoped and separate from moderation state", () => {
    const body = tableBody("engagement_comment_reports");

    expect(body).toContain("reporter_user_id uuid not null");
    expect(body).toContain("comment_id uuid not null");
    expect(body).toContain("report_reason text not null");
    expect(body).not.toMatch(forbiddenPayloadPattern);
    expect(schemaSql).toContain(
      "engagement_comment_reports_actor_comment_uidx",
    );
  });

  it("stores only opaque notification receipts and explicit category preferences", () => {
    const receiptBody = tableBody("notification_receipts");
    const preferenceBody = tableBody("notification_preferences");

    expect(receiptBody).toContain("owner_user_id uuid not null");
    expect(receiptBody).toContain("event_key text not null");
    expect(receiptBody).toContain("receipt_state text not null");
    expect(receiptBody).not.toMatch(forbiddenPayloadPattern);
    expect(preferenceBody).toContain("comments_enabled boolean");
    expect(preferenceBody).toContain("replies_enabled boolean");
    expect(preferenceBody).toContain("follows_enabled boolean");
    expect(preferenceBody).toContain("mentions_enabled boolean");
    expect(preferenceBody).toContain("claims_enabled boolean");
    expect(preferenceBody).toContain("system_enabled boolean");
    expect(preferenceBody).not.toMatch(forbiddenPayloadPattern);
  });
});

function tableBody(table: string) {
  const match = schemaSql.match(
    new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\);`),
  );
  expect(match?.[1], `${table} must exist`).toBeTruthy();
  return match?.[1] ?? "";
}
