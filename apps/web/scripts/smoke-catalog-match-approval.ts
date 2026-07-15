import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import type { Kysely } from "kysely";
import { Client } from "pg";

import type { Database, JsonValue } from "../src/db/schema";
import type {
  approveCatalogMatchSuggestion as approveSuggestionFn,
  buildCatalogMatchFingerprint as buildFingerprintFn,
  rejectCatalogMatchSuggestion as rejectSuggestionFn,
} from "../src/server/catalog-curation-repository";
import type { createUserAddedCatalogCandidate as createCandidateFn } from "../src/server/catalog-repository";

type DB = Kysely<Database>;

let db: DB;
let approveCatalogMatchSuggestion: typeof approveSuggestionFn;
let buildCatalogMatchFingerprint: typeof buildFingerprintFn;
let rejectCatalogMatchSuggestion: typeof rejectSuggestionFn;
let createUserAddedCatalogCandidate: typeof createCandidateFn;
let isolatedSmokeDatabase: { adminUrl: string; databaseName: string } | null =
  null;

const OWNER_USER_ID = "15900000-0000-4000-8000-000000000001";
const OPERATOR_USER_ID = "15900000-0000-4000-8000-000000000002";
const REINDEX_IDEMPOTENCY_KEY = "catalog-typeahead-reindex";

const REJECT = fixtureIds("15910000");
const APPROVE = fixtureIds("15920000");
const STALE = fixtureIds("15930000");
const RACE = fixtureIds("15950000");
const ALTERNATE_TARGET_ID = "15920000-0000-4000-8000-000000000008";
const ALTERNATE_SUGGESTION_ID = "15920000-0000-4000-8000-000000000009";
const ALTERNATE_TARGET_NAME_ID = "15920000-0000-4000-8000-000000000010";
const LEGACY_NO_MATCH_SUGGESTION_ID = "15910000-0000-4000-8000-000000000011";

const SNAPSHOT_AT = new Date("2026-07-15T08:00:00.000Z");
const STALE_SOURCE_AT = new Date("2026-07-15T08:05:00.000Z");

interface FixtureIds {
  sourceId: string;
  targetId: string;
  spaceId: string;
  objectId: string;
  entryId: string;
  suggestionId: string;
  targetNameId: string;
}

