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
const SECOND_PUBLIC_ENTRY_ID = "10000000-0000-4000-8000-000000005097";
const MEDIA_ID = "10000000-0000-4000-8000-000000006097";
const COVER_MEDIA_ID = "10000000-0000-4000-8000-000000006197";
const ANALYTICS_EVENT_ID = "10000000-0000-4000-8000-000000007097";
const SESSION_ID = "10000000-0000-4000-8000-000000011097";
const ACCOUNT_ID = "10000000-0000-4000-8000-000000012097";
const VERIFICATION_ID = "10000000-0000-4000-8000-000000013097";
const CROSS_USER_MENTION_EDGE_ID = "10000000-0000-4000-8000-000000014097";
const COMMUNITY_ID = "10000000-0000-4000-8000-000000015097";
const COMMUNITY_TOPIC_ID = "10000000-0000-4000-8000-000000016097";
const COMMUNITY_CONTRIBUTION_ID = "10000000-0000-4000-8000-000000017097";
const COMMUNITY_REPORT_ID = "10000000-0000-4000-8000-000000018097";
const COMMUNITY_AUDIT_ID = "10000000-0000-4000-8000-000000019097";
const CONTRIBUTOR_USER_ID = "10000000-0000-4000-8000-00000001b097";
const PUBLIC_SLUG = "ove-192-erasure-smoke";
const ERASURE_TOMBSTONE_USER_ID = "00000000-0000-4000-8000-00000000ead1";

function assertLoopbackEnvironment() {
  const environment = readFlagValue("--environment");
  const confirm = readFlagValue("--confirm-environment");
  if (environment !== "local" || confirm !== "local") {
    throw new Error(
      "OVE-215 smoke requires --environment local --confirm-environment local.",
    );
  }

  const databaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!databaseUrl || !isLoopbackDatabase(databaseUrl)) {
    throw new Error(
      "OVE-215 smoke refuses non-loopback or missing DATABASE_URL before any write.",
    );
  }
}

function readFlagValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function isLoopbackDatabase(connectionString: string) {
  try {
    const hostname = new URL(connectionString).hostname.toLowerCase();
    return new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]).has(
      hostname,
    );
  } catch {
    return false;
  }
}

