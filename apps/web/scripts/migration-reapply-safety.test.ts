import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sqlRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "sql");
const read = (name: string) => readFileSync(join(sqlRoot, name), "utf8");

/**
 * `bootstrap-db.ts` re-applies every migration from 0001 on every run — there is
 * no ledger of what has already been applied. Idempotence is therefore not a
 * nicety; it is the only thing that makes the bootstrap work at all.
 *
 * `if not exists` covers creation. What it does not cover is a *later*
 * migration dropping a column an *earlier* one reads. Fresh, the order is fine:
 * create, use, drop. On a database that already has the drop, the earlier
 * migration runs again against a column that is gone, fails, and takes every
 * migration behind it with it. That is why the bootstrap could not complete
 * against production at all.
 *
 * Four statements were in that state. Each is now guarded on the column it
 * reads, and each guard is pinned here by name.
 *
 * **These cases are listed rather than derived, and that is deliberate.** A
 * derived version was written first and rejected: `0038` retires a dozen
 * columns, one guard legitimately covers a constraint mentioning eight of them,
 * and `0014` needs no guard at all because re-adding a column it owns with
 * `add column if not exists` is harmless — the later drop removes it again.
 * Deriving the rule produced fourteen failures, none of them real. A list that
 * says something true beats a rule that cries wolf.
 *
 * What no static test can see is whether a *new* unguarded reference appears.
 * The real check is applying every migration to a database three times over;
 * `prove-migration-reapply.ts` does that and is what proved this fix.
 */
const GUARDED = [
  {
    file: "0001_walking_skeleton.sql",
    column: "quarantine_key",
    what: "the cover-only unique index and the inline-limit trigger function",
    guards: 2,
  },
  {
    file: "0001_walking_skeleton.sql",
    column: "original_deleted_at",
    what: "the quarantine-expiry index",
    guards: 1,
  },
  {
    file: "0005_ove202_ove207_journal_document_cover.sql",
    column: "quarantine_key",
    what: "the cover-only unique index and the inline-limit trigger function",
    guards: 2,
  },
  {
    file: "0013_ove244_safe_media_admission.sql",
    column: "original_deleted_at",
    what: "the readiness-shape check constraint",
    guards: 1,
  },
  {
    file: "0036_ove347_atomic_journal_create.sql",
    column: "original_deleted_at",
    what: "the readiness-shape check constraint",
    guards: 1,
  },
] as const;

describe("migrations survive being re-applied", () => {
  for (const entry of GUARDED) {
    it(`${entry.file} guards ${entry.what} on ${entry.column}`, () => {
      const sql = read(entry.file);
      const guard = new RegExp(
        `information_schema\\.columns[\\s\\S]{0,400}?column_name\\s*=\\s*'${entry.column}'`,
        "gi",
      );
      // Counting rather than testing for presence: a file guarding one of its
      // two references and leaving the other bare is exactly the regression
      // this pins, and a boolean check would pass it.
      expect(sql.match(guard) ?? []).toHaveLength(entry.guards);
    });
  }

  it("still has both columns retired by 0038, so the guards remain meaningful", () => {
    // If a later migration ever re-adds these, the guards above become
    // permanently true and stop protecting anything. Then this fails and
    // someone re-reads the situation instead of trusting stale assertions.
    const retirement = read("0038_ove349_retire_legacy_journal_media.sql");
    expect(retirement).toMatch(/drop column if exists quarantine_key/i);
    expect(retirement).toMatch(/drop column if exists original_deleted_at/i);
  });
});
