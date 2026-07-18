import { config as loadEnv } from "dotenv";
import { sql, type Kysely } from "kysely";

import type { Database } from "../src/db/schema";
import type { collectErasureDryRunCounts as collectCountsFn } from "../src/server/erasure-dry-run-repository";
import type {
  executeApprovedErasureRequest as executeErasureFn,
  expectedErasureMaintainerApprovalText as approvalTextFn,
} from "../src/server/erasure-execution";
import type { markErasureRequestDryRunReviewed as markDryRunReviewedFn } from "../src/server/erasure-request-repository";

let db: Kysely<Database>;
let collectErasureDryRunCounts: typeof collectCountsFn;
let executeApprovedErasureRequest: typeof executeErasureFn;
let expectedErasureMaintainerApprovalText: typeof approvalTextFn;
let markErasureRequestDryRunReviewed: typeof markDryRunReviewedFn;

const REQUESTER_USER_ID = "10000000-0000-4000-8000-000000000097";
const OPERATOR_USER_ID = "10000000-0000-4000-8000-000000000997";
const ERASED_SUBJECT_USER_ID = "10000000-0000-4000-8000-00000000e097";
const REQUEST_ID = "10000000-0000-4000-8000-000000009097";
const SPACE_ID = "10000000-0000-4000-8000-000000001097";
const OBJECT_ID = "10000000-0000-4000-8000-000000002097";
const CATALOG_ITEM_ID = "10000000-0000-4000-8000-000000003097";
const PUBLIC_ENTRY_ID = "10000000-0000-4000-8000-000000004097";
const PRIVATE_ENTRY_ID = "10000000-0000-4000-8000-000000005097";
const MEDIA_ID = "10000000-0000-4000-8000-000000006097";
const ANALYTICS_EVENT_ID = "10000000-0000-4000-8000-000000007097";
const INTERVIEW_ID = "10000000-0000-4000-8000-000000008097";
const SESSION_ID = "10000000-0000-4000-8000-000000011097";
const ACCOUNT_ID = "10000000-0000-4000-8000-000000012097";
const VERIFICATION_ID = "10000000-0000-4000-8000-000000013097";
const CROSS_USER_MENTION_EDGE_ID = "10000000-0000-4000-8000-000000014097";
const PUBLIC_SLUG = "ove-97-erasure-smoke";

