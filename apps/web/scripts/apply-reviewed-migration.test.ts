import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyDatabaseHost,
  countStatements,
  extractMigrationSentinels,
  parseReviewedMigrationArgs,
  resolveMigrationFile,
} from "./apply-reviewed-migration";

describe("apply-reviewed-migration", () => {
  it("defaults to verify and requires a four-digit migration number", () => {
    expect(parseReviewedMigrationArgs(["--migration", "0046"])).toEqual({
      mode: "verify",
      migration: "0046",
      envFile: undefined,
      allowHostClass: "digitalocean_managed",
    });
    expect(() => parseReviewedMigrationArgs([])).toThrow(
      "apply_migration_number_required",
    );
    expect(() =>
      parseReviewedMigrationArgs(["--migration", "46", "--mode", "apply"]),
    ).toThrow("apply_migration_number_required");
    expect(() =>
      parseReviewedMigrationArgs(["--migration", "0046", "--mode", "drop"]),
    ).toThrow("apply_mode_invalid");
    expect(() =>
      parseReviewedMigrationArgs([
        "--migration",
        "0046",
        "--allow-host-class",
        "anything",
      ]),
    ).toThrow("apply_host_class_invalid");
  });

  it("classifies the managed instance, loopback, and everything else", () => {
    expect(
      classifyDatabaseHost("db-postgresql-fra1-1.b.db.ondigitalocean.com"),
    ).toBe("digitalocean_managed");
    expect(classifyDatabaseHost("localhost")).toBe("loopback");
    expect(classifyDatabaseHost("127.0.0.1")).toBe("loopback");
    expect(classifyDatabaseHost("db.example.net")).toBe("other");
  });

  it("resolves exactly one migration file by number and counts its statements", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "reviewed-migration-"));
    writeFileSync(
      path.join(dir, "0046_example.sql"),
      "-- comment;\nalter table a drop column if exists b;\n\nupdate a set c = 1\nwhere c <> 1;\n",
    );
    writeFileSync(path.join(dir, "0047_a.sql"), "select 1;");
    writeFileSync(path.join(dir, "0047_b.sql"), "select 1;");

    expect(path.basename(resolveMigrationFile(dir, "0046"))).toBe(
      "0046_example.sql",
    );
    expect(() => resolveMigrationFile(dir, "0047")).toThrow(
      "apply_migration_not_unique",
    );
    expect(() => resolveMigrationFile(dir, "0099")).toThrow(
      "apply_migration_not_unique",
    );
    expect(
      countStatements(
        "-- comment;\nalter table a drop column if exists b;\n\nupdate a set c = 1\nwhere c <> 1;\n",
      ),
    ).toBe(2);
  });

  it("reads the schema objects a migration creates as its sentinels", () => {
    expect(
      extractMigrationSentinels(
        [
          "-- create table commented_out (id int);",
          "create table if not exists new_table (id uuid primary key);",
          "alter table journal_entries",
          "  add column if not exists deleted_at timestamptz,",
          "  add column purge_after timestamptz;",
          "alter table journal_entries drop column if exists public_noindex;",
          "create index if not exists journal_entries_deleted_idx on journal_entries (deleted_at);",
        ].join("\n"),
      ),
    ).toEqual([
      { kind: "table", table: "new_table" },
      { kind: "column", table: "journal_entries", column: "deleted_at" },
      { kind: "column", table: "journal_entries", column: "purge_after" },
      { kind: "index", index: "journal_entries_deleted_idx" },
    ]);
    expect(parseReviewedMigrationArgs(["--mode", "inventory"]).mode).toBe(
      "inventory",
    );
  });
});
