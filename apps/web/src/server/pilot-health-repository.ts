import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  evaluatePublicVarietyIndexState,
  PUBLIC_VARIETY_INDEXABILITY_THRESHOLD,
} from "@/server/public-variety-indexing";
import { countPilotWriteEligibleGardeners } from "@/server/pilot-invite-repository";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";
import {
  CLOSED_PILOT_COHORT,
  FOUNDER_REHEARSAL_COHORT,
} from "@/lib/garden/pilot-invite";
import {
  DEFAULT_PILOT_SEGMENT,
  getPilotSegmentCoreBucket,
  getPilotSegmentDiagnosticBucket,
  getPilotSegmentLabel,
  normalizePilotSegment,
  type PilotSegment,
  type PilotSegmentCoreBucket,
  type PilotSegmentDiagnosticBucket,
} from "@/lib/pilot/segments";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const PILOT_HEALTH_WINDOWS = [
  { key: "last_7_days", label: "Last 7 days", days: 7 },
  { key: "last_30_days", label: "Last 30 days", days: 30 },
] as const;

export const PILOT_HEALTH_RESEARCH_REFERENCES = [
  {
    label: "Metrics tree",
    path: "docs/product-research/OverGarden_B2_METRICS_v0.md",
  },
  {
    label: "Kill criteria",
    path: "docs/product-research/KILL_CRITERIA_PREREG_v2.md",
  },
  {
    label: "Virality calibrators",
    path: "docs/product-research/VIRALITY_RESEARCH_FINAL.md",
  },
  {
    label: "SEO content architecture",
    path: "docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md",
  },
] as const;

export type PilotHealthWindowKey = (typeof PILOT_HEALTH_WINDOWS)[number]["key"];

export interface PilotHealthReadout {
  generatedAt: Date;
  windows: PilotHealthWindow[];
  publicVarietyIndexability: PilotPublicVarietyHealth;
  writeAccess: PilotWriteAccessHealth;
  notes: string[];
  references: typeof PILOT_HEALTH_RESEARCH_REFERENCES;
}

export interface PilotWriteAccessHealth {
  writeEligibleGardeners: number;
  founderRehearsalGardeners: number;
}

export interface PilotHealthWindow {
  key: PilotHealthWindowKey;
  label: string;
  since: Date;
  metrics: PilotHealthMetrics;
}

export interface PilotHealthMetrics {
  firstEntryActivations: number;
  totalEntries: number;
  activeGardeners: number;
  sameObjectFollowUpEntries: number;
  sameSessionRevisitFollowUps: number;
  entriesWithProcessedPhoto: number;
  photoUsageRate: number;
  offlineQueued: number;
  offlineSynced: number;
  offlineFailed: {
    count: null;
    observability: "client_only_not_server_observable";
  };
  publishedEntries: number;
  publishRate: number;
  archivedEntries: number;
  publicGoneEntries: number;
  activationStarts: {
    total: number;
    homepage: number;
    publicVariety: number;
    directGarden: number;
    invitedCohort: number;
  };
  entrySavesByActivationSource: {
    homepage: number;
    publicVariety: number;
    directGarden: number;
    invitedCohort: number;
  };
  publicVarietySaveRate: number;
  invitedCohort: PilotInvitedCohortMetrics;
  followUpValuePulse: PilotFollowUpValuePulseMetrics;
}

export interface PilotFollowUpValuePulseMetrics {
  responses: number;
  submitted: number;
  skipped: number;
  useful: number;
  notSure: number;
  notUseful: number;
  withReason: number;
  usefulRate: number;
}

export interface PilotInvitedCohortMetrics {
  starts: number;
  firstEntrySaves: number;
  sameObjectFollowUpEntries: number;
  returningGardeners: number;
  firstEntrySaveRate: number;
  segments: PilotSegmentCohortMetrics[];
}

export interface PilotSegmentCohortMetrics {
  segment: PilotSegment;
  label: string;
  coreBucket: PilotSegmentCoreBucket;
  diagnosticBucket: PilotSegmentDiagnosticBucket;
  writeEligibleGardeners: number;
  starts: number;
  firstEntrySaves: number;
  sameObjectFollowUpEntries: number;
  returningGardeners: number;
  firstEntrySaveRate: number;
  followUpRateAmongFirstSavers: number;
  isUnknownSegment: boolean;
  isLowSample: boolean;
}

export interface PilotPublicVarietyHealth {
  promotedIndexableCount: number;
  thinNoindexCount: number;
  demotedByArchiveOrGoneCount: number;
  currentPublicVarietyCount: number;
  threshold: typeof PUBLIC_VARIETY_INDEXABILITY_THRESHOLD;
}

