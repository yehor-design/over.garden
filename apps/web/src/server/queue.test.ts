import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  JobQueuePayloadContractError,
  validateJobQueuePayload,
} from "./job-queue-manifest";
import {
  assertJobQueueInventorySqlIsSelectOnly,
  buildJobQueueInventoryReport,
  formatJobQueueInventoryReport,
  JOB_QUEUE_PAYLOAD_INVENTORY_SQL,
  runWithDeadline,
} from "./job-queue-payload-inventory";

const ENTRY_ID = "9f9a1f0c-0f1a-4a2b-8c3d-4e5f60718293";
const OWNER_ID = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9";
const OTHER_OWNER_ID = "77777777-8888-4999-aaaa-bbbbccccdddd";

const insertedRows: { payload: unknown; idempotencyKey: string | null }[] = [];
const existingByIdempotencyKey = new Map<string, string>();

/**
 * Minimal Kysely-shaped stub. Any call proves the producer reached the
 * database, so a refusal test fails loudly if validation is ever skipped.
 */
vi.mock("@/db", () => {
  const db = {
    insertInto: () => ({
      values: (values: {
        id: string;
        payload: unknown;
        idempotency_key: string | null;
      }) => ({
        returning: () => ({
          executeTakeFirstOrThrow: async () => {
            const key = values.idempotency_key;
            if (key && existingByIdempotencyKey.has(key)) {
              throw Object.assign(new Error("duplicate key"), {
                code: "23505",
              });
            }
            insertedRows.push({
              payload: values.payload,
              idempotencyKey: key,
            });
            if (key) existingByIdempotencyKey.set(key, values.id);
            return { id: values.id };
          },
        }),
      }),
    }),
    selectFrom: () => ({
      select: () => ({
        where: (_column: string, _op: string, value: string) => ({
          executeTakeFirstOrThrow: async () => {
            const id = existingByIdempotencyKey.get(value);
            if (!id) throw new Error("not found");
            return { id };
          },
        }),
      }),
    }),
  };
  return { db };
});

const { enqueueJob } = await import("./queue");

function journalPayload(overrides: Record<string, unknown> = {}) {
  return {
    kind: "journal_entry_index",
    journalEntryId: ENTRY_ID,
    userId: OWNER_ID,
    ...overrides,
  };
}

beforeEach(() => {
  insertedRows.length = 0;
  existingByIdempotencyKey.clear();
});

describe("enqueueJob payload contract (OVE-225)", () => {
  it("inserts a conforming journal payload unchanged", async () => {
    const id = await enqueueJob("matching", journalPayload(), {
      idempotencyKey: `journal_entry_index:${ENTRY_ID}`,
    });

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].payload).toEqual(journalPayload());
  });

  it("refuses a private extra key before the row is ever created", async () => {
    for (const extra of [
      { title: "private journal title" },
      { body: "private journal body" },
      { email: "someone@example.com" },
      { mediaUrl: "https://media.example/quarantine/original.jpg" },
      { latitude: "50.4501" },
    ]) {
      await expect(
        enqueueJob("matching", journalPayload(extra)),
      ).rejects.toBeInstanceOf(JobQueuePayloadContractError);
    }

    expect(insertedRows).toEqual([]);
  });

  it("never echoes a refused value in the thrown error", async () => {
    const error: unknown = await enqueueJob(
      "matching",
      journalPayload({ body: "do-not-leak" }),
    ).then(
      () => null,
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(JobQueuePayloadContractError);
    if (!(error instanceof JobQueuePayloadContractError)) return;
    expect(error.message).not.toContain("do-not-leak");
    expect(error.message).not.toContain("body");
    expect(error.violation.ruleClass).toBe("unexpected_key");
  });

  it("cannot be used to smuggle another owner through an extra key", async () => {
    await expect(
      enqueueJob(
        "matching",
        journalPayload({ ownerUserId: OTHER_OWNER_ID }),
      ),
    ).rejects.toBeInstanceOf(JobQueuePayloadContractError);

    expect(insertedRows).toEqual([]);
  });

  it("refuses a non-UUID identifier and an undeclared kind", async () => {
    await expect(
      enqueueJob("matching", journalPayload({ journalEntryId: "entry-id" })),
    ).rejects.toMatchObject({
      violation: { ruleClass: "non_uuid_value", key: "journalEntryId" },
    });

    await expect(
      enqueueJob("matching", { kind: "not_a_declared_kind", id: ENTRY_ID }),
    ).rejects.toMatchObject({ violation: { ruleClass: "unknown_kind" } });

    expect(insertedRows).toEqual([]);
  });

  it("keeps replay idempotent and the returned id stable (AC-04)", async () => {
    const idempotencyKey = `journal_entry_index:${ENTRY_ID}`;
    const first = await enqueueJob("matching", journalPayload(), {
      idempotencyKey,
    });
    const second = await enqueueJob("matching", journalPayload(), {
      idempotencyKey,
    });

    expect(second).toBe(first);
    expect(insertedRows).toHaveLength(1);
  });
});