async function main() {
  loadEnv({ path: ".env.local", override: false });

  ({ db } = await import("../src/db"));
  ({ collectErasureDryRunCounts } =
    await import("../src/server/erasure-dry-run-repository"));
  ({ executeApprovedErasureRequest, expectedErasureMaintainerApprovalText } =
    await import("../src/server/erasure-execution"));
  ({ markErasureRequestDryRunReviewed } =
    await import("../src/server/erasure-request-repository"));

  await cleanupSmokeRows();
  await seedSmokeRows();

  const before = await collectErasureDryRunCounts(db, REQUESTER_USER_ID);
  assertEqual(before.authUserPresent, 1, "dry-run auth user");
  assertEqual(before.publicIdentityProfiles, 1, "dry-run public identity");
  assertEqual(before.currentHandleClaims, 1, "dry-run current handle claim");
  assertEqual(before.retiredHandleClaims, 1, "dry-run retired handle claim");
  assertEqual(before.unreviewedIdentityRows, 0, "dry-run reviewed identity");
  assertEqual(before.journalEntriesTotal, 2, "dry-run journal entries");
  assertEqual(before.mediaAssetsTotal, 1, "dry-run media assets");
  assertEqual(before.publicSlugs, 1, "dry-run public slug");
  assertEqual(before.analyticsEvents, 1, "dry-run analytics events");
  assertEqual(before.catalogProvisionalItems, 1, "dry-run catalog provisional");

  await markErasureRequestDryRunReviewed(
    { userId: OPERATOR_USER_ID, sessionId: "ove-97-smoke-operator" },
    { requestId: REQUEST_ID },
  );

  const deletedMediaObjects: string[] = [];
  const summary = await executeApprovedErasureRequest(
    { userId: OPERATOR_USER_ID, sessionId: "ove-97-smoke-operator" },
    {
      requestId: REQUEST_ID,
      approvalText: expectedErasureMaintainerApprovalText(REQUEST_ID),
    },
    {
      erasedSubjectUserId: ERASED_SUBJECT_USER_ID,
      deleteMediaObject: async (reference) => {
        deletedMediaObjects.push(reference.bucket);
      },
    },
  );

  assertEqual(summary.requestId, REQUEST_ID, "execution request id");
  assertEqual(summary.erasedSubjectUserId, ERASED_SUBJECT_USER_ID, "erased id");
  assertEqual(summary.mediaObjectsDeleted, 2, "media object delete calls");
  assertEqual(
    summary.publicEntriesQueuedForUnindex,
    1,
    "public entries queued for unindex",
  );
  assertEqual(deletedMediaObjects.length, 2, "fake media object deletes");

  const afterOldUser = await collectErasureDryRunCounts(db, REQUESTER_USER_ID);
  assertEqual(afterOldUser.authUserPresent, 0, "old auth user removed");
  assertEqual(
    afterOldUser.publicIdentityProfiles,
    0,
    "old public profile removed",
  );
  assertEqual(
    afterOldUser.currentHandleClaims,
    0,
    "old current handle removed",
  );
  assertEqual(
    afterOldUser.retiredHandleClaims,
    0,
    "old retired handles removed",
  );
  assertEqual(
    afterOldUser.journalEntriesTotal,
    0,
    "old journal ownership gone",
  );
  assertEqual(afterOldUser.mediaAssetsTotal, 0, "old media rows removed");
  assertEqual(afterOldUser.analyticsEvents, 0, "old analytics removed");
  assertEqual(
    afterOldUser.erasureRequestsTotal,
    0,
    "old erasure request subject rekeyed",
  );

  const crossUserMention = await db
    .selectFrom("lineage_provenance_edges")
    .select([
      "source_owner_user_id as sourceOwnerUserId",
      "source_reference_label as sourceReferenceLabel",
      "consent_state as consentState",
      "erasure_state as erasureState",
    ])
    .where("id", "=", CROSS_USER_MENTION_EDGE_ID)
    .executeTakeFirstOrThrow();
  assertEqual(
    crossUserMention.sourceOwnerUserId,
    OPERATOR_USER_ID,
    "cross-user mention source preserved",
  );
  assertEqual(
    crossUserMention.sourceReferenceLabel,
    null,
    "cross-user mention label shape preserved",
  );
  assertEqual(
    crossUserMention.consentState,
    "anonymized",
    "cross-user mention consent anonymized",
  );
  assertEqual(
    crossUserMention.erasureState,
    "anonymized",
    "cross-user mention erasure state",
  );

  const tombstone = await db
    .selectFrom("journal_entries")
    .select([
      "owner_user_id as ownerUserId",
      "title",
      "body",
      "visibility",
      "lifecycle_state as lifecycleState",
      "public_noindex as publicNoindex",
      "public_gone_at as publicGoneAt",
    ])
    .where("id", "=", PUBLIC_ENTRY_ID)
    .executeTakeFirstOrThrow();

  assertEqual(tombstone.ownerUserId, ERASED_SUBJECT_USER_ID, "synthetic owner");
  assertEqual(tombstone.title, "Erased journal entry", "journal title erased");
  assertEqual(
    tombstone.body,
    "This entry was erased by request.",
    "journal body erased",
  );
  assertEqual(tombstone.visibility, "private", "journal visibility private");
  assertEqual(tombstone.lifecycleState, "archived", "journal archived");
  assertEqual(tombstone.publicNoindex, true, "journal noindex");
  if (!tombstone.publicGoneAt) {
    throw new Error("public tombstone missing public_gone_at");
  }

  const unindexJob = await db
    .selectFrom("job_queue")
    .select(["payload", "status"])
    .where("idempotency_key", "=", `${unindexIdempotencyKey()}`)
    .executeTakeFirstOrThrow();

  assertEqual(unindexJob.status, "pending", "unindex job pending");
  const payload = unindexJob.payload as {
    kind?: string;
    journalEntryId?: string;
    userId?: string;
  };
  assertEqual(payload.kind, "journal_entry_unindex", "unindex job kind");
  assertEqual(
    payload.journalEntryId,
    PUBLIC_ENTRY_ID,
    "unindex job journal entry",
  );
  assertEqual(
    payload.userId,
    ERASED_SUBJECT_USER_ID,
    "unindex job synthetic owner",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        request: "OVE-97",
        dryRunClassesChecked: [
          "auth",
          "public_identity",
          "journal",
          "media",
          "public_tombstone",
          "analytics",
          "catalog_provisional",
        ],
        erasedSubjectRekeyed: true,
        publicTombstone410Ready: true,
        unindexJobQueuedWithSyntheticOwner: true,
        productionDestructiveExecution: false,
      },
      null,
      2,
    ),
  );
}