interface PilotEntryMetricRow {
  activeGardeners: number | string | bigint | null;
  archivedEntries: number | string | bigint | null;
  entriesWithProcessedPhoto: number | string | bigint | null;
  firstEntryActivations: number | string | bigint | null;
  invitedCohortReturningGardeners: number | string | bigint | null;
  invitedCohortSameObjectFollowUpEntries: number | string | bigint | null;
  publicGoneEntries: number | string | bigint | null;
  publishedEntries: number | string | bigint | null;
  sameObjectFollowUpEntries: number | string | bigint | null;
  totalEntries: number | string | bigint | null;
}

interface PilotAnalyticsMetricRow {
  activationStartedDirectGarden: number | string | bigint | null;
  activationStartedHomepage: number | string | bigint | null;
  activationStartedInvitedCohort: number | string | bigint | null;
  activationStartedPublicVariety: number | string | bigint | null;
  entrySavedDirectGarden: number | string | bigint | null;
  entrySavedHomepage: number | string | bigint | null;
  entrySavedInvitedCohort: number | string | bigint | null;
  entrySavedPublicVariety: number | string | bigint | null;
  offlineQueued: number | string | bigint | null;
  offlineSynced: number | string | bigint | null;
  sameSessionRevisitFollowUps: number | string | bigint | null;
  valuePulseNotSure: number | string | bigint | null;
  valuePulseNotUseful: number | string | bigint | null;
  valuePulseResponses: number | string | bigint | null;
  valuePulseSkipped: number | string | bigint | null;
  valuePulseSubmitted: number | string | bigint | null;
  valuePulseUseful: number | string | bigint | null;
  valuePulseWithReason: number | string | bigint | null;
}

interface PilotSegmentMetricRow {
  firstEntrySaves: number | string | bigint | null;
  returningGardeners: number | string | bigint | null;
  sameObjectFollowUpEntries: number | string | bigint | null;
  segment: string | null;
  starts: number | string | bigint | null;
  writeEligibleGardeners: number | string | bigint | null;
}

interface PilotPublicVarietyRow {
  aggregateBodyLength: number | string | bigint | null;
  catalogSource: string;
  catalogStatus: string;
  entryCount: number | string | bigint | null;
  publicSlug: string;
}

interface ArchivedPublicVarietyRow {
  archivedOrGoneEntryCount: number | string | bigint | null;
  publicSlug: string;
}

export async function getPilotHealthReadout(
  executor: QueryExecutor = db,
  now = new Date(),
): Promise<PilotHealthReadout> {
  const windowDefinitions = PILOT_HEALTH_WINDOWS.map((window) => ({
    ...window,
    since: daysBefore(now, window.days),
  }));

  const [
    entryMetricRows,
    analyticsMetricRows,
    segmentMetricRows,
    publicVarietyRows,
    archivedPublicVarietyRows,
    writeEligibleGardeners,
    founderRehearsalGardeners,
  ] = await Promise.all([
    Promise.all(
      windowDefinitions.map((window) =>
        buildPilotEntryMetricsQuery(executor, window.since).executeTakeFirst(),
      ),
    ),
    Promise.all(
      windowDefinitions.map((window) =>
        buildPilotAnalyticsMetricsQuery(
          executor,
          window.since,
        ).executeTakeFirst(),
      ),
    ),
    Promise.all(
      windowDefinitions.map((window) =>
        buildPilotSegmentMetricsQuery(executor, window.since).execute(),
      ),
    ),
    buildPilotPublicVarietyHealthRowsQuery(executor).execute(),
    buildArchivedOrGonePublicVarietyRowsQuery(executor).execute(),
    countPilotWriteEligibleGardeners(executor, CLOSED_PILOT_COHORT),
    countPilotWriteEligibleGardeners(executor, FOUNDER_REHEARSAL_COHORT),
  ]);

  return {
    generatedAt: now,
    windows: windowDefinitions.map((window, index) =>
      buildPilotHealthWindow(
        window,
        normalizeEntryMetricRow(entryMetricRows[index]),
        normalizeAnalyticsMetricRow(analyticsMetricRows[index]),
        summarizePilotSegmentMetricRows(segmentMetricRows[index] ?? []),
      ),
    ),
    publicVarietyIndexability: summarizePublicVarietyHealthRows(
      publicVarietyRows,
      archivedPublicVarietyRows,
    ),
    writeAccess: {
      writeEligibleGardeners,
      founderRehearsalGardeners,
    },
    notes: [
      "All numbers are provisional pilot leading indicators, not validated OverGarden targets.",
      "Offline failed mutations are currently browser-local Dexie state and are not yet server-observable.",
      "H6 indexability shows thinness trajectory; it is not the same as organic acquisition or signup conversion.",
      "Invited-cohort counts are the closed-pilot H1 loop: invite start, first-entry save, and a same-object follow-up return. Cohort membership requires a closed_pilot grant plus the enum-only invited_cohort activation source, never names, emails, or invite links.",
      "Write-eligible gardeners are users with a durable closed_pilot pilot_invite_grants row. Founder rehearsal grants are counted separately and excluded from closed-pilot H1/OVE-53 decision metrics.",
      "Follow-up value pulse counts are bounded usefulness feedback after same-object follow-ups. Properties are enum-only; no journal text, email, IP, user agent, referrer, or raw URL values are stored.",
    ],
    references: PILOT_HEALTH_RESEARCH_REFERENCES,
  };
}

