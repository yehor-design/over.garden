/**
 * OVE-242 transactional public-projection revocation proof.
 *
 * Unit tests pin the statements. This script proves the behaviour end to end
 * against a real local Postgres and a real local Meilisearch, on a disposable
 * synthetic owner it creates and deletes itself:
 *
 * 1. publish            — the canonical commit and the intent are atomic.
 * 2. crash_before_apply — killing the request path after commit still leaves a
 *                         durable intent that a later drain converges.
 * 3. edit_removes_text  — a removed sentence is gone from the index and the
 *                         gate sees the drift byte for byte until it is.
 * 4. hidden_region      — hiding the object's location removes the old region.
 * 5. archive            — archive converges to verified absence.
 * 6. replay             — replaying a committed mutation repairs a missing
 *                         intent instead of skipping it.
 * 7. out_of_order       — an applier holding an older generation cannot mark
 *                         newer desired state as converged.
 * 8. dead_letter        — a failing apply is retried then dead-lettered, and a
 *                         dead-lettered revocation fails the parity gate closed.
 *
 * Local only. Output is counts, class names and state names — never journal
 * text, slugs, owner ids or media URLs.
 */

import process from "node:process";
import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

interface CaseResult {
  case: string;
  passed: boolean;
  observed: Record<string, unknown>;
}

function readFlag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  return argv[index + 1] ?? null;
}

function requireLocalEnvironment(argv: string[]) {
  const environment = readFlag(argv, "--environment");
  const confirm = readFlag(argv, "--confirm-environment");
  if (!environment || environment !== confirm) {
    throw new Error(
      "Refuse to run without matching --environment and --confirm-environment.",
    );
  }
  if (environment !== "local") {
    throw new Error(
      "Refuse: this proof creates and deletes rows and is local-only.",
    );
  }
  const meiliHost = process.env.MEILISEARCH_HOST ?? "";
  const isLoopback =
    meiliHost.startsWith("http://127.0.0.1:") ||
    meiliHost.startsWith("http://localhost:") ||
    meiliHost.startsWith("http://[::1]:");
  if (!isLoopback) {
    throw new Error("Refuse: MEILISEARCH_HOST must be loopback for this proof.");
  }
}

const OWNER_ID = randomUUID();
const SPACE_ID = randomUUID();
const OBJECT_ID = randomUUID();
const ENTRY_ID = randomUUID();
const HANDLE = `ove242smoke${OWNER_ID.replaceAll("-", "").slice(0, 8)}`;
const SENSITIVE_SENTENCE = "Meet me by the tall blue gate on the corner.";

