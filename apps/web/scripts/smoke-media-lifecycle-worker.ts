import { randomUUID } from "node:crypto";

import { db } from "../src/db";
import {
  deletePublicDerivativeObject,
  putPublicDerivativeObject,
} from "../src/lib/storage";
import {
  MEDIA_DERIVATIVE_REVOKE_KIND,
  MEDIA_LIFECYCLE_QUEUE,
} from "../src/server/job-queue-manifest";
import { proveCanonicalUrlUnreachable } from "../src/server/media/lifecycle-revoke";
import {
  drainMediaLifecycleQueue,
  MEDIA_LIFECYCLE_INVOCATION_BUDGET_MS,
} from "../src/server/media/media-lifecycle-consumer";

const RUN_ID = randomUUID();
const OBJECT_KEY = `ove216-lifecycle-smoke/${RUN_ID}.txt`;
const IDEMPOTENCY_KEY = `ove216-media-lifecycle-smoke:${RUN_ID}`;
const STALE_TOKEN = `stale-claim:${RUN_ID}`;

async function main() {
  const existing = await db
    .selectFrom("job_queue")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("queue_name", "=", MEDIA_LIFECYCLE_QUEUE)
    .where("status", "in", ["pending", "processing", "failed", "dead"])
    .executeTakeFirstOrThrow();
  const baselineUnfinished = Number(existing.count);

  await putPublicDerivativeObject(
    OBJECT_KEY,
    Buffer.from("ove216 synthetic lifecycle smoke\n", "utf8"),
    "text/plain",
  );

  try {
    const staleLockedAt = new Date("1970-01-01T00:00:00.000Z");
    const inserted = await db
      .insertInto("job_queue")
      .values({
        queue_name: MEDIA_LIFECYCLE_QUEUE,
        payload: {
          kind: MEDIA_DERIVATIVE_REVOKE_KIND,
          bucket: "public_derivative",
          objectKey: OBJECT_KEY,
          reason: "orphan",
        },
        status: "processing",
        attempts: 0,
        locked_at: staleLockedAt,
        locked_by: STALE_TOKEN,
        available_at: staleLockedAt,
        idempotency_key: IDEMPOTENCY_KEY,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const result = await drainMediaLifecycleQueue(1);
    const settled = await db
      .selectFrom("job_queue")
      .select(["status", "attempts", "locked_by"])
      .where("id", "=", inserted.id)
      .executeTakeFirstOrThrow();
    const staleSettlement = await db
      .updateTable("job_queue")
      .set({ status: "failed" })
      .where("id", "=", inserted.id)
      .where("status", "=", "processing")
      .where("locked_by", "=", STALE_TOKEN)
      .returning("id")
      .executeTakeFirst();

    const originalFetch = globalThis.fetch;
    let transportOutcome: string;
    try {
      globalThis.fetch = (async () => {
        throw new TypeError("synthetic transport failure");
      }) as typeof fetch;
      transportOutcome = (
        await proveCanonicalUrlUnreachable("http://127.0.0.1.invalid/probe", {
          timeoutMs: 1,
          pollMs: 1,
        })
      ).outcome;
    } finally {
      globalThis.fetch = originalFetch;
    }

    const ok =
      result.claimed === 1 &&
      result.completed === 1 &&
      result.reclaimed === 1 &&
      result.failed === 0 &&
      result.dead === 0 &&
      result.superseded === 0 &&
      result.remaining === baselineUnfinished &&
      result.deadlineReached === false &&
      result.durationMs < MEDIA_LIFECYCLE_INVOCATION_BUDGET_MS &&
      settled.status === "done" &&
      settled.attempts === 1 &&
      settled.locked_by === null &&
      !staleSettlement &&
      transportOutcome === "indeterminate_transport";

    console.log(
      JSON.stringify({
        ok,
        issue: "OVE-216",
        evidenceClass: "media-lifecycle-worker",
        reclaimedClass:
          result.reclaimed === 1 ? "one_stale_lease" : "unexpected",
        settlementClass: settled.status,
        staleClaimantClass: staleSettlement ? "unsafe_settlement" : "fenced",
        transportProofClass: transportOutcome,
        deadlineClass: result.deadlineReached ? "reached" : "within_budget",
      }),
    );
    if (!ok) process.exitCode = 1;
  } finally {
    await deletePublicDerivativeObject(OBJECT_KEY).catch(() => undefined);
    await db
      .deleteFrom("job_queue")
      .where("idempotency_key", "=", IDEMPOTENCY_KEY)
      .execute();
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Media lifecycle worker smoke failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