interface ReindexSnapshot {
  exists: boolean;
  id: string | null;
  queueName: string | null;
  payload: JsonValue | null;
  status: string | null;
  availableAt: Date | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  rerunRequested: boolean | null;
  attempts: number | null;
  lastError: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

async function main() {
  loadEnv({ path: ".env.local", override: false });

  const mode = process.argv[2];
  const configuredDatabaseUrl =
    process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  const localDatabaseUrl = requireLoopbackPostgresUrl(configuredDatabaseUrl);

  if (!mode) {
    isolatedSmokeDatabase = await createIsolatedSmokeDatabase(localDatabaseUrl);
    const isolatedUrl = databaseUrlForName(
      localDatabaseUrl,
      isolatedSmokeDatabase.databaseName,
    );
    process.env.DATABASE_URL = isolatedUrl;
    process.env.DIRECT_URL = isolatedUrl;
    await bootstrapIsolatedSmokeDatabase(isolatedUrl);
  }

  ({ db } = await import("../src/db"));
  ({
    approveCatalogMatchSuggestion,
    buildCatalogMatchFingerprint,
    rejectCatalogMatchSuggestion,
  } = await import("../src/server/catalog-curation-repository"));
  ({ createUserAddedCatalogCandidate } =
    await import("../src/server/catalog-repository"));

  if (mode === "--seed-ui") {
    await seedCurationUiFixtures();
    return;
  }
  if (mode === "--reset-ui") {
    await cleanupSmokeRows();
    console.log(
      JSON.stringify(
        {
          ok: true,
          issue: "OVE-159",
          curationUiFixturesReset: true,
          productionDataTouched: false,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (mode) throw new Error(`Unsupported smoke mode: ${mode}`);

  await cleanupSmokeRows();

  try {
    await prepareCompletedReindexJob();
    const completedReindexSnapshot = await readReindexSnapshot();
    await seedSmokeRows();
    await seedLegacyWorkerCompatibilityRow();
    await verifyLegacyWorkerCompatibilityRow();
    await verifyRejectionLeavesProductStateUntouched(completedReindexSnapshot);
    await verifyStaleSuggestionCannotMutateProductState(
      completedReindexSnapshot,
    );
    await verifyApprovalMergesIdentityAndKeepsJournalHistory();
    await verifyConcurrentObjectCreationIsSerialized();

    console.log(
      JSON.stringify(
        {
          ok: true,
          issue: "OVE-159",
          rejectionIsSuggestionOnly: true,
          staleSuggestionCannotApprove: true,
          approvalIsAtomic: true,
          journalHistoryStable: true,
          auditMetadataRecorded: true,
          completedReindexJobRequeuedOnlyForApproval: true,
          concurrentObjectCreationSerialized: true,
          legacyWorkerRowsAcceptedFailClosed: true,
          productionDataTouched: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupSmokeRows();
  }
}

async function seedCurationUiFixtures() {
  await cleanupSmokeRows();
  await seedSmokeRows();
  await rejectCatalogMatchSuggestion(
    { userId: OPERATOR_USER_ID, sessionId: "ove-159-ui-fixture" },
    {
      suggestionId: REJECT.suggestionId,
      reasonCode: "not_same_entity",
    },
  );
  await db
    .updateTable("catalog_match_suggestions")
    .set({ status: "stale", updated_at: new Date() })
    .where("id", "=", STALE.suggestionId)
    .where("status", "=", "pending")
    .execute();

  console.log(
    JSON.stringify(
      {
        ok: true,
        issue: "OVE-159",
        curationUiFixturesSeeded: true,
        states: ["pending", "rejected", "not_evaluated"],
        productionDataTouched: false,
      },
      null,
      2,
    ),
  );
}

async function verifyRejectionLeavesProductStateUntouched(
  reindexSnapshot: ReindexSnapshot,
) {
  const beforeJournal = await readJournalSnapshot(REJECT.entryId);
  const result = await rejectCatalogMatchSuggestion(
    { userId: OPERATOR_USER_ID, sessionId: "ove-159-smoke-reject" },
    {
      suggestionId: REJECT.suggestionId,
      reasonCode: "not_same_entity",
    },
  );

  assertEqual(result.outcome, "rejected", "rejection outcome");
  assertEqual(result.affectedObjectCount, 0, "rejection affected objects");
  assertEqual(result.publicEntryPaths.length, 0, "rejection public paths");

  const suggestion = await readSuggestion(REJECT.suggestionId);
  assertEqual(suggestion.status, "rejected", "rejection status");
  assertEqual(
    suggestion.reviewedByUserId,
    OPERATOR_USER_ID,
    "rejection reviewer",
  );
  assertEqual(
    suggestion.decisionReasonCode,
    "not_same_entity",
    "rejection reason",
  );
  assertEqual(
    suggestion.decisionResult,
    "suggestion_rejected",
    "rejection result",
  );
  assertEqual(
    suggestion.decisionAffectedObjectCount,
    0,
    "rejection decision object count",
  );
  assert(suggestion.reviewedAt, "rejection review timestamp missing");

  await assertCandidateAndObjectState(REJECT, {
    candidateStatus: "provisional",
    objectCatalogItemId: REJECT.sourceId,
    varietyState: "user_added",
    varietyText: "OVE-159 rejected provisional name",
  });
  assertDeepEqual(
    await readJournalSnapshot(REJECT.entryId),
    beforeJournal,
    "journal changed after suggestion rejection",
  );
  await assertReindexUnchanged(reindexSnapshot, "rejection");
}

async function verifyStaleSuggestionCannotMutateProductState(
  reindexSnapshot: ReindexSnapshot,
) {
  await db
    .updateTable("catalog_item_names")
    .set({
      display_name: "OVE-159 stale alias changed after scoring",
      normalized_name: "ove-159 stale alias changed after scoring",
    })
    .where("id", "=", STALE.targetNameId)
    .execute();
  const beforeJournal = await readJournalSnapshot(STALE.entryId);
  const result = await approveCatalogMatchSuggestion(
    { userId: OPERATOR_USER_ID, sessionId: "ove-159-smoke-stale" },
    { suggestionId: STALE.suggestionId },
  );

  assertEqual(result.outcome, "stale", "stale approval outcome");
  assertEqual(result.affectedObjectCount, 0, "stale affected objects");
  assertEqual(result.publicEntryPaths.length, 0, "stale public paths");

  const suggestion = await readSuggestion(STALE.suggestionId);
  assertEqual(suggestion.status, "stale", "stale suggestion status");
  assertEqual(suggestion.reviewedAt, null, "stale review timestamp");
  assertEqual(suggestion.reviewedByUserId, null, "stale reviewer");
  assertEqual(suggestion.decisionResult, null, "stale decision result");

  await assertCandidateAndObjectState(STALE, {
    candidateStatus: "provisional",
    objectCatalogItemId: STALE.sourceId,
    varietyState: "user_added",
    varietyText: "OVE-159 stale provisional name",
  });
  assertDeepEqual(
    await readJournalSnapshot(STALE.entryId),
    beforeJournal,
    "journal changed after stale approval attempt",
  );
  await assertReindexUnchanged(reindexSnapshot, "stale approval");
}

async function verifyApprovalMergesIdentityAndKeepsJournalHistory() {
  const beforeJournal = await readJournalSnapshot(APPROVE.entryId);
  const beforeReindex = await readReindexSnapshot();
  const result = await approveCatalogMatchSuggestion(
    { userId: OPERATOR_USER_ID, sessionId: "ove-159-smoke-approve" },
    { suggestionId: APPROVE.suggestionId },
  );

  assertEqual(result.outcome, "approved", "approval outcome");
  assertEqual(result.affectedObjectCount, 1, "approval affected objects");
  assertEqual(
    result.targetPublicSlug,
    "ove-159-approved-target",
    "approval target slug",
  );
  assertDeepEqual(
    result.publicEntryPaths,
    ["/journal/ove-159-approved-entry"],
    "approval public journal paths",
  );

  const suggestion = await readSuggestion(APPROVE.suggestionId);
  assertEqual(suggestion.status, "approved", "approval status");
  assertEqual(
    suggestion.reviewedByUserId,
    OPERATOR_USER_ID,
    "approval reviewer",
  );
  assertEqual(
    suggestion.decisionReasonCode,
    "approved_canonical_match",
    "approval reason",
  );
  assertEqual(suggestion.decisionResult, "catalog_merged", "approval result");
  assertEqual(
    suggestion.decisionAffectedObjectCount,
    1,
    "approval decision object count",
  );
  assert(suggestion.reviewedAt, "approval review timestamp missing");

  await assertCandidateAndObjectState(APPROVE, {
    candidateStatus: "merged",
    objectCatalogItemId: APPROVE.targetId,
    varietyState: "selected",
    varietyText: "OVE-159 approved canonical target",
    mergedIntoCatalogItemId: APPROVE.targetId,
    reviewedByUserId: OPERATOR_USER_ID,
  });
  assertDeepEqual(
    await readJournalSnapshot(APPROVE.entryId),
    beforeJournal,
    "journal changed after canonical match approval",
  );

  const alternate = await readSuggestion(ALTERNATE_SUGGESTION_ID);
  assertEqual(alternate.status, "stale", "alternate suggestion status");

  const afterReindex = await readReindexSnapshot();
  assert(afterReindex.exists, "approval did not queue catalog reindex");
  assertEqual(beforeReindex.status, "done", "pre-approval reindex status");
  assertEqual(afterReindex.status, "pending", "approval reindex status");
  assertEqual(afterReindex.lockedAt, null, "approval reindex locked_at");
  assertEqual(afterReindex.lockedBy, null, "approval reindex locked_by");
  assertEqual(
    afterReindex.rerunRequested,
    false,
    "approval reindex rerun_requested",
  );
  assertEqual(afterReindex.lastError, null, "approval reindex last_error");
  assert(
    beforeReindex.updatedAt !== null &&
      afterReindex.updatedAt !== null &&
      afterReindex.updatedAt.getTime() >= beforeReindex.updatedAt.getTime(),
    "approval did not refresh catalog reindex job",
  );
}

async function verifyConcurrentObjectCreationIsSerialized() {
  let releaseCreator = () => {};
  let reportCandidateLock = () => {};
  const creatorReleased = new Promise<void>((resolve) => {
    releaseCreator = resolve;
  });
  const candidateLocked = new Promise<void>((resolve) => {
    reportCandidateLock = resolve;
  });

  const creatorTransaction = db.transaction().execute(async (trx) => {
    const candidate = await createUserAddedCatalogCandidate(
      trx,
      { userId: OWNER_USER_ID, sessionId: "ove-159-concurrent-create" },
      {
        displayName: "OVE 159 concurrent provisional name",
        objectKind: "plant",
      },
    );
    assertEqual(candidate.id, RACE.sourceId, "concurrent candidate identity");
    reportCandidateLock();
    await creatorReleased;

    await trx
      .insertInto("plant_objects")
      .values({
        id: RACE.objectId,
        owner_user_id: OWNER_USER_ID,
        space_id: RACE.spaceId,
        display_name: "OVE-159 concurrent smoke object",
        object_kind: "plant",
        catalog_item_id: candidate.id,
        variety_text: candidate.displayName,
        variety_state: "user_added",
        location_visibility: "hidden",
        coarse_region_code: null,
        created_at: SNAPSHOT_AT,
        updated_at: SNAPSHOT_AT,
      })
      .execute();
  });

  await candidateLocked;
  let approvalFinished = false;
  const approval = approveCatalogMatchSuggestion(
    { userId: OPERATOR_USER_ID, sessionId: "ove-159-concurrent-approve" },
    { suggestionId: RACE.suggestionId },
  ).finally(() => {
    approvalFinished = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 100));
  assert(
    !approvalFinished,
    "approval escaped the user-added candidate row lock",
  );

  releaseCreator();
  await creatorTransaction;
  const result = await approval;
  assertEqual(result.outcome, "approved", "concurrent approval outcome");
  assertEqual(
    result.affectedObjectCount,
    1,
    "concurrent approval affected objects",
  );

  await assertCandidateAndObjectState(RACE, {
    candidateStatus: "merged",
    objectCatalogItemId: RACE.targetId,
    varietyState: "selected",
    varietyText: "OVE-159 concurrent canonical target",
    mergedIntoCatalogItemId: RACE.targetId,
    reviewedByUserId: OPERATOR_USER_ID,
  });
}

async function seedSmokeRows() {
  await db
    .insertInto("spaces")
    .values(
      [REJECT, APPROVE, STALE, RACE].map((fixture, index) => ({
        id: fixture.spaceId,
        owner_user_id: OWNER_USER_ID,
        display_name: `OVE-159 smoke space ${index + 1}`,
        location_visibility: "hidden" as const,
        coarse_region_code: null,
        created_at: SNAPSHOT_AT,
        updated_at: SNAPSHOT_AT,
      })),
    )
    .execute();

  await db
    .insertInto("catalog_items")
    .values([
      sourceCatalogRow(REJECT, "OVE-159 rejected provisional name"),
      targetCatalogRow(REJECT, "OVE-159 rejected canonical target"),
      sourceCatalogRow(APPROVE, "OVE-159 approved provisional name"),
      targetCatalogRow(
        APPROVE,
        "OVE-159 approved canonical target",
        "ove-159-approved-target",
        "uk",
      ),
      {
        id: ALTERNATE_TARGET_ID,
        canonical_name: "OVE-159 alternate canonical target",
        normalized_name: "ove-159 alternate canonical target",
        public_slug: "ove-159-alternate-target",
        catalog_kind: "plant_variety" as const,
        status: "seeded" as const,
        source: "internal_seed",
        source_id: "ove-159-alternate-target",
        created_by_user_id: null,
        locale: "en",
        created_at: SNAPSHOT_AT,
        updated_at: SNAPSHOT_AT,
      },
      sourceCatalogRow(
        STALE,
        "OVE-159 stale provisional name",
        STALE_SOURCE_AT,
      ),
      targetCatalogRow(STALE, "OVE-159 stale canonical target"),
      sourceCatalogRow(
        RACE,
        "OVE 159 concurrent provisional name",
        SNAPSHOT_AT,
        "und",
      ),
      targetCatalogRow(RACE, "OVE-159 concurrent canonical target"),
    ])
    .execute();

  await db
    .insertInto("catalog_item_names")
    .values([
      targetNameRow(REJECT, "OVE-159 rejected canonical target"),
      targetNameRow(APPROVE, "OVE-159 approved canonical target"),
      targetNameRow(STALE, "OVE-159 stale canonical target"),
      targetNameRow(RACE, "OVE-159 concurrent canonical target"),
      {
        id: ALTERNATE_TARGET_NAME_ID,
        catalog_item_id: ALTERNATE_TARGET_ID,
        display_name: "OVE-159 alternate canonical target",
        normalized_name: "ove-159 alternate canonical target",
        locale: "en",
        is_primary: true,
        created_at: SNAPSHOT_AT,
      },
    ])
    .execute();

  await db
    .insertInto("plant_objects")
    .values([
      plantObjectRow(REJECT, "OVE-159 rejected provisional name"),
      plantObjectRow(APPROVE, "OVE-159 approved provisional name"),
      plantObjectRow(STALE, "OVE-159 stale provisional name"),
    ])
    .execute();

  await db
    .insertInto("journal_entries")
    .values([
      journalEntryRow(REJECT, "ove-159-rejected-entry"),
      journalEntryRow(APPROVE, "ove-159-approved-entry"),
      journalEntryRow(STALE, "ove-159-stale-entry"),
    ])
    .execute();

  await db
    .insertInto("catalog_match_suggestions")
    .values([
      suggestionRow(REJECT),
      suggestionRow(APPROVE),
      suggestionRow(STALE),
      suggestionRow(
        {
          ...APPROVE,
          targetId: ALTERNATE_TARGET_ID,
          suggestionId: ALTERNATE_SUGGESTION_ID,
        },
        "OVE-159 alternate canonical target",
      ),
      suggestionRow(RACE, "OVE-159 concurrent canonical target", {
        sourceCanonicalName: "OVE 159 concurrent provisional name",
        sourceLocale: "und",
      }),
    ])
    .execute();
}

async function seedLegacyWorkerCompatibilityRow() {
  const evidence = {
    schemaVersion: "ove158.catalogMatchEvidence.v2",
    score: 0,
    confidenceBucket: "none",
    matchType: "no_safe_match",
    normalizedInput: "ove 159 legacy compatibility",
    candidateDisplayName: null,
    candidateCanonicalName: null,
    sourceLocale: "en",
    targetLocale: null,
    sourceScript: "latin",
    targetScript: null,
    catalogKind: "plant_variety",
    affectedObjectCount: 1,
    reasonCodes: ["no_selectable_candidates"],
    thresholds: { high: 95, medium: 85, low: 70 },
  } satisfies JsonValue;

  await db
    .insertInto("catalog_match_suggestions")
    .values({
      id: LEGACY_NO_MATCH_SUGGESTION_ID,
      source_catalog_item_id: REJECT.sourceId,
      target_catalog_item_id: null,
      candidate_key: "no-safe-match",
      target_canonical_name: null,
      suggestion_kind: "canonical_match",
      match_type: "no_safe_match",
      score: 0,
      confidence_bucket: "none",
      status: "pending",
      reason_codes: ["no_selectable_candidates"],
      normalized_input: "ove 159 legacy compatibility",
      matched_name: null,
      source_locale: "en",
      target_locale: null,
      source_script: "latin",
      target_script: null,
      catalog_kind: "plant_variety",
      affected_object_count: 1,
      safe_evidence: evidence,
      matcher_version: "ove158-v2",
      generated_at: SNAPSHOT_AT,
      created_at: SNAPSHOT_AT,
      updated_at: SNAPSHOT_AT,
    })
    .execute();
}

async function verifyLegacyWorkerCompatibilityRow() {
  const row = await db
    .selectFrom("catalog_match_suggestions")
    .select([
      "status",
      "source_updated_at_snapshot as sourceUpdatedAtSnapshot",
      "source_matching_fingerprint as sourceMatchingFingerprint",
      "target_catalog_item_name_id as targetCatalogItemNameId",
    ])
    .where("id", "=", LEGACY_NO_MATCH_SUGGESTION_ID)
    .executeTakeFirstOrThrow();

  assertEqual(row.status, "pending", "legacy compatibility status");
  assertEqual(
    row.sourceUpdatedAtSnapshot,
    null,
    "legacy compatibility source snapshot",
  );
  assertEqual(
    row.sourceMatchingFingerprint,
    null,
    "legacy compatibility source fingerprint",
  );
  assertEqual(
    row.targetCatalogItemNameId,
    null,
    "legacy compatibility target alias",
  );
}

function sourceCatalogRow(
  fixture: FixtureIds,
  canonicalName: string,
  updatedAt = SNAPSHOT_AT,
  locale = "en",
) {
  return {
    id: fixture.sourceId,
    canonical_name: canonicalName,
    normalized_name: canonicalName.toLocaleLowerCase("en"),
    catalog_kind: "plant_variety" as const,
    status: "provisional" as const,
    source: "user_added",
    source_id: `ove-159-source-${fixture.sourceId.slice(0, 8)}`,
    created_by_user_id: OWNER_USER_ID,
    locale,
    created_at: SNAPSHOT_AT,
    updated_at: updatedAt,
  };
}

function targetCatalogRow(
  fixture: FixtureIds,
  canonicalName: string,
  publicSlug: string | null = null,
  locale = "en",
) {
  return {
    id: fixture.targetId,
    canonical_name: canonicalName,
    normalized_name: canonicalName.toLocaleLowerCase("en"),
    public_slug: publicSlug,
    catalog_kind: "plant_variety" as const,
    status: "seeded" as const,
    source: "internal_seed",
    source_id: `ove-159-target-${fixture.targetId.slice(0, 8)}`,
    created_by_user_id: null,
    locale,
    created_at: SNAPSHOT_AT,
    updated_at: SNAPSHOT_AT,
  };
}

function plantObjectRow(fixture: FixtureIds, varietyText: string) {
  return {
    id: fixture.objectId,
    owner_user_id: OWNER_USER_ID,
    space_id: fixture.spaceId,
    display_name: `OVE-159 smoke object ${fixture.objectId.slice(0, 8)}`,
    object_kind: "plant" as const,
    catalog_item_id: fixture.sourceId,
    variety_text: varietyText,
    variety_state: "user_added" as const,
    location_visibility: "hidden" as const,
    coarse_region_code: null,
    created_at: SNAPSHOT_AT,
    updated_at: SNAPSHOT_AT,
  };
}

function targetNameRow(fixture: FixtureIds, displayName: string) {
  return {
    id: fixture.targetNameId,
    catalog_item_id: fixture.targetId,
    display_name: displayName,
    normalized_name: displayName.toLocaleLowerCase("en"),
    locale: "en",
    is_primary: true,
    created_at: SNAPSHOT_AT,
  };
}

function journalEntryRow(fixture: FixtureIds, publicSlug: string) {
  return {
    id: fixture.entryId,
    owner_user_id: OWNER_USER_ID,
    space_id: fixture.spaceId,
    plant_object_id: fixture.objectId,
    title: `OVE-159 stable journal ${fixture.entryId.slice(0, 8)}`,
    body: "OVE-159 smoke-only journal body without personal information.",
    entry_scope: "object" as const,
    entry_date: "2026-07-15",
    visibility: "public" as const,
    lifecycle_state: "active" as const,
    public_slug: publicSlug,
    public_noindex: true,
    published_at: SNAPSHOT_AT,
    client_mutation_id: `ove-159-smoke-${fixture.entryId}`,
    created_at: SNAPSHOT_AT,
    updated_at: SNAPSHOT_AT,
  };
}

function suggestionRow(
  fixture: FixtureIds,
  targetCanonicalName = targetNameFor(fixture),
  options: { sourceCanonicalName?: string; sourceLocale?: string } = {},
) {
  const targetNameId =
    fixture.targetId === ALTERNATE_TARGET_ID
      ? ALTERNATE_TARGET_NAME_ID
      : fixture.targetNameId;
  const sourceCanonicalName =
    options.sourceCanonicalName ?? sourceNameFor(fixture);
  const sourceLocale = options.sourceLocale ?? "en";
  const sourceNormalizedName = sourceCanonicalName.toLocaleLowerCase("en");
  const targetNormalizedName = targetCanonicalName.toLocaleLowerCase("en");
  const evidence = {
    schemaVersion: "ove158.catalogMatchEvidence.v2",
    score: 98,
    confidenceBucket: "high",
    matchType: "normalized_exact",
    normalizedInput: "ove 159 normalized input",
    candidateDisplayName: targetCanonicalName,
    candidateCanonicalName: targetCanonicalName,
    sourceLocale,
    targetLocale: "en",
    sourceScript: "latin",
    targetScript: "latin",
    catalogKind: "plant_variety",
    affectedObjectCount: 1,
    reasonCodes: ["normalized_exact", "same_catalog_kind"],
    thresholds: { high: 95, medium: 85, low: 70 },
  } satisfies JsonValue;

  return {
    id: fixture.suggestionId,
    source_catalog_item_id: fixture.sourceId,
    target_catalog_item_id: fixture.targetId,
    target_catalog_item_name_id: targetNameId,
    candidate_key: fixture.targetId,
    target_canonical_name: targetCanonicalName,
    source_updated_at_snapshot: SNAPSHOT_AT,
    target_updated_at_snapshot: SNAPSHOT_AT,
    source_matching_fingerprint: buildCatalogMatchFingerprint([
      sourceCanonicalName,
      sourceNormalizedName,
      sourceLocale,
      "plant_variety",
    ]),
    target_matching_fingerprint: buildCatalogMatchFingerprint([
      fixture.targetId,
      targetCanonicalName,
      "plant_variety",
      targetNameId,
      targetCanonicalName,
      targetNormalizedName,
      "en",
    ]),
    suggestion_kind: "canonical_match" as const,
    match_type: "normalized_exact" as const,
    score: 98,
    confidence_bucket: "high" as const,
    status: "pending" as const,
    reason_codes: ["normalized_exact", "same_catalog_kind"],
    normalized_input: "ove 159 normalized input",
    matched_name: targetCanonicalName,
    source_locale: sourceLocale,
    target_locale: "en",
    source_script: "latin" as const,
    target_script: "latin" as const,
    catalog_kind: "plant_variety" as const,
    affected_object_count: 1,
    safe_evidence: evidence,
    matcher_version: "ove159-v3",
    generated_at: SNAPSHOT_AT,
    created_at: SNAPSHOT_AT,
    updated_at: SNAPSHOT_AT,
  };
}

function targetNameFor(fixture: FixtureIds) {
  if (fixture.targetId === REJECT.targetId) {
    return "OVE-159 rejected canonical target";
  }
  if (fixture.targetId === STALE.targetId) {
    return "OVE-159 stale canonical target";
  }
  return "OVE-159 approved canonical target";
}

function sourceNameFor(fixture: FixtureIds) {
  if (fixture.sourceId === REJECT.sourceId) {
    return "OVE-159 rejected provisional name";
  }
  if (fixture.sourceId === STALE.sourceId) {
    return "OVE-159 stale provisional name";
  }
  if (fixture.sourceId === RACE.sourceId) {
    return "OVE 159 concurrent provisional name";
  }
  return "OVE-159 approved provisional name";
}

async function assertCandidateAndObjectState(
  fixture: FixtureIds,
  expected: {
    candidateStatus: string;
    objectCatalogItemId: string;
    varietyState: string;
    varietyText: string;
    mergedIntoCatalogItemId?: string | null;
    reviewedByUserId?: string | null;
  },
) {
  const candidate = await db
    .selectFrom("catalog_items")
    .select([
      "status",
      "merged_into_catalog_item_id as mergedIntoCatalogItemId",
      "reviewed_by_user_id as reviewedByUserId",
    ])
    .where("id", "=", fixture.sourceId)
    .executeTakeFirstOrThrow();
  const object = await db
    .selectFrom("plant_objects")
    .select([
      "catalog_item_id as catalogItemId",
      "variety_state as varietyState",
      "variety_text as varietyText",
    ])
    .where("id", "=", fixture.objectId)
    .executeTakeFirstOrThrow();

  assertEqual(candidate.status, expected.candidateStatus, "candidate status");
  assertEqual(
    candidate.mergedIntoCatalogItemId,
    expected.mergedIntoCatalogItemId ?? null,
    "candidate merge target",
  );
  assertEqual(
    candidate.reviewedByUserId,
    expected.reviewedByUserId ?? null,
    "candidate reviewer",
  );
  assertEqual(
    object.catalogItemId,
    expected.objectCatalogItemId,
    "object catalog identity",
  );
  assertEqual(
    object.varietyState,
    expected.varietyState,
    "object variety state",
  );
  assertEqual(object.varietyText, expected.varietyText, "object variety text");
}

function readJournalSnapshot(entryId: string) {
  return db
    .selectFrom("journal_entries")
    .select([
      "id",
      "owner_user_id as ownerUserId",
      "space_id as spaceId",
      "plant_object_id as plantObjectId",
      "title",
      "body",
      "entry_scope as entryScope",
      "entry_date as entryDate",
      "visibility",
      "lifecycle_state as lifecycleState",
      "public_slug as publicSlug",
      "created_at as createdAt",
      "updated_at as updatedAt",
    ])
    .where("id", "=", entryId)
    .executeTakeFirstOrThrow();
}

function readSuggestion(suggestionId: string) {
  return db
    .selectFrom("catalog_match_suggestions")
    .select([
      "status",
      "reviewed_at as reviewedAt",
      "reviewed_by_user_id as reviewedByUserId",
      "decision_reason_code as decisionReasonCode",
      "decision_result as decisionResult",
      "decision_affected_object_count as decisionAffectedObjectCount",
    ])
    .where("id", "=", suggestionId)
    .executeTakeFirstOrThrow();
}

async function readReindexSnapshot(): Promise<ReindexSnapshot> {
  const row = await db
    .selectFrom("job_queue")
    .select([
      "id",
      "queue_name as queueName",
      "payload",
      "status",
      "available_at as availableAt",
      "locked_at as lockedAt",
      "locked_by as lockedBy",
      "rerun_requested as rerunRequested",
      "attempts",
      "last_error as lastError",
      "created_at as createdAt",
      "updated_at as updatedAt",
    ])
    .where("idempotency_key", "=", REINDEX_IDEMPOTENCY_KEY)
    .executeTakeFirst();

  return row
    ? { exists: true, ...row }
    : {
        exists: false,
        id: null,
        queueName: null,
        payload: null,
        status: null,
        availableAt: null,
        lockedAt: null,
        lockedBy: null,
        rerunRequested: null,
        attempts: null,
        lastError: null,
        createdAt: null,
        updatedAt: null,
      };
}

async function assertReindexUnchanged(
  expected: ReindexSnapshot,
  behavior: string,
) {
  const actual = await readReindexSnapshot();
  assertDeepEqual(actual, expected, `${behavior} changed catalog reindex job`);
}

async function prepareCompletedReindexJob() {
  const now = new Date("2020-01-01T00:00:00.000Z");

  await db
    .insertInto("job_queue")
    .values({
      queue_name: "matching",
      payload: { kind: "catalog_typeahead_reindex" },
      status: "done",
      idempotency_key: REINDEX_IDEMPOTENCY_KEY,
      available_at: now,
      locked_at: null,
      locked_by: null,
      rerun_requested: false,
      attempts: 1,
      last_error: null,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc
        .column("idempotency_key")
        .where("idempotency_key", "is not", null)
        .doUpdateSet({
          queue_name: "matching",
          payload: { kind: "catalog_typeahead_reindex" },
          status: "done",
          available_at: now,
          locked_at: null,
          locked_by: null,
          rerun_requested: false,
          attempts: 1,
          last_error: null,
          updated_at: now,
        }),
    )
    .execute();
}

function requireLoopbackPostgresUrl(value: string | undefined) {
  if (!value?.trim()) {
    throw new Error(
      "DATABASE_URL or DIRECT_URL is required for OVE-159 smoke.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OVE-159 smoke requires a valid Postgres URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("OVE-159 smoke requires the Postgres protocol.");
  }

  const loopbackHosts = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
  ]);
  if (!loopbackHosts.has(url.hostname.toLowerCase())) {
    throw new Error(
      "OVE-159 smoke refuses non-loopback databases before any write.",
    );
  }

  if (!decodeURIComponent(url.pathname.replace(/^\//, ""))) {
    throw new Error("OVE-159 smoke requires a named local database.");
  }

  return url.toString();
}

async function createIsolatedSmokeDatabase(adminUrl: string) {
  const databaseName = `overgarden_ove159_${process.pid}_${Date.now()}`;
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`create database "${databaseName}"`);
  } finally {
    await client.end();
  }
  return { adminUrl, databaseName };
}

async function bootstrapIsolatedSmokeDatabase(databaseUrl: string) {
  const schema = await readFile(
    new URL("../sql/0001_walking_skeleton.sql", import.meta.url),
    "utf8",
  );
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(schema);
  } finally {
    await client.end();
  }
}

function databaseUrlForName(databaseUrl: string, databaseName: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function dropIsolatedSmokeDatabase(
  isolated: { adminUrl: string; databaseName: string } | null,
) {
  if (!isolated) return;

  const client = new Client({ connectionString: isolated.adminUrl });
  await client.connect();
  try {
    await client.query(
      `select pg_terminate_backend(pid)
       from pg_stat_activity
       where datname = $1 and pid <> pg_backend_pid()`,
      [isolated.databaseName],
    );
    await client.query(`drop database if exists "${isolated.databaseName}"`);
  } finally {
    await client.end();
  }
}

async function cleanupSmokeRows() {
  await db
    .deleteFrom("journal_entries")
    .where("id", "in", [REJECT.entryId, APPROVE.entryId, STALE.entryId])
    .execute();
  await db
    .deleteFrom("plant_objects")
    .where("id", "in", [
      REJECT.objectId,
      APPROVE.objectId,
      STALE.objectId,
      RACE.objectId,
    ])
    .execute();
  await db
    .deleteFrom("spaces")
    .where("id", "in", [
      REJECT.spaceId,
      APPROVE.spaceId,
      STALE.spaceId,
      RACE.spaceId,
    ])
    .execute();
  await db
    .deleteFrom("catalog_match_suggestions")
    .where("id", "in", [
      REJECT.suggestionId,
      APPROVE.suggestionId,
      STALE.suggestionId,
      ALTERNATE_SUGGESTION_ID,
      RACE.suggestionId,
      LEGACY_NO_MATCH_SUGGESTION_ID,
    ])
    .execute();
  await db
    .deleteFrom("catalog_items")
    .where("id", "in", [
      REJECT.sourceId,
      REJECT.targetId,
      APPROVE.sourceId,
      APPROVE.targetId,
      ALTERNATE_TARGET_ID,
      STALE.sourceId,
      STALE.targetId,
      RACE.sourceId,
      RACE.targetId,
    ])
    .execute();
}

function fixtureIds(prefix: string): FixtureIds {
  return {
    sourceId: `${prefix}-0000-4000-8000-000000000001`,
    targetId: `${prefix}-0000-4000-8000-000000000002`,
    spaceId: `${prefix}-0000-4000-8000-000000000003`,
    objectId: `${prefix}-0000-4000-8000-000000000004`,
    entryId: `${prefix}-0000-4000-8000-000000000005`,
    suggestionId: `${prefix}-0000-4000-8000-000000000006`,
    targetNameId: `${prefix}-0000-4000-8000-000000000007`,
  };
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

main()
  .finally(async () => {
    try {
      await db?.destroy();
    } finally {
      await dropIsolatedSmokeDatabase(isolatedSmokeDatabase);
    }
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