export async function getPilotHealthReadoutSafely(
  options: {
    reader?: () => Promise<PilotHealthReadout>;
    logger?: Pick<Console, "error">;
  } = {},
): Promise<PilotHealthReadout | null> {
  const reader = options.reader ?? (() => getPilotHealthReadout());
  const logger = options.logger ?? console;

  try {
    return await reader();
  } catch (error) {
    logger.error("Pilot health readout failed.", {
      error:
        error instanceof Error ? error.message : "Unknown pilot health error.",
    });
    return null;
  }
}

export function buildPilotEntryMetricsQuery(
  executor: QueryExecutor,
  since: Date,
) {
  return executor
    .selectFrom("journal_entries")
    .leftJoin("media_assets", (join) =>
      join
        .onRef("media_assets.journal_entry_id", "=", "journal_entries.id")
        .on("media_assets.status", "=", "processed")
        .on("media_assets.derivative_key", "is not", null),
    )
    .select([
      sql<number>`count(distinct ${sql.ref("journal_entries.id")})`.as(
        "totalEntries",
      ),
      sql<number>`count(distinct ${sql.ref("journal_entries.owner_user_id")})`.as(
        "activeGardeners",
      ),
      sql<number>`count(distinct case when not exists (
        select 1
        from journal_entries as previous_entry
        where previous_entry.owner_user_id = journal_entries.owner_user_id
          and previous_entry.created_at < journal_entries.created_at
      ) then journal_entries.id end)`.as("firstEntryActivations"),
      sql<number>`count(distinct case when exists (
        select 1
        from journal_entries as previous_same_object_entry
        where previous_same_object_entry.owner_user_id = journal_entries.owner_user_id
          and previous_same_object_entry.plant_object_id = journal_entries.plant_object_id
          and previous_same_object_entry.created_at < journal_entries.created_at
      ) then journal_entries.id end)`.as("sameObjectFollowUpEntries"),
      sql<number>`count(distinct case when exists (
        select 1
        from journal_entries as cohort_previous_same_object_entry
        where cohort_previous_same_object_entry.owner_user_id = journal_entries.owner_user_id
          and cohort_previous_same_object_entry.plant_object_id = journal_entries.plant_object_id
          and cohort_previous_same_object_entry.created_at < journal_entries.created_at
      ) and exists (
        select 1
        from analytics_events as cohort_first_save_event
        where cohort_first_save_event.owner_user_id = journal_entries.owner_user_id
          and cohort_first_save_event.event_name = 'entry_logged'
          and cohort_first_save_event.properties ->> 'activation_source' = 'invited_cohort'
      ) and exists (
        select 1
        from pilot_invite_grants as cohort_closed_pilot_grant
        where cohort_closed_pilot_grant.user_id = journal_entries.owner_user_id
          and cohort_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
      ) then journal_entries.id end)`.as(
        "invitedCohortSameObjectFollowUpEntries",
      ),
      sql<number>`count(distinct case when exists (
        select 1
        from journal_entries as cohort_return_previous_entry
        where cohort_return_previous_entry.owner_user_id = journal_entries.owner_user_id
          and cohort_return_previous_entry.plant_object_id = journal_entries.plant_object_id
          and cohort_return_previous_entry.created_at < journal_entries.created_at
      ) and exists (
        select 1
        from analytics_events as cohort_return_first_save_event
        where cohort_return_first_save_event.owner_user_id = journal_entries.owner_user_id
          and cohort_return_first_save_event.event_name = 'entry_logged'
          and cohort_return_first_save_event.properties ->> 'activation_source' = 'invited_cohort'
      ) and exists (
        select 1
        from pilot_invite_grants as cohort_return_closed_pilot_grant
        where cohort_return_closed_pilot_grant.user_id = journal_entries.owner_user_id
          and cohort_return_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
      ) then journal_entries.owner_user_id end)`.as(
        "invitedCohortReturningGardeners",
      ),
      sql<number>`count(distinct case when media_assets.id is not null then journal_entries.id end)`.as(
        "entriesWithProcessedPhoto",
      ),
      sql<number>`count(distinct case when journal_entries.visibility = 'public' and journal_entries.published_at is not null then journal_entries.id end)`.as(
        "publishedEntries",
      ),
      sql<number>`count(distinct case when journal_entries.lifecycle_state = 'archived' then journal_entries.id end)`.as(
        "archivedEntries",
      ),
      sql<number>`count(distinct case when journal_entries.public_gone_at is not null then journal_entries.id end)`.as(
        "publicGoneEntries",
      ),
    ])
    .where("journal_entries.created_at", ">=", since)
    .where(
      sql<boolean>`exists (
        select 1
        from pilot_invite_grants as entry_closed_pilot_grant
        where entry_closed_pilot_grant.user_id = journal_entries.owner_user_id
          and entry_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
      )`,
    );
}

