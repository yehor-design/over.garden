import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/db/schema";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/search/client", () => ({
  meiliSearchClient: () => {
    throw new Error("meilisearch must not be reached by contract tests");
  },
}));

import {
  PUBLIC_PROJECTION_ENTITY_KIND,
  PUBLIC_PROJECTION_LEASE_SECONDS,
  PUBLIC_PROJECTION_MAX_ATTEMPTS,
  PUBLIC_PROJECTION_OUTBOX_POLICY,
  PUBLIC_PROJECTION_OVERDUE_SECONDS,
  recordPublicProjectionIntent,
  claimPublicProjectionIntent,
  type PublicProjectionReason,
} from "./public-projection-outbox";
import { isPublicTextReducingEdit } from "@/server/journal-repository";

const ENTITY_ID = "00000000-0000-4000-8000-000000000501";
const OWNER_ID = "00000000-0000-4000-8000-000000000101";

class RecordingDialect implements Dialect {
  constructor(
    private readonly captured: { sql: string; parameters: readonly unknown[] }[],
    private readonly rows: unknown[],
  ) {}

  createDriver(): Driver {
    const captured = this.captured;
    const rows = this.rows;
    const connection = {
      async executeQuery(compiled: CompiledQuery) {
        captured.push({
          sql: compiled.sql,
          parameters: compiled.parameters,
        });
        return { rows };
      },
      async *streamQuery() {},
    };
    return {
      async init() {},
      async acquireConnection() {
        return connection as never;
      },
      async beginTransaction() {},
      async commitTransaction() {},
      async rollbackTransaction() {},
      async releaseConnection() {},
      async destroy() {},
    };
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createIntrospector(database: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(database);
  }
}

function capturingExecutor(rows: unknown[] = []) {
  const captured: { sql: string; parameters: readonly unknown[] }[] = [];
  const executor = new Kysely<Database>({
    dialect: new RecordingDialect(captured, rows),
  });
  return { captured, executor };
}

describe("OVE-242 public projection outbox contract", () => {
  it("pins the policy identity used by evidence and the parity gate", () => {
    expect(PUBLIC_PROJECTION_OUTBOX_POLICY).toBe(
      "ove242.publicProjectionOutbox.v1",
    );
    expect(PUBLIC_PROJECTION_ENTITY_KIND).toBe("journal_entry");
    expect(PUBLIC_PROJECTION_MAX_ATTEMPTS).toBe(5);
    expect(PUBLIC_PROJECTION_LEASE_SECONDS).toBe(60);
    expect(PUBLIC_PROJECTION_OVERDUE_SECONDS).toBe(300);
  });

  it("draws every generation from the shared sequence inside the caller's transaction", async () => {
    const { captured, executor } = capturingExecutor([
      { desired_generation: "7" },
    ]);

    const generation = await recordPublicProjectionIntent(executor, {
      entityId: ENTITY_ID,
      ownerUserId: OWNER_ID,
      desiredState: "absent",
      reason: "archive",
    });

    expect(generation).toBe("7");
    const statement = captured[0]!;
    expect(statement.sql).toContain("insert into public_projection_intents");
    // A monotonic sequence is what lets a later write outrank an earlier one
    // across connections, and lets an applier detect it was superseded.
    expect(statement.sql).toContain("nextval('public_projection_generation_seq')");
    expect(statement.sql).toContain("on conflict (entity_kind, entity_id) do update");
    // A new desired state always re-opens the row for work.
    expect(statement.sql).toContain("status = 'pending'");
    expect(statement.sql).toContain("attempts = 0");
    expect(statement.parameters).toContain(ENTITY_ID);
    expect(statement.parameters).toContain(OWNER_ID);
    expect(statement.parameters).toContain("absent");
    expect(statement.parameters).toContain("archive");
  });

  it("keeps an unconverged privacy-reducing intent prioritized across a later neutral write", async () => {
    const { captured, executor } = capturingExecutor([
      { desired_generation: "8" },
    ]);

    await recordPublicProjectionIntent(executor, {
      entityId: ENTITY_ID,
      ownerUserId: OWNER_ID,
      desiredState: "present",
      reason: "edit",
    });

    const sql = captured[0]!.sql;
    expect(sql).toContain("privacy_reducing = excluded.privacy_reducing");
    expect(sql).toContain("public_projection_intents.privacy_reducing");
    expect(sql).toContain(
      "public_projection_intents.applied_generation\n            < public_projection_intents.desired_generation",
    );
  });

  it.each<[PublicProjectionReason, boolean]>([
    ["archive", true],
    ["erasure", true],
    ["moderation", true],
    ["location_change", true],
    ["profile_visibility", true],
    ["publish", false],
    ["edit", false],
    ["media_presentation", false],
    ["catalog_identity", false],
    ["repair", false],
  ])("classifies %s as privacy-reducing=%s", async (reason, expected) => {
    const { captured, executor } = capturingExecutor([
      { desired_generation: "9" },
    ]);

    await recordPublicProjectionIntent(executor, {
      entityId: ENTITY_ID,
      ownerUserId: OWNER_ID,
      desiredState: reason === "archive" ? "absent" : "present",
      reason,
    });

    expect(captured[0]!.parameters).toContain(expected);
  });

  it("claims with a lease, skips locked rows, and orders privacy-reducing work first", async () => {
    const { captured, executor } = capturingExecutor([]);

    const claim = await claimPublicProjectionIntent(executor);

    expect(claim).toBeNull();
    const sql = captured[0]!.sql;
    expect(sql).toContain("applied_generation < desired_generation");
    expect(sql).toContain(
      "order by privacy_reducing desc, desired_generation asc",
    );
    expect(sql).toContain("for update skip locked");
    // An applier that crashed mid-flight must not wedge an entity forever.
    expect(sql).toContain("status = 'processing' and lease_expires_at < now()");
    expect(captured[0]!.parameters).toContain(PUBLIC_PROJECTION_LEASE_SECONDS);
  });

  it("refuses an unsafe entity id before any row is written", async () => {
    const { captured, executor } = capturingExecutor([
      { desired_generation: "1" },
    ]);

    await expect(
      recordPublicProjectionIntent(executor, {
        entityId: "not-a-uuid",
        ownerUserId: OWNER_ID,
        desiredState: "absent",
        reason: "archive",
      }),
    ).rejects.toThrow(/invalid_journal_search_document_id/);
    expect(captured).toHaveLength(0);
  });
});

describe("OVE-242 privacy-reducing edit classification", () => {
  it("treats a removed sentence as privacy-reducing", () => {
    expect(
      isPublicTextReducingEdit(
        { title: "Tomatoes", body: "Planted near the old school." },
        { title: "Tomatoes", body: "Planted." },
      ),
    ).toBe(true);
  });

  it("treats a removed landmark inside the title as privacy-reducing", () => {
    expect(
      isPublicTextReducingEdit(
        { title: "Bed by the school", body: "Growing well." },
        { title: "Bed", body: "Growing well." },
      ),
    ).toBe(true);
  });

  it("treats a pure addition as neutral", () => {
    expect(
      isPublicTextReducingEdit(
        { title: "Tomatoes", body: "Growing well." },
        { title: "Tomatoes", body: "Growing well. Watered today." },
      ),
    ).toBe(false);
  });
});