async function seedSmokeRows() {
  const now = new Date("2026-07-01T09:00:00.000Z");

  await db
    .insertInto("user")
    .values({
      id: REQUESTER_USER_ID,
      name: "OVE 97 Smoke User",
      email: "ove-97-smoke@example.invalid",
      emailVerified: true,
      image: "https://example.invalid/avatar.png",
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  const rename = await sql<{ status: string }>`
    select status
    from overgarden_claim_user_public_handle(
      ${REQUESTER_USER_ID}::uuid,
      ${"ove203_erasure_smoke"}
    )
  `.execute(db);
  assertEqual(rename.rows[0]?.status, "updated", "identity rename fixture");

  await db
    .insertInto("session")
    .values({
      id: SESSION_ID,
      token: "ove-97-smoke-session-token",
      userId: REQUESTER_USER_ID,
      expiresAt: new Date("2026-07-02T09:00:00.000Z"),
      ipAddress: "203.0.113.97",
      userAgent: "ove-97-smoke-user-agent",
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  await db
    .insertInto("account")
    .values({
      id: ACCOUNT_ID,
      accountId: "ove-97-smoke-account",
      providerId: "credential",
      userId: REQUESTER_USER_ID,
      password: "ove-97-smoke-password",
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  await db
    .insertInto("verification")
    .values({
      id: VERIFICATION_ID,
      identifier: "ove-97-smoke@example.invalid",
      value: "ove-97-smoke-verification",
      expiresAt: new Date("2026-07-02T09:00:00.000Z"),
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  await db
    .insertInto("spaces")
    .values({
      id: SPACE_ID,
      owner_user_id: REQUESTER_USER_ID,
      display_name: "OVE-97 precise smoke garden",
      location_visibility: "region",
      coarse_region_code: "UA-30",
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto("catalog_items")
    .values({
      id: CATALOG_ITEM_ID,
      canonical_name: "OVE-97 provisional tomato",
      normalized_name: "ove-97 provisional tomato",
      status: "provisional",
      source: "user_added",
      source_id: "ove-97-smoke-source",
      created_by_user_id: REQUESTER_USER_ID,
      locale: "en",
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto("plant_objects")
    .values({
      id: OBJECT_ID,
      owner_user_id: REQUESTER_USER_ID,
      space_id: SPACE_ID,
      display_name: "OVE-97 Smoke Plant",
      object_kind: "plant",
      catalog_item_id: CATALOG_ITEM_ID,
      variety_text: "OVE-97 private variety text",
      variety_state: "user_added",
      location_visibility: "region",
      coarse_region_code: "UA-30",
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto("journal_entries")
    .values([
      {
        id: PUBLIC_ENTRY_ID,
        owner_user_id: REQUESTER_USER_ID,
        space_id: SPACE_ID,
        plant_object_id: OBJECT_ID,
        title: "OVE-97 public smoke title",
        body: "OVE-97 public smoke body",
        entry_date: "2026-07-01",
        visibility: "public",
        lifecycle_state: "active",
        public_slug: PUBLIC_SLUG,
        public_noindex: true,
        published_at: now,
        client_mutation_id: "ove-97-public-entry",
        created_at: now,
        updated_at: now,
      },
      {
        id: PRIVATE_ENTRY_ID,
        owner_user_id: REQUESTER_USER_ID,
        space_id: SPACE_ID,
        plant_object_id: OBJECT_ID,
        title: "OVE-97 private smoke title",
        body: "OVE-97 private smoke body",
        entry_date: "2026-07-01",
        visibility: "private",
        lifecycle_state: "active",
        public_noindex: true,
        client_mutation_id: "ove-97-private-entry",
        created_at: now,
        updated_at: now,
      },
    ])
    .execute();

  await db
    .insertInto("media_assets")
    .values({
      id: MEDIA_ID,
      owner_user_id: REQUESTER_USER_ID,
      journal_entry_id: PUBLIC_ENTRY_ID,
      quarantine_key: "quarantine/ove-97-smoke-private-original.jpg",
      derivative_key: "derivatives/ove-97-smoke-public.webp",
      status: "processed",
      original_deleted_at: now,
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto("analytics_events")
    .values({
      id: ANALYTICS_EVENT_ID,
      owner_user_id: REQUESTER_USER_ID,
      session_id: "ove-97-smoke-session",
      event_name: "entry_logged",
      properties: { smoke: "ove-97" },
      space_id: SPACE_ID,
      plant_object_id: OBJECT_ID,
      journal_entry_id: PUBLIC_ENTRY_ID,
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto("lineage_provenance_edges")
    .values({
      id: CROSS_USER_MENTION_EDGE_ID,
      owner_user_id: REQUESTER_USER_ID,
      subject_plant_object_id: OBJECT_ID,
      source_kind: "source_reference",
      source_plant_object_id: null,
      source_owner_user_id: OPERATOR_USER_ID,
      source_pending_identity_id: null,
      source_reference_kind: "person",
      source_reference_label: null,
      edge_type: "provenance",
      consent_state: "proposed",
      visibility_policy: "owner_only_until_confirmed",
      erasure_state: "active",
      client_mutation_id: "ove-203-cross-user-erasure-smoke",
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto("pilot_invite_grants")
    .values({
      user_id: REQUESTER_USER_ID,
      cohort: "founder_rehearsal",
      segment: "unknown_segment",
      granted_at: now,
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto("pilot_interview_learnings")
    .values({
      id: INTERVIEW_ID,
      recorded_by_user_id: OPERATOR_USER_ID,
      subject_user_id: REQUESTER_USER_ID,
      pilot_cohort: "founder_rehearsal",
      segment: "unknown_segment",
      activation_result: "unknown",
      return_reason: "unknown",
      main_objection: "unknown",
      observed_value: "unknown",
      next_action: "none",
      redacted_note: "OVE-97 smoke note",
      recorded_at: now,
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto("erasure_requests")
    .values({
      id: REQUEST_ID,
      requester_user_id: REQUESTER_USER_ID,
      request_scope: "account_data_erasure",
      status: "reviewing",
      submitted_at: now,
      intake_disclosure_version: "erasure-request-pilot-v3",
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto("job_queue")
    .values({
      queue_name: "matching",
      payload: {
        kind: "journal_entry_index",
        journalEntryId: PUBLIC_ENTRY_ID,
        userId: REQUESTER_USER_ID,
      },
      status: "pending",
      idempotency_key: "journal_entry_index:ove-97-smoke",
      created_at: now,
      updated_at: now,
    })
    .execute();
}

async function cleanupSmokeRows() {
  await db
    .deleteFrom("job_queue")
    .where((eb) =>
      eb.or([
        eb(sql`payload->>'userId'`, "in", [
          REQUESTER_USER_ID,
          ERASED_SUBJECT_USER_ID,
        ]),
        eb("idempotency_key", "like", "%ove-97%"),
      ]),
    )
    .execute();
  await db
    .deleteFrom("media_assets")
    .where("owner_user_id", "in", [REQUESTER_USER_ID, ERASED_SUBJECT_USER_ID])
    .execute();
  await db
    .deleteFrom("analytics_events")
    .where("owner_user_id", "in", [REQUESTER_USER_ID, ERASED_SUBJECT_USER_ID])
    .execute();
  await db
    .deleteFrom("journal_entries")
    .where("owner_user_id", "in", [REQUESTER_USER_ID, ERASED_SUBJECT_USER_ID])
    .execute();
  await db
    .deleteFrom("lineage_provenance_edges")
    .where("id", "=", CROSS_USER_MENTION_EDGE_ID)
    .execute();
  await db
    .deleteFrom("plant_objects")
    .where("owner_user_id", "in", [REQUESTER_USER_ID, ERASED_SUBJECT_USER_ID])
    .execute();
  await db
    .deleteFrom("spaces")
    .where("owner_user_id", "in", [REQUESTER_USER_ID, ERASED_SUBJECT_USER_ID])
    .execute();
  await db
    .deleteFrom("catalog_items")
    .where((eb) =>
      eb.or([
        eb("id", "=", CATALOG_ITEM_ID),
        eb("created_by_user_id", "in", [
          REQUESTER_USER_ID,
          ERASED_SUBJECT_USER_ID,
        ]),
      ]),
    )
    .execute();
  await db
    .deleteFrom("pilot_invite_grants")
    .where("user_id", "in", [REQUESTER_USER_ID, ERASED_SUBJECT_USER_ID])
    .execute();
  await db
    .updateTable("pilot_interview_learnings")
    .set({
      subject_user_id: null,
      redacted_note: null,
    })
    .where("subject_user_id", "in", [REQUESTER_USER_ID, ERASED_SUBJECT_USER_ID])
    .execute();
  await db
    .deleteFrom("pilot_interview_learnings")
    .where("id", "=", INTERVIEW_ID)
    .execute();
  await db
    .deleteFrom("erasure_requests")
    .where((eb) =>
      eb.or([
        eb("id", "=", REQUEST_ID),
        eb("requester_user_id", "in", [
          REQUESTER_USER_ID,
          ERASED_SUBJECT_USER_ID,
        ]),
      ]),
    )
    .execute();
  await db
    .deleteFrom("verification")
    .where("identifier", "=", "ove-97-smoke@example.invalid")
    .execute();
  await db
    .deleteFrom("session")
    .where("userId", "=", REQUESTER_USER_ID)
    .execute();
  await db
    .deleteFrom("account")
    .where("userId", "=", REQUESTER_USER_ID)
    .execute();
  await db.deleteFrom("user").where("id", "=", REQUESTER_USER_ID).execute();
}

function unindexIdempotencyKey() {
  return `journal_entry_unindex:${PUBLIC_ENTRY_ID}:erasure:${REQUEST_ID}`;
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

main()
  .finally(async () => {
    await db?.destroy();
  })
  .catch(() => {
    console.error(
      JSON.stringify({
        ok: false,
        request: "OVE-97",
        error: "erasure_smoke_failed",
      }),
    );
    process.exitCode = 1;
  });