export function buildPilotAnalyticsMetricsQuery(
  executor: QueryExecutor,
  since: Date,
) {
  return executor
    .selectFrom("analytics_events")
    .select([
      sql<number>`count(*) filter (
        where event_name = 'offline_entry_queued'
          and exists (
            select 1
            from pilot_invite_grants as offline_queued_closed_pilot_grant
            where offline_queued_closed_pilot_grant.user_id = analytics_events.owner_user_id
              and offline_queued_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
          )
      )`.as("offlineQueued"),
      sql<number>`count(*) filter (
        where event_name = 'offline_entry_synced'
          and exists (
            select 1
            from pilot_invite_grants as offline_synced_closed_pilot_grant
            where offline_synced_closed_pilot_grant.user_id = analytics_events.owner_user_id
              and offline_synced_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
          )
      )`.as("offlineSynced"),
      sql<number>`count(*) filter (
        where event_name = 'own_record_revisited'
          and properties ->> 'followed_by_action' = 'true'
      )`.as("sameSessionRevisitFollowUps"),
      sql<number>`count(distinct session_id) filter (
        where event_name = 'activation_started'
          and properties ->> 'activation_source' = 'homepage'
      )`.as("activationStartedHomepage"),
      sql<number>`count(distinct session_id) filter (
        where event_name = 'activation_started'
          and properties ->> 'activation_source' = 'public_variety'
      )`.as("activationStartedPublicVariety"),
      sql<number>`count(distinct session_id) filter (
        where event_name = 'activation_started'
          and properties ->> 'activation_source' = 'direct_garden'
      )`.as("activationStartedDirectGarden"),
      sql<number>`count(distinct session_id) filter (
        where event_name = 'activation_started'
          and properties ->> 'activation_source' = 'invited_cohort'
          and exists (
            select 1
            from pilot_invite_grants as activation_closed_pilot_grant
            where activation_closed_pilot_grant.user_id = analytics_events.owner_user_id
              and activation_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
          )
      )`.as("activationStartedInvitedCohort"),
      sql<number>`count(*) filter (
        where event_name = 'entry_logged'
          and properties ->> 'activation_source' = 'homepage'
      )`.as("entrySavedHomepage"),
      sql<number>`count(*) filter (
        where event_name = 'entry_logged'
          and properties ->> 'activation_source' = 'public_variety'
      )`.as("entrySavedPublicVariety"),
      sql<number>`count(*) filter (
        where event_name = 'entry_logged'
          and properties ->> 'activation_source' = 'direct_garden'
      )`.as("entrySavedDirectGarden"),
      sql<number>`count(*) filter (
        where event_name = 'entry_logged'
          and properties ->> 'activation_source' = 'invited_cohort'
          and exists (
            select 1
            from pilot_invite_grants as entry_closed_pilot_grant
            where entry_closed_pilot_grant.user_id = analytics_events.owner_user_id
              and entry_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
          )
      )`.as("entrySavedInvitedCohort"),
      sql<number>`count(*) filter (
        where event_name = 'follow_up_value_pulse'
          and exists (
            select 1
            from pilot_invite_grants as value_pulse_closed_pilot_grant
            where value_pulse_closed_pilot_grant.user_id = analytics_events.owner_user_id
              and value_pulse_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
          )
      )`.as("valuePulseResponses"),
      sql<number>`count(*) filter (
        where event_name = 'follow_up_value_pulse'
          and properties ->> 'pulse_outcome' = 'submitted'
          and exists (
            select 1
            from pilot_invite_grants as value_pulse_submitted_closed_pilot_grant
            where value_pulse_submitted_closed_pilot_grant.user_id = analytics_events.owner_user_id
              and value_pulse_submitted_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
          )
      )`.as("valuePulseSubmitted"),
      sql<number>`count(*) filter (
        where event_name = 'follow_up_value_pulse'
          and properties ->> 'pulse_outcome' = 'skipped'
          and exists (
            select 1
            from pilot_invite_grants as value_pulse_skipped_closed_pilot_grant
            where value_pulse_skipped_closed_pilot_grant.user_id = analytics_events.owner_user_id
              and value_pulse_skipped_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
          )
      )`.as("valuePulseSkipped"),
      sql<number>`count(*) filter (
        where event_name = 'follow_up_value_pulse'
          and properties ->> 'usefulness' = 'useful'
          and exists (
            select 1
            from pilot_invite_grants as value_pulse_useful_closed_pilot_grant
            where value_pulse_useful_closed_pilot_grant.user_id = analytics_events.owner_user_id
              and value_pulse_useful_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
          )
      )`.as("valuePulseUseful"),
      sql<number>`count(*) filter (
        where event_name = 'follow_up_value_pulse'
          and properties ->> 'usefulness' = 'not_sure'
          and exists (
            select 1
            from pilot_invite_grants as value_pulse_not_sure_closed_pilot_grant
            where value_pulse_not_sure_closed_pilot_grant.user_id = analytics_events.owner_user_id
              and value_pulse_not_sure_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
          )
      )`.as("valuePulseNotSure"),
      sql<number>`count(*) filter (
        where event_name = 'follow_up_value_pulse'
          and properties ->> 'usefulness' = 'not_useful'
          and exists (
            select 1
            from pilot_invite_grants as value_pulse_not_useful_closed_pilot_grant
            where value_pulse_not_useful_closed_pilot_grant.user_id = analytics_events.owner_user_id
              and value_pulse_not_useful_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
          )
      )`.as("valuePulseNotUseful"),
      sql<number>`count(*) filter (
        where event_name = 'follow_up_value_pulse'
          and properties ? 'usefulness_reason'
          and exists (
            select 1
            from pilot_invite_grants as value_pulse_reason_closed_pilot_grant
            where value_pulse_reason_closed_pilot_grant.user_id = analytics_events.owner_user_id
              and value_pulse_reason_closed_pilot_grant.cohort = ${CLOSED_PILOT_COHORT}
          )
      )`.as("valuePulseWithReason"),
    ])
    .where("analytics_events.created_at", ">=", since);
}

