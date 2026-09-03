import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type QueryResult,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/types";
import { recordOwnerAction } from "./owner-action-audit";

const executed: CompiledQuery[] = [];

class RecordingDriver extends DummyDriver {
  override async acquireConnection(): Promise<DatabaseConnection> {
    return {
      async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
        executed.push(query);
        return { rows: [] };
      },
      async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
        yield* [];
      },
    };
  }
}

const db = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new RecordingDriver(),
    createIntrospector: (instance) => new PostgresIntrospector(instance),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

describe("owner action audit", () => {
  it("writes one bounded audit row with a hashed session and identifiers only", async () => {
    executed.length = 0;
    await recordOwnerAction(
      { userId: "00000000-0000-4000-8000-000000000001", sessionId: "s-1" },
      "stable_registry_foundation_activate",
      "release=00000000-0000-4000-8000-000000000101",
      db,
    );

    const [query] = executed;
    expect(query?.sql).toContain('insert into "admin_role_audit_log"');
    expect(query?.parameters).toContain("stable_registry_foundation_activate");
    expect(query?.parameters).toContain(
      "release=00000000-0000-4000-8000-000000000101",
    );
    expect(query?.parameters).not.toContain("s-1");
    expect(
      query?.parameters.some(
        (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value),
      ),
    ).toBe(true);
  });

  it("leaves the session hash empty without a session id", async () => {
    executed.length = 0;
    await recordOwnerAction(
      { userId: "00000000-0000-4000-8000-000000000001" },
      "stable_registry_edition_rollback",
      "release=x".repeat(40),
      db,
    );

    const [query] = executed;
    expect(query?.parameters).toContain(null);
    expect(
      query?.parameters.some(
        (value) => typeof value === "string" && value.length === 200,
      ),
    ).toBe(true);
  });
});