async function main() {
  loadEnv({ path: ".env.local", override: false });
  assertLoopbackEnvironment();

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
  assertEqual(before.journalMutationReceipts, 1, "dry-run mutation receipts");
  assertEqual(before.mediaAssetsTotal, 2, "dry-run media assets");
  assertEqual(before.mediaAssetsCoverOnly, 1, "dry-run cover-only media");
  assertEqual(before.mediaAssetsWithExplicitCover, 1, "dry-run explicit cover");
  assertEqual(
    before.communityModerationActorRefs,
    2,
    "dry-run community moderation refs",
  );
  assertEqual(before.publicSlugs, 2, "dry-run public slugs");
  assertEqual(before.analyticsEvents, 1, "dry-run analytics events");
  assertEqual(before.catalogProvisionalItems, 1, "dry-run catalog provisional");
  assertEqual(
    before.searchTerminalJobsWithUserId,
    1,
    "dry-run terminal queue residue",
  );

  await markErasureRequestDryRunReviewed(
    { userId: OPERATOR_USER_ID, sessionId: "ove-192-smoke-operator" },
    { requestId: REQUEST_ID },
  );

  const deletedMediaObjects: string[] = [];
  let failNextDelete = true;
  const deleteMediaObject = async (reference: {
    bucket: string;
    objectKey: string;
  }) => {
    if (failNextDelete) {
      failNextDelete = false;
      throw new Error("simulated storage failure");
    }
    deletedMediaObjects.push(reference.bucket);
  };

  let firstPassFailed = false;
  try {
    await executeApprovedErasureRequest(
      { userId: OPERATOR_USER_ID, sessionId: "ove-192-smoke-operator" },
      {
        requestId: REQUEST_ID,
        approvalText: expectedErasureMaintainerApprovalText(REQUEST_ID),
      },
      {
        erasedSubjectUserId: ERASED_SUBJECT_USER_ID,
        deleteMediaObject,
      },
    );
  } catch {
    firstPassFailed = true;
  }
  assertEqual(firstPassFailed, true, "first pass surfaces storage failure");

  const pendingStatus = await db
    .selectFrom("erasure_requests")
    .select(["handled_status as handledStatus", "status"])
    .where("id", "=", REQUEST_ID)
    .executeTakeFirstOrThrow();
  assertEqual(
    pendingStatus.status,
    "handled",
    "cleanup_pending status handled",
  );
  assertEqual(
    pendingStatus.handledStatus,
    "cleanup_pending",
    "cleanup_pending handled_status",
  );

  const terminalJob = await db
    .selectFrom("job_queue")
    .select("id")
    .where("queue_name", "=", "erasure")
    .where(sql`payload->>'requestId'`, "=", REQUEST_ID)
    .orderBy("created_at", "asc")
    .executeTakeFirstOrThrow();
  await db
    .updateTable("job_queue")
    .set({ status: "dead", terminal_error_code: "max_attempts_exceeded" })
    .where("id", "=", terminalJob.id)
    .execute();

  const terminalSummary = await executeApprovedErasureRequest(
    { userId: OPERATOR_USER_ID, sessionId: "ove-192-smoke-operator" },
    {
      requestId: REQUEST_ID,
      approvalText: expectedErasureMaintainerApprovalText(REQUEST_ID),
    },
    {
      erasedSubjectUserId: ERASED_SUBJECT_USER_ID,
      deleteMediaObject,
    },
  );
  assertEqual(
    terminalSummary.handledStatus,
    "cleanup_pending",
    "dead media cleanup blocks completion",
  );

  await db
    .updateTable("job_queue")
    .set({ status: "failed", terminal_error_code: null })
    .where("id", "=", terminalJob.id)
    .execute();

  const summary = await executeApprovedErasureRequest(
    { userId: OPERATOR_USER_ID, sessionId: "ove-215-smoke-operator" },
    {
      requestId: REQUEST_ID,
      approvalText: expectedErasureMaintainerApprovalText(REQUEST_ID),
    },
    {
      erasedSubjectUserId: ERASED_SUBJECT_USER_ID,
      deleteMediaObject,
    },
  );

  assertEqual(summary.requestId, REQUEST_ID, "execution request id");
  assertEqual(summary.erasedSubjectUserId, ERASED_SUBJECT_USER_ID, "erased id");
  assertEqual(summary.handledStatus, "completed", "final handled status");
  assertEqual(
    summary.mediaObjectsDeleted > 0,
    true,
    "media deletes after retry",
  );
  assertEqual(
    summary.publicEntriesQueuedForUnindex,
    0,
    "retry path does not re-queue unindex",
  );
  assertEqual(
    deletedMediaObjects.length > 0,
    true,
    "fake media object deletes",
  );

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
  assertEqual(
    afterOldUser.journalMutationReceipts,
    0,
    "old mutation receipts removed",
  );
  assertEqual(afterOldUser.mediaAssetsTotal, 0, "old media rows removed");
  assertEqual(afterOldUser.analyticsEvents, 0, "old analytics removed");
  assertEqual(
    afterOldUser.erasureRequestsTotal,
    0,
    "old erasure request subject rekeyed",
  );
  assertEqual(
    afterOldUser.searchTerminalJobsWithUserId,
    0,
    "old terminal queue residue scrubbed",
  );

  await assertNoOldUserResidue();

  const contribution = await db
    .selectFrom("community_contributions")
    .select(["removed_by_user_id as removedBy"])
    .where("id", "=", COMMUNITY_CONTRIBUTION_ID)
    .executeTakeFirstOrThrow();
  assertEqual(
    contribution.removedBy,
    ERASURE_TOMBSTONE_USER_ID,
    "community removed_by rekeyed to tombstone",
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
      "public_gone_at as publicGoneAt",
      "cover_media_asset_id as coverMediaAssetId",
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
  assertEqual(tombstone.visibility, "public", "journal visibility public");
  assertEqual(tombstone.lifecycleState, "archived", "journal archived");
  assertEqual(tombstone.coverMediaAssetId, null, "cover cleared");
  if (!tombstone.publicGoneAt) {
    throw new Error("public tombstone missing public_gone_at");
  }

  const projectionIntent = await db
    .selectFrom("public_projection_intents")
    .select([
      "owner_user_id as ownerUserId",
      "desired_state as desiredState",
      "desired_generation as desiredGeneration",
      "applied_state as appliedState",
      "applied_generation as appliedGeneration",
      "status",
      "verified_at as verifiedAt",
    ])
    .where("entity_kind", "=", "journal_entry")
    .where("entity_id", "=", PUBLIC_ENTRY_ID)
    .executeTakeFirstOrThrow();

  assertEqual(projectionIntent.status, "applied", "projection intent applied");
  assertEqual(
    projectionIntent.ownerUserId,
    ERASED_SUBJECT_USER_ID,
    "projection intent synthetic owner",
  );
  assertEqual(projectionIntent.desiredState, "absent", "desired absence");
  assertEqual(projectionIntent.appliedState, "absent", "applied absence");
  assertEqual(
    projectionIntent.appliedGeneration,
    projectionIntent.desiredGeneration,
    "generation-fenced convergence",
  );
  if (!projectionIntent.verifiedAt) {
    throw new Error("projection absence missing verified_at");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        request: "OVE-215",
        dryRunClassesChecked: [
          "auth",
          "public_identity",
          "journal",
          "media",
          "cover",
          "community",
          "public_tombstone",
          "analytics",
          "catalog_provisional",
          "queue_terminal",
        ],
        storageFailureRetryRecovered: true,
        deadMediaCleanupBlockedCompletion: true,
        erasedSubjectRekeyed: true,
        publicTombstone410Ready: true,
        publicProjectionAbsenceVerifiedWithSyntheticOwner: true,
        productionDestructiveExecution: false,
      },
      null,
      2,
    ),
  );
}