export function buildPilotSegmentMetricsQuery(
  executor: QueryExecutor,
  since: Date,
) {
  return executor
    .selectFrom("pilot_invite_grants as segment_grants")
    .where("segment_grants.cohort", "=", CLOSED_PILOT_COHORT)
    .leftJoin("analytics_events as segment_starts", (join) =>
      join
        .onRef("segment_starts.owner_user_id", "=", "segment_grants.user_id")
        .on("segment_starts.event_name", "=", "activation_started")
        .on(
          sql<boolean>`segment_starts.properties ->> 'activation_source' = 'invited_cohort'`,
        )
        .on("segment_starts.created_at", ">=", since),
    )
    .leftJoin("analytics_events as segment_entry_saves", (join) =>
      join
        .onRef(
          "segment_entry_saves.owner_user_id",
          "=",
          "segment_grants.user_id",
        )
        .on("segment_entry_saves.event_name", "=", "entry_logged")
        .on(
          sql<boolean>`segment_entry_saves.properties ->> 'activation_source' = 'invited_cohort'`,
        )
        .on("segment_entry_saves.created_at", ">=", since),
    )
    .leftJoin("journal_entries as segment_follow_up_entries", (join) =>
      join
        .onRef(
          "segment_follow_up_entries.owner_user_id",
          "=",
          "segment_grants.user_id",
        )
        .on("segment_follow_up_entries.created_at", ">=", since)
        .on(
          sql<boolean>`exists (
            select 1
            from journal_entries as segment_previous_same_object_entry
            where segment_previous_same_object_entry.owner_user_id = segment_follow_up_entries.owner_user_id
              and segment_previous_same_object_entry.plant_object_id = segment_follow_up_entries.plant_object_id
              and segment_previous_same_object_entry.created_at < segment_follow_up_entries.created_at
          )`,
        ),
    )
    .select([
      "segment_grants.segment as segment",
      sql<number>`count(distinct ${sql.ref("segment_grants.user_id")})`.as(
        "writeEligibleGardeners",
      ),
      sql<number>`count(distinct ${sql.ref("segment_starts.session_id")})`.as(
        "starts",
      ),
      sql<number>`count(distinct ${sql.ref("segment_entry_saves.id")})`.as(
        "firstEntrySaves",
      ),
      sql<number>`count(distinct ${sql.ref("segment_follow_up_entries.id")})`.as(
        "sameObjectFollowUpEntries",
      ),
      sql<number>`count(distinct ${sql.ref("segment_follow_up_entries.owner_user_id")})`.as(
        "returningGardeners",
      ),
    ])
    .groupBy("segment_grants.segment")
    .orderBy("segment_grants.segment", "asc");
}