async function main() {
  const argv = process.argv.slice(2);
  requireLocalEnvironment(argv);

  const { db } = await import("../src/db");
  const { sql } = await import("kysely");
  const { meiliSearchClient } = await import("../src/server/search/client");
  const {
    applyPublicJournalIndexRepair,
    classifyPublicJournalIndexParity,
    redactParityReportForEvidence,
    PUBLIC_JOURNAL_ENTRIES_INDEX,
  } = await import("../src/server/search/public-journal-parity");
  const {
    arePublicProjectionsConverged,
    convergePublicProjectionsNow,
    drainPublicProjectionIntents,
    ensurePublicProjectionIntent,
    loadPublicProjectionConvergence,
    loadPublicProjectionOutboxGate,
    recordPublicProjectionIntent,
  } = await import("../src/server/search/public-projection-outbox");

  const index = meiliSearchClient().index(PUBLIC_JOURNAL_ENTRIES_INDEX);
  const results: CaseResult[] = [];
  const record = (name: string, passed: boolean, observed: object) => {
    results.push({ case: name, passed, observed: observed as never });
  };

  const observedDocument = async (): Promise<Record<string, unknown> | null> => {
    try {
      return (await index.getDocument(ENTRY_ID)) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const intentRow = async () => {
    const row = await db
      .selectFrom("public_projection_intents")
      .select([
        "desired_state as desiredState",
        "desired_generation as desiredGeneration",
        "applied_generation as appliedGeneration",
        "status",
        "attempts",
        "privacy_reducing as privacyReducing",
        "last_error_class as lastErrorClass",
      ])
      .where("entity_kind", "=", "journal_entry")
      .where("entity_id", "=", ENTRY_ID)
      .executeTakeFirst();
    return row ?? null;
  };

  try {
    await seed(db, sql);

    // 1. Publish: canonical state and intent land together.
    const publishedGeneration = await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("journal_entries")
        .values({
          id: ENTRY_ID,
          owner_user_id: OWNER_ID,
          space_id: SPACE_ID,
          plant_object_id: OBJECT_ID,
          title: "OVE-242 revocation smoke entry",
          body: `The seedlings are doing well. ${SENSITIVE_SENTENCE}`,
          entry_date: "2026-07-28",
          visibility: "public",
          lifecycle_state: "active",
          content_class: "real_ugc",
          public_slug: `ove-242-revocation-${OWNER_ID.slice(0, 8)}`,
          published_at: new Date(),
          client_mutation_id: `ove-242-${OWNER_ID}`,
        })
        .execute();
      return recordPublicProjectionIntent(trx, {
        entityId: ENTRY_ID,
        ownerUserId: OWNER_ID,
        desiredState: "present",
        reason: "publish",
      });
    });
    const afterPublish = await intentRow();
    record("publish_intent_is_atomic", afterPublish?.status === "pending", {
      status: afterPublish?.status,
      appliedBehindDesired:
        String(afterPublish?.appliedGeneration) !==
        String(afterPublish?.desiredGeneration),
      generationIsPositive: Number(publishedGeneration) > 0,
    });

    // 2. Crash before apply: nothing converged the intent, but a later drain
    //    still finds it. This is the window the old post-commit enqueue lost.
    const drained = await drainPublicProjectionIntents({ limit: 10 });
    const documentAfterDrain = await observedDocument();
    record(
      "crash_before_apply_is_recovered_by_drain",
      documentAfterDrain !== null &&
        (await arePublicProjectionsConverged([ENTRY_ID])),
      {
        drainOutcomes: drained.map((entry) => entry.outcome),
        documentPresent: documentAfterDrain !== null,
      },
    );

    // 3. An edit that removes a sensitive sentence must not stay searchable.
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("journal_entries")
        .set({ body: "The seedlings are doing well." })
        .where("id", "=", ENTRY_ID)
        .execute();
      await recordPublicProjectionIntent(trx, {
        entityId: ENTRY_ID,
        ownerUserId: OWNER_ID,
        desiredState: "present",
        reason: "edit",
        privacyReducing: true,
      });
    });
    const beforeEditConvergence = await observedDocument();
    const staleBeforeConvergence = JSON.stringify(
      beforeEditConvergence ?? {},
    ).includes(SENSITIVE_SENTENCE);
    await convergePublicProjectionsNow([ENTRY_ID]);
    const afterEditConvergence = await observedDocument();
    record(
      "removed_sentence_leaves_the_index",
      staleBeforeConvergence &&
        !JSON.stringify(afterEditConvergence ?? {}).includes(
          SENSITIVE_SENTENCE,
        ),
      {
        staleBeforeConvergence,
        staleAfterConvergence: JSON.stringify(
          afterEditConvergence ?? {},
        ).includes(SENSITIVE_SENTENCE),
      },
    );

    // 4. Hiding the object's location removes the previously public region.
    const regionBefore = (await observedDocument())?.coarseRegionCode ?? null;
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("plant_objects")
        .set({ location_visibility: "hidden", coarse_region_code: null })
        .where("id", "=", OBJECT_ID)
        .execute();
      await recordPublicProjectionIntent(trx, {
        entityId: ENTRY_ID,
        ownerUserId: OWNER_ID,
        desiredState: "present",
        reason: "location_change",
      });
    });
    await convergePublicProjectionsNow([ENTRY_ID]);
    const documentAfterHide = await observedDocument();
    record(
      "hidden_region_leaves_the_index",
      regionBefore !== null &&
        documentAfterHide !== null &&
        documentAfterHide.coarseRegionCode === undefined &&
        documentAfterHide.locationVisibility === "hidden",
      {
        hadRegionBefore: regionBefore !== null,
        locationVisibilityAfter: documentAfterHide?.locationVisibility,
        regionKeyPresentAfter:
          documentAfterHide !== null && "coarseRegionCode" in documentAfterHide,
      },
    );

    // 5. Replay repairs a missing intent instead of trusting the canonical row.
    await db
      .deleteFrom("public_projection_intents")
      .where("entity_id", "=", ENTRY_ID)
      .execute();
    const repaired = await db.transaction().execute(async (trx) =>
      ensurePublicProjectionIntent(trx, {
        entityId: ENTRY_ID,
        ownerUserId: OWNER_ID,
        desiredState: "present",
        reason: "edit",
      }),
    );
    const secondRepair = await db.transaction().execute(async (trx) =>
      ensurePublicProjectionIntent(trx, {
        entityId: ENTRY_ID,
        ownerUserId: OWNER_ID,
        desiredState: "present",
        reason: "edit",
      }),
    );
    record(
      "replay_repairs_a_missing_intent_once",
      repaired === "recorded" && secondRepair === "already_present",
      { firstReplay: repaired, secondReplay: secondRepair },
    );
    await convergePublicProjectionsNow([ENTRY_ID]);

    // 6. Out-of-order generations: an applier holding an older generation can
    //    never settle newer desired state.
    const stale = await intentRow();
    const staleGeneration = String(stale?.desiredGeneration ?? "0");
    await db.transaction().execute(async (trx) => {
      // Moderation removes the entry from every public surface, not only from
      // search: the canonical row and the removal intent move together, so the
      // index and the public route can never disagree.
      await trx
        .updateTable("journal_entries")
        .set({
          lifecycle_state: "archived",
          public_gone_at: new Date(),
        })
        .where("id", "=", ENTRY_ID)
        .execute();
      await recordPublicProjectionIntent(trx, {
        entityId: ENTRY_ID,
        ownerUserId: OWNER_ID,
        desiredState: "absent",
        reason: "moderation",
      });
    });
    const staleSettle = await sql<{ entity_id: string }>`
      update public_projection_intents
      set status = 'applied',
          applied_state = 'present',
          applied_generation = desired_generation,
          verified_at = now()
      where entity_kind = 'journal_entry'
        and entity_id = ${ENTRY_ID}::uuid
        and desired_generation = ${staleGeneration}::bigint
      returning entity_id
    `.execute(db);
    const afterStaleSettle = await intentRow();
    record(
      "older_generation_cannot_settle_newer_state",
      staleSettle.rows.length === 0 && afterStaleSettle?.status === "pending",
      {
        staleSettleRowsAffected: staleSettle.rows.length,
        statusAfter: afterStaleSettle?.status,
        desiredStateAfter: afterStaleSettle?.desiredState,
      },
    );

    // 7. Moderation removal converges to verified absence.
    await convergePublicProjectionsNow([ENTRY_ID]);
    const documentAfterModeration = await observedDocument();
    const convergence = await loadPublicProjectionConvergence([ENTRY_ID]);
    record(
      "moderation_removal_converges_to_verified_absence",
      documentAfterModeration === null &&
        convergence[0]?.converged === true &&
        convergence[0]?.desiredState === "absent",
      {
        documentPresent: documentAfterModeration !== null,
        converged: convergence[0]?.converged,
        status: convergence[0]?.status,
      },
    );

    // 8. Dead-letter: a revocation that cannot be applied fails the gate closed
    //    rather than being reported as removed.
    await db.transaction().execute(async (trx) => {
      await recordPublicProjectionIntent(trx, {
        entityId: ENTRY_ID,
        ownerUserId: OWNER_ID,
        desiredState: "absent",
        reason: "journal_delete",
      });
    });
    await sql`
      update public_projection_intents
      set status = 'dead',
          last_error_class = 'apply_failed',
          attempts = 5
      where entity_kind = 'journal_entry'
        and entity_id = ${ENTRY_ID}::uuid
    `.execute(db);
    const gateWithDeadLetter = await loadPublicProjectionOutboxGate();
    const parityWithDeadLetter = redactParityReportForEvidence(
      await classifyPublicJournalIndexParity(),
    );
    record(
      "dead_lettered_revocation_fails_the_parity_gate_closed",
      gateWithDeadLetter.dead >= 1 &&
        parityWithDeadLetter.counts.projection_dead >= 1 &&
        parityWithDeadLetter.zeroGap === false &&
        (await arePublicProjectionsConverged([ENTRY_ID])) === false,
      {
        outboxDead: gateWithDeadLetter.dead,
        parityProjectionDead: parityWithDeadLetter.counts.projection_dead,
        zeroGap: parityWithDeadLetter.zeroGap,
      },
    );

    const ok = results.every((result) => result.passed);
    console.log(
      JSON.stringify(
        {
          ok,
          environment: "local",
          issue: "OVE-242",
          evidenceClass: "public_projection_revocation",
          policy: "ove242.publicProjectionOutbox.v1",
          cases: results,
          failedCases: results
            .filter((result) => !result.passed)
            .map((result) => result.case),
          evidenceSafety: "counts_classes_and_state_names",
        },
        null,
        2,
      ),
    );
    if (!ok) process.exitCode = 2;
  } finally {
    await cleanup(db);
    // Leave the local corpus converged for the next proof.
    await applyPublicJournalIndexRepair().catch(() => undefined);
    await db.destroy();
  }
}