async function assertNoOldUserResidue() {
  const residue = await sql<{ count: number }>`
    select (
      (select count(*)::int from "user" where id = ${REQUESTER_USER_ID}::uuid)
      + (select count(*)::int from session where "userId" = ${REQUESTER_USER_ID}::uuid)
      + (select count(*)::int from account where "userId" = ${REQUESTER_USER_ID}::uuid)
      + (select count(*)::int from user_public_profiles where user_id = ${REQUESTER_USER_ID}::uuid)
      + (select count(*)::int from user_handle_registry where user_id = ${REQUESTER_USER_ID}::uuid)
      + (select count(*)::int from media_assets where owner_user_id = ${REQUESTER_USER_ID}::uuid)
      + (select count(*)::int from journal_entries where owner_user_id = ${REQUESTER_USER_ID}::uuid)
      + (select count(*)::int from community_contributions where removed_by_user_id = ${REQUESTER_USER_ID}::uuid)
      + (select count(*)::int from community_contribution_reports where resolved_by_user_id = ${REQUESTER_USER_ID}::uuid)
      + (select count(*)::int from community_moderation_audit_log where actor_user_id = ${REQUESTER_USER_ID}::uuid)
      + (select count(*)::int from job_queue where payload::text like ${"%" + REQUESTER_USER_ID + "%"})
    ) as count
  `.execute(db);
  assertEqual(Number(residue.rows[0]?.count ?? 1), 0, "zero old-id residue");
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
        published_at: now,
        client_mutation_id: "ove-97-public-entry",
        created_at: now,
        updated_at: now,
      },
      {
        id: SECOND_PUBLIC_ENTRY_ID,
        owner_user_id: REQUESTER_USER_ID,
        space_id: SPACE_ID,
        plant_object_id: OBJECT_ID,
        title: "OVE-97 second public smoke title",
        body: "OVE-97 second public smoke body",
        entry_date: "2026-07-01",
        visibility: "public",
        lifecycle_state: "active",
        public_slug: `${PUBLIC_SLUG}-second`,
        published_at: now,
        client_mutation_id: "ove-97-second-public-entry",
        created_at: now,
        updated_at: now,
      },
    ])
    .execute();

  await db
    .insertInto("media_assets")
    .values([
      {
        id: MEDIA_ID,
        owner_user_id: REQUESTER_USER_ID,
        journal_entry_id: PUBLIC_ENTRY_ID,
        derivative_key: "derivatives/ove-192-smoke-public.webp",
        usage_role: "inline",
        document_position: 1,
        upload_generation: 1,
        declared_size_bytes: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: COVER_MEDIA_ID,
        owner_user_id: REQUESTER_USER_ID,
        journal_entry_id: PUBLIC_ENTRY_ID,
        derivative_key: "derivatives/ove-192-smoke-cover.webp",
        usage_role: "cover_only",
        document_position: null,
        upload_generation: 1,
        declared_size_bytes: 1,
        created_at: now,
        updated_at: now,
      },
    ])
    .execute();

  await db
    .insertInto("journal_entry_mutation_receipts")
    .values({
      owner_user_id: REQUESTER_USER_ID,
      journal_entry_id: PUBLIC_ENTRY_ID,
      client_mutation_id: "ove-215-erasure-receipt",
      base_revision: 0,
      result_revision: 1,
      mutation_kind: "create",
      created_at: now,
    })
    .execute();

  await db
    .updateTable("journal_entries")
    .set({ cover_media_asset_id: COVER_MEDIA_ID })
    .where("id", "=", PUBLIC_ENTRY_ID)
    .execute();

  await db
    .insertInto("user")
    .values({
      id: CONTRIBUTOR_USER_ID,
      name: "OVE 192 Contributor",
      email: "ove-192-contributor@example.invalid",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  await sql`
    insert into journal_topics (id, slug, label, trust_state, created_at, updated_at)
    values (
      ${COMMUNITY_TOPIC_ID}::uuid,
      'ove-192-erasure-topic',
      'OVE-192 topic',
      'curated',
      ${now},
      ${now}
    )
    on conflict (id) do nothing
  `.execute(db);

  await sql`
    insert into communities (
      id, slug, content_key, journal_topic_id, lifecycle_state, participation_state, created_at, updated_at
    ) values (
      ${COMMUNITY_ID}::uuid,
      'ove-192-erasure-community',
      'ove-192-erasure-community',
      ${COMMUNITY_TOPIC_ID}::uuid,
      'active',
      'open',
      ${now},
      ${now}
    )
    on conflict (id) do nothing
  `.execute(db);

  await sql`
    insert into community_contributions (
      id, community_id, journal_entry_id, contributor_user_id, contribution_state,
      discussion_state, removed_by_user_id, removal_reason, added_at, removed_at, updated_at
    ) values (
      ${COMMUNITY_CONTRIBUTION_ID}::uuid,
      ${COMMUNITY_ID}::uuid,
      ${PUBLIC_ENTRY_ID}::uuid,
      ${CONTRIBUTOR_USER_ID}::uuid,
      'removed',
      'closed',
      ${REQUESTER_USER_ID}::uuid,
      'spam',
      ${now},
      ${now},
      ${now}
    )
    on conflict do nothing
  `.execute(db);

  await sql`
    insert into community_contribution_reports (
      id, contribution_id, reporter_user_id, report_reason, report_state,
      resolved_by_user_id, resolved_at, created_at, updated_at
    ) values (
      ${COMMUNITY_REPORT_ID}::uuid,
      ${COMMUNITY_CONTRIBUTION_ID}::uuid,
      ${CONTRIBUTOR_USER_ID}::uuid,
      'spam',
      'actioned',
      ${REQUESTER_USER_ID}::uuid,
      ${now},
      ${now},
      ${now}
    )
    on conflict do nothing
  `.execute(db);

  await sql`
    insert into community_moderation_audit_log (
      id, community_id, actor_user_id, target_kind, target_id, action,
      previous_state, new_state, reason, created_at
    ) values (
      ${COMMUNITY_AUDIT_ID}::uuid,
      ${COMMUNITY_ID}::uuid,
      ${REQUESTER_USER_ID}::uuid,
      'contribution',
      ${COMMUNITY_CONTRIBUTION_ID}::uuid,
      'remove_contribution',
      'active',
      'removed',
      'spam',
      ${now}
    )
    on conflict do nothing
  `.execute(db);

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
    .insertInto("erasure_requests")
    .values({
      id: REQUEST_ID,
      requester_user_id: REQUESTER_USER_ID,
      request_scope: "account_data_erasure",
      status: "reviewing",
      submitted_at: now,
      intake_disclosure_version: "erasure-request-mvp-v1",
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db
    .insertInto("job_queue")
    .values([
      {
        queue_name: "matching",
        payload: {
          kind: "journal_entry_index",
          journalEntryId: PUBLIC_ENTRY_ID,
          userId: REQUESTER_USER_ID,
        },
        status: "pending",
        idempotency_key: "journal_entry_index:ove-192-smoke",
        created_at: now,
        updated_at: now,
      },
      {
        queue_name: "matching",
        payload: {
          kind: "journal_entry_index",
          journalEntryId: SECOND_PUBLIC_ENTRY_ID,
          userId: REQUESTER_USER_ID,
        },
        status: "done",
        idempotency_key: "journal_entry_index:ove-192-smoke-done",
        created_at: now,
        updated_at: now,
      },
    ])
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
        eb(sql`payload->>'requestId'`, "=", REQUEST_ID),
        eb("idempotency_key", "like", "%ove-192%"),
        eb("idempotency_key", "like", "%ove-97%"),
      ]),
    )
    .execute();
  await sql`
    delete from community_moderation_audit_log where id = ${COMMUNITY_AUDIT_ID}::uuid
  `.execute(db);
  await sql`
    delete from community_contribution_reports where id = ${COMMUNITY_REPORT_ID}::uuid
  `.execute(db);
  await sql`
    delete from community_contributions where id = ${COMMUNITY_CONTRIBUTION_ID}::uuid
  `.execute(db);
  await sql`
    delete from communities where id = ${COMMUNITY_ID}::uuid
  `.execute(db);
  await sql`
    delete from journal_topics where id = ${COMMUNITY_TOPIC_ID}::uuid
  `.execute(db);
  await db
    .updateTable("journal_entries")
    .set({ cover_media_asset_id: null })
    .where("owner_user_id", "in", [REQUESTER_USER_ID, ERASED_SUBJECT_USER_ID])
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
  await db.deleteFrom("user").where("id", "=", CONTRIBUTOR_USER_ID).execute();
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
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        request: "OVE-215",
        error: "erasure_smoke_failed",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