export function buildPilotPublicVarietyHealthRowsQuery(
  executor: QueryExecutor,
) {
  return executor
    .selectFrom("catalog_items")
    .innerJoin(
      "plant_objects",
      "plant_objects.catalog_item_id",
      "catalog_items.id",
    )
    .innerJoin(
      "journal_entries",
      "journal_entries.plant_object_id",
      "plant_objects.id",
    )
    .innerJoin("spaces", "spaces.id", "journal_entries.space_id")
    .innerJoin(
      "pilot_invite_grants as public_entry_closed_pilot_grant",
      (join) =>
        join
          .onRef(
            "public_entry_closed_pilot_grant.user_id",
            "=",
            "journal_entries.owner_user_id",
          )
          .on(
            "public_entry_closed_pilot_grant.cohort",
            "=",
            CLOSED_PILOT_COHORT,
          ),
    )
    .select(({ fn }) => [
      "catalog_items.public_slug as publicSlug",
      "catalog_items.status as catalogStatus",
      "catalog_items.source as catalogSource",
      fn.count<number>("journal_entries.id").as("entryCount"),
      sql<number>`coalesce(sum(char_length(${sql.ref("journal_entries.body")})), 0)`.as(
        "aggregateBodyLength",
      ),
    ])
    .where("catalog_items.public_slug", "is not", null)
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("plant_objects.variety_state", "=", "selected")
    .whereRef(
      "journal_entries.owner_user_id",
      "=",
      "plant_objects.owner_user_id",
    )
    .whereRef("journal_entries.owner_user_id", "=", "spaces.owner_user_id")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .groupBy([
      "catalog_items.public_slug",
      "catalog_items.status",
      "catalog_items.source",
    ])
    .orderBy("catalog_items.public_slug", "asc")
    .$narrowType<{ publicSlug: string }>();
}

export function buildArchivedOrGonePublicVarietyRowsQuery(
  executor: QueryExecutor,
) {
  return executor
    .selectFrom("catalog_items")
    .innerJoin(
      "plant_objects",
      "plant_objects.catalog_item_id",
      "catalog_items.id",
    )
    .innerJoin(
      "journal_entries",
      "journal_entries.plant_object_id",
      "plant_objects.id",
    )
    .innerJoin("spaces", "spaces.id", "journal_entries.space_id")
    .innerJoin(
      "pilot_invite_grants as archived_entry_closed_pilot_grant",
      (join) =>
        join
          .onRef(
            "archived_entry_closed_pilot_grant.user_id",
            "=",
            "journal_entries.owner_user_id",
          )
          .on(
            "archived_entry_closed_pilot_grant.cohort",
            "=",
            CLOSED_PILOT_COHORT,
          ),
    )
    .select(({ fn }) => [
      "catalog_items.public_slug as publicSlug",
      fn.count<number>("journal_entries.id").as("archivedOrGoneEntryCount"),
    ])
    .where("catalog_items.public_slug", "is not", null)
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("plant_objects.variety_state", "=", "selected")
    .whereRef(
      "journal_entries.owner_user_id",
      "=",
      "plant_objects.owner_user_id",
    )
    .whereRef("journal_entries.owner_user_id", "=", "spaces.owner_user_id")
    .where("journal_entries.visibility", "=", "public")
    .where((eb) =>
      eb.or([
        eb("journal_entries.lifecycle_state", "=", "archived"),
        eb("journal_entries.public_gone_at", "is not", null),
      ]),
    )
    .where("journal_entries.public_slug", "is not", null)
    .groupBy("catalog_items.public_slug")
    .orderBy("catalog_items.public_slug", "asc")
    .$narrowType<{ publicSlug: string }>();
}

