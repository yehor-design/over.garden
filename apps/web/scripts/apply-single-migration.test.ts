import { describe, expect, it } from "vitest";

import {
  APPLY_MODES,
  assertSingleIndexStatement,
  extractStatement,
  parseApplyArgs,
} from "./apply-single-migration";

/**
 * This script points at production, so its value is entirely in what it
 * refuses. These cases exercise the refusals, not the happy path.
 */
describe("apply-single-migration guards", () => {
  const requiredArgs = [
    "--sql-file",
    "sql/0045_workspace_recent_entries_index.sql",
    "--env-file",
    "/tmp/x.env",
    "--ca-file",
    "/tmp/x.crt",
  ];

  it("defaults to verify, so applying has to be asked for", () => {
    expect(parseApplyArgs(requiredArgs).mode).toBe("verify");
    expect(APPLY_MODES).toEqual(["verify", "apply"]);
  });

  it("refuses an unknown mode and any missing file argument", () => {
    expect(() => parseApplyArgs([...requiredArgs, "--mode", "drop"])).toThrow(
      /apply_mode_invalid/,
    );
    expect(() =>
      parseApplyArgs(["--env-file", "/tmp/x.env", "--ca-file", "/tmp/x.crt"]),
    ).toThrow(/apply_sql_file_required/);
    expect(() =>
      parseApplyArgs(["--sql-file", "a.sql", "--ca-file", "/tmp/x.crt"]),
    ).toThrow(/apply_env_file_required/);
    expect(() =>
      parseApplyArgs(["--sql-file", "a.sql", "--env-file", "/tmp/x.env"]),
    ).toThrow(/apply_ca_file_required/);
  });

  it("strips comment lines so the migration's prose never reaches the server", () => {
    const statement = extractStatement(
      "-- explanation\n--\n-- more\ncreate index if not exists a_idx on t (c);\n",
    );
    expect(statement).toBe("create index if not exists a_idx on t (c);");
  });

  it("accepts exactly the one statement shape it is allowed to run", () => {
    expect(
      assertSingleIndexStatement(
        "create index if not exists journal_entries_owner_recent_idx\n  on journal_entries (owner_user_id)\n  where lifecycle_state = 'active';",
      ),
    ).toBe("journal_entries_owner_recent_idx");
  });

  it("refuses anything that is not a single create-index", () => {
    // A destructive statement smuggled after a legitimate one is the case that
    // matters: the first statement alone would pass the shape check, so the
    // count has to be enforced separately from the pattern.
    expect(() =>
      assertSingleIndexStatement(
        "create index if not exists a_idx on t (c); drop table t;",
      ),
    ).toThrow(/apply_refused_multiple_statements/);

    expect(() => assertSingleIndexStatement("drop table t;")).toThrow(
      /apply_refused_not_a_create_index/,
    );
    expect(() =>
      assertSingleIndexStatement("alter table t add column c text;"),
    ).toThrow(/apply_refused_not_a_create_index/);
    // Without `if not exists` a rerun would error rather than settle, so the
    // idempotence this script depends on is part of the accepted shape.
    expect(() =>
      assertSingleIndexStatement("create index a_idx on t (c);"),
    ).toThrow(/apply_refused_not_a_create_index/);
  });
});