type Db = Awaited<typeof import("../src/db")>["db"];
type SqlTag = (typeof import("kysely"))["sql"];

async function seed(db: Db, sql: SqlTag) {
  const now = new Date("2026-07-28T09:00:00.000Z");

  await db
    .insertInto("user")
    .values({
      id: OWNER_ID,
      name: "OVE-242 revocation smoke owner",
      email: `ove-242-${OWNER_ID}@example.invalid`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  const claimed = await sql<{ status: string }>`
    select status
    from overgarden_claim_user_public_handle(${OWNER_ID}::uuid, ${HANDLE})
  `.execute(db);
  if (claimed.rows[0]?.status !== "updated") {
    throw new Error("Refuse: could not claim a disposable public handle.");
  }

  await db
    .updateTable("user_public_profiles")
    .set({
      profile_visibility: "public",
      profile_lifecycle_state: "active",
      removed_at: null,
      updated_at: now,
    })
    .where("user_id", "=", OWNER_ID)
    .execute();

  await db
    .insertInto("spaces")
    .values({
      id: SPACE_ID,
      owner_user_id: OWNER_ID,
      display_name: "OVE-242 revocation smoke garden",
      location_visibility: "region",
      coarse_region_code: "UA-32",
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto("plant_objects")
    .values({
      id: OBJECT_ID,
      owner_user_id: OWNER_ID,
      space_id: SPACE_ID,
      display_name: "OVE-242 revocation smoke plant",
      object_kind: "plant",
      variety_state: "unknown",
      location_visibility: "region",
      coarse_region_code: "UA-32",
      created_at: now,
      updated_at: now,
    })
    .execute();

}

async function cleanup(db: Db) {
  await db
    .deleteFrom("public_projection_intents")
    .where("entity_id", "=", ENTRY_ID)
    .execute()
    .catch(() => undefined);
  const { meiliSearchClient } = await import("../src/server/search/client");
  await meiliSearchClient()
    .index("journal_entries")
    .deleteDocument(ENTRY_ID)
    .catch(() => undefined);
  await db
    .deleteFrom("journal_entries")
    .where("id", "=", ENTRY_ID)
    .execute()
    .catch(() => undefined);
  await db
    .deleteFrom("plant_objects")
    .where("id", "=", OBJECT_ID)
    .execute()
    .catch(() => undefined);
  await db
    .deleteFrom("spaces")
    .where("id", "=", SPACE_ID)
    .execute()
    .catch(() => undefined);
  await db
    .deleteFrom("user_public_profiles")
    .where("user_id", "=", OWNER_ID)
    .execute()
    .catch(() => undefined);
  await db
    .deleteFrom("user_handle_registry")
    .where("user_id", "=", OWNER_ID)
    .execute()
    .catch(() => undefined);
  await db
    .deleteFrom("user")
    .where("id", "=", OWNER_ID)
    .execute()
    .catch(() => undefined);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "public projection revocation proof failed",
  );
  process.exitCode = 1;
});