export function summarizePublicVarietyHealthRows(
  currentRows: PilotPublicVarietyRow[],
  archivedRows: ArchivedPublicVarietyRow[],
): PilotPublicVarietyHealth {
  const currentStates = new Map(
    currentRows.map((row) => {
      const entryCount = toNumber(row.entryCount);
      const aggregateBodyLength = toNumber(row.aggregateBodyLength);

      return [
        row.publicSlug,
        evaluatePublicVarietyIndexState({
          entryCount,
          aggregateBodyLength,
          catalogStatus: row.catalogStatus,
          catalogSource: row.catalogSource,
        }),
      ];
    }),
  );

  let promotedIndexableCount = 0;
  let thinNoindexCount = 0;

  for (const indexState of currentStates.values()) {
    if (indexState.isIndexable) {
      promotedIndexableCount += 1;
    } else {
      thinNoindexCount += 1;
    }
  }

  const demotedByArchiveOrGoneCount = archivedRows.filter((row) => {
    const archivedOrGoneEntryCount = toNumber(row.archivedOrGoneEntryCount);
    if (archivedOrGoneEntryCount === 0) return false;

    const currentState = currentStates.get(row.publicSlug);
    return !currentState || !currentState.isIndexable;
  }).length;

  return {
    promotedIndexableCount,
    thinNoindexCount,
    demotedByArchiveOrGoneCount,
    currentPublicVarietyCount: currentRows.length,
    threshold: PUBLIC_VARIETY_INDEXABILITY_THRESHOLD,
  };
}

function buildPilotHealthWindow(
  window: (typeof PILOT_HEALTH_WINDOWS)[number] & { since: Date },
  entryMetrics: NormalizedEntryMetricRow,
  analyticsMetrics: NormalizedAnalyticsMetricRow,
  segmentMetrics: PilotSegmentCohortMetrics[],
): PilotHealthWindow {
  const activationStarts = {
    homepage: analyticsMetrics.activationStartedHomepage,
    publicVariety: analyticsMetrics.activationStartedPublicVariety,
    directGarden: analyticsMetrics.activationStartedDirectGarden,
    invitedCohort: analyticsMetrics.activationStartedInvitedCohort,
  };
  const entrySavesByActivationSource = {
    homepage: analyticsMetrics.entrySavedHomepage,
    publicVariety: analyticsMetrics.entrySavedPublicVariety,
    directGarden: analyticsMetrics.entrySavedDirectGarden,
    invitedCohort: analyticsMetrics.entrySavedInvitedCohort,
  };
  const activationStartedTotal =
    activationStarts.homepage +
    activationStarts.publicVariety +
    activationStarts.directGarden +
    activationStarts.invitedCohort;
  const invitedCohort: PilotInvitedCohortMetrics = {
    starts: activationStarts.invitedCohort,
    firstEntrySaves: entrySavesByActivationSource.invitedCohort,
    sameObjectFollowUpEntries:
      entryMetrics.invitedCohortSameObjectFollowUpEntries,
    returningGardeners: entryMetrics.invitedCohortReturningGardeners,
    firstEntrySaveRate: safeRate(
      entrySavesByActivationSource.invitedCohort,
      activationStarts.invitedCohort,
    ),
    segments: segmentMetrics,
  };
  const followUpValuePulse = buildFollowUpValuePulseMetrics(analyticsMetrics);

  return {
    key: window.key,
    label: window.label,
    since: window.since,
    metrics: {
      firstEntryActivations: entryMetrics.firstEntryActivations,
      totalEntries: entryMetrics.totalEntries,
      activeGardeners: entryMetrics.activeGardeners,
      sameObjectFollowUpEntries: entryMetrics.sameObjectFollowUpEntries,
      sameSessionRevisitFollowUps: analyticsMetrics.sameSessionRevisitFollowUps,
      entriesWithProcessedPhoto: entryMetrics.entriesWithProcessedPhoto,
      photoUsageRate: safeRate(
        entryMetrics.entriesWithProcessedPhoto,
        entryMetrics.totalEntries,
      ),
      offlineQueued: analyticsMetrics.offlineQueued,
      offlineSynced: analyticsMetrics.offlineSynced,
      offlineFailed: {
        count: null,
        observability: "client_only_not_server_observable",
      },
      publishedEntries: entryMetrics.publishedEntries,
      publishRate: safeRate(
        entryMetrics.publishedEntries,
        entryMetrics.totalEntries,
      ),
      archivedEntries: entryMetrics.archivedEntries,
      publicGoneEntries: entryMetrics.publicGoneEntries,
      activationStarts: {
        total: activationStartedTotal,
        ...activationStarts,
      },
      entrySavesByActivationSource,
      publicVarietySaveRate: safeRate(
        entrySavesByActivationSource.publicVariety,
        activationStarts.publicVariety,
      ),
      invitedCohort,
      followUpValuePulse,
    },
  };
}