describe("PERF-01 job_queue_payload_validation_duration", () => {
  it("validates a payload in at most 5 milliseconds", () => {
    const iterations = 10_000;
    const payload = journalPayload();

    // Warm up so the measurement is not dominated by first-call compilation.
    for (let index = 0; index < 1_000; index += 1) {
      validateJobQueuePayload("matching", payload);
    }

    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      validateJobQueuePayload("matching", payload);
    }
    const jobQueuePayloadValidationDuration =
      (performance.now() - started) / iterations;

    expect(jobQueuePayloadValidationDuration).toBeLessThanOrEqual(5);
  });
});

describe("WAIT-01 operator inventory stays bounded", () => {
  it("keeps the inventory statement read-only", () => {
    expect(() => assertJobQueueInventorySqlIsSelectOnly()).not.toThrow();
    expect(JOB_QUEUE_PAYLOAD_INVENTORY_SQL.toLowerCase().startsWith("select")).toBe(
      true,
    );
    expect(() =>
      assertJobQueueInventorySqlIsSelectOnly(
        "select 1; validate constraint job_queue_journal_entry_index_payload_check",
      ),
    ).toThrow(/read-only/);
  });

  it("returns a bounded timed_out receipt when Postgres is slow", async () => {
    const timeoutMs = 25;
    const started = performance.now();
    const outcome = await runWithDeadline(
      () => new Promise((resolve) => setTimeout(resolve, 5_000)),
      timeoutMs,
    );
    const elapsed = performance.now() - started;

    expect(outcome).toEqual({ status: "timed_out", timeoutMs });
    expect(elapsed).toBeLessThan(2_000);
  });

  it("keeps the dry-run plan and a completed query usable during the same wait", async () => {
    const slow = runWithDeadline(
      () => new Promise((resolve) => setTimeout(resolve, 5_000)),
      25,
    );

    // The timeout-bounded inventory command and the dry-run plan command both
    // stay responsive while the slow query is still outstanding.
    const dryRunPlan = formatJobQueueInventoryReport(
      buildJobQueueInventoryReport([]),
      { environment: "local", dryRun: true, timeoutMs: 25 },
    );
    expect(dryRunPlan).toContain("violations=0");

    const fast = await runWithDeadline(async () => "ok", 25);
    expect(fast).toEqual({ status: "completed", value: "ok" });

    expect(await slow).toMatchObject({ status: "timed_out" });
  });

  it("reports counts and reason classes only", () => {
    const report = buildJobQueueInventoryReport([
      { kind: "journal_entry_index", reasonClass: "conforming", rowCount: 41 },
      { kind: "journal_entry_index", reasonClass: "unexpected_key", rowCount: 2 },
      {
        kind: "journal_entry_unindex",
        reasonClass: "non_uuid_value",
        rowCount: 1,
      },
    ]);

    expect(report.violations).toBe(3);
    expect(report.total).toBe(44);

    const formatted = formatJobQueueInventoryReport(report, {
      environment: "production",
      dryRun: false,
      timeoutMs: 30_000,
    });
    expect(formatted).toContain("violations=3");
    expect(formatted).toContain("constraint validation is blocked");
    expect(formatted).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