function buildFollowUpValuePulseMetrics(
  analyticsMetrics: NormalizedAnalyticsMetricRow,
): PilotFollowUpValuePulseMetrics {
  const submitted = analyticsMetrics.valuePulseSubmitted;

  return {
    responses: analyticsMetrics.valuePulseResponses,
    submitted,
    skipped: analyticsMetrics.valuePulseSkipped,
    useful: analyticsMetrics.valuePulseUseful,
    notSure: analyticsMetrics.valuePulseNotSure,
    notUseful: analyticsMetrics.valuePulseNotUseful,
    withReason: analyticsMetrics.valuePulseWithReason,
    usefulRate: safeRate(analyticsMetrics.valuePulseUseful, submitted),
  };
}

export function summarizePilotSegmentMetricRows(
  rows: PilotSegmentMetricRow[],
): PilotSegmentCohortMetrics[] {
  return rows.map((row) => {
    const segment = normalizeSegment(row.segment);
    const firstEntrySaves = toNumber(row.firstEntrySaves);
    const starts = toNumber(row.starts);
    const returningGardeners = toNumber(row.returningGardeners);

    return {
      segment,
      label: getPilotSegmentLabel(segment),
      coreBucket: getPilotSegmentCoreBucket(segment),
      diagnosticBucket: getPilotSegmentDiagnosticBucket(segment),
      writeEligibleGardeners: toNumber(row.writeEligibleGardeners),
      starts,
      firstEntrySaves,
      sameObjectFollowUpEntries: toNumber(row.sameObjectFollowUpEntries),
      returningGardeners,
      firstEntrySaveRate: safeRate(firstEntrySaves, starts),
      followUpRateAmongFirstSavers: safeRate(
        returningGardeners,
        firstEntrySaves,
      ),
      isUnknownSegment: segment === DEFAULT_PILOT_SEGMENT,
      isLowSample: firstEntrySaves > 0 && firstEntrySaves < 2,
    };
  });
}

type NormalizedEntryMetricRow = ReturnType<typeof normalizeEntryMetricRow>;
type NormalizedAnalyticsMetricRow = ReturnType<
  typeof normalizeAnalyticsMetricRow
>;

function normalizeEntryMetricRow(row: PilotEntryMetricRow | undefined) {
  return {
    activeGardeners: toNumber(row?.activeGardeners),
    archivedEntries: toNumber(row?.archivedEntries),
    entriesWithProcessedPhoto: toNumber(row?.entriesWithProcessedPhoto),
    firstEntryActivations: toNumber(row?.firstEntryActivations),
    invitedCohortReturningGardeners: toNumber(
      row?.invitedCohortReturningGardeners,
    ),
    invitedCohortSameObjectFollowUpEntries: toNumber(
      row?.invitedCohortSameObjectFollowUpEntries,
    ),
    publicGoneEntries: toNumber(row?.publicGoneEntries),
    publishedEntries: toNumber(row?.publishedEntries),
    sameObjectFollowUpEntries: toNumber(row?.sameObjectFollowUpEntries),
    totalEntries: toNumber(row?.totalEntries),
  };
}

function normalizeAnalyticsMetricRow(row: PilotAnalyticsMetricRow | undefined) {
  return {
    activationStartedDirectGarden: toNumber(row?.activationStartedDirectGarden),
    activationStartedHomepage: toNumber(row?.activationStartedHomepage),
    activationStartedInvitedCohort: toNumber(
      row?.activationStartedInvitedCohort,
    ),
    activationStartedPublicVariety: toNumber(
      row?.activationStartedPublicVariety,
    ),
    entrySavedDirectGarden: toNumber(row?.entrySavedDirectGarden),
    entrySavedHomepage: toNumber(row?.entrySavedHomepage),
    entrySavedInvitedCohort: toNumber(row?.entrySavedInvitedCohort),
    entrySavedPublicVariety: toNumber(row?.entrySavedPublicVariety),
    offlineQueued: toNumber(row?.offlineQueued),
    offlineSynced: toNumber(row?.offlineSynced),
    sameSessionRevisitFollowUps: toNumber(row?.sameSessionRevisitFollowUps),
    valuePulseNotSure: toNumber(row?.valuePulseNotSure),
    valuePulseNotUseful: toNumber(row?.valuePulseNotUseful),
    valuePulseResponses: toNumber(row?.valuePulseResponses),
    valuePulseSkipped: toNumber(row?.valuePulseSkipped),
    valuePulseSubmitted: toNumber(row?.valuePulseSubmitted),
    valuePulseUseful: toNumber(row?.valuePulseUseful),
    valuePulseWithReason: toNumber(row?.valuePulseWithReason),
  };
}

function normalizeSegment(value: string | null | undefined): PilotSegment {
  return normalizePilotSegment(value) ?? DEFAULT_PILOT_SEGMENT;
}

function safeRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function toNumber(value: number | string | bigint | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function daysBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
