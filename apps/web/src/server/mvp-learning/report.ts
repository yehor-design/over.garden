import "server-only";

import { Kysely, sql, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  AUTOMATED_BOT_ACTOR_CLASS,
  EDITORIAL_SEED_ACTOR_CLASS,
  EXCLUDED_LEARNING_ACTOR_CLASSES,
  normalizeActorClass,
  PRODUCTION_SMOKE_ACTOR_CLASS,
  REAL_SELF_SERVE_ACTOR_CLASS,
  VISUAL_FIXTURE_ACTOR_CLASS,
  type ActorClass,
  type ExcludedLearningActorClass,
} from "@/lib/garden/actor-class";
import {
  MVP_LEARNING_DECISION_ELIGIBLE_CONTENT_CLASSES,
  MVP_LEARNING_POLICY_DATE,
  MVP_LEARNING_POLICY_VERSION,
} from "@/lib/mvp-learning/policy";
import { RETENTION_POLICY_VERSION } from "@/server/media/retention-executor";
import {
  getLearningAttributionOutboxCounts,
  type LearningAttributionOutboxCounts,
} from "@/server/mvp-learning/attribution-outbox";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export type MvpLearningCohortKey = typeof REAL_SELF_SERVE_ACTOR_CLASS;

export type MvpLearningDecisionGate =
  | "ok"
  | "unclassified"
  | "stale"
  | "insufficient";

/**
 * H6 has deliberately not been instrumented. This is a product and privacy
 * decision, not a zero-valued organic-acquisition result.
 */
export const MVP_LEARNING_ORGANIC_ACQUISITION_STATUS =
  "not_instrumented" as const;

export interface MvpLearningOrganicAcquisition {
  status: typeof MVP_LEARNING_ORGANIC_ACQUISITION_STATUS;
  decisionReady: false;
}

const ORGANIC_ACQUISITION_NOT_INSTRUMENTED: MvpLearningOrganicAcquisition = {
  status: MVP_LEARNING_ORGANIC_ACQUISITION_STATUS,
  decisionReady: false,
};

const MVP_LEARNING_REPORT_STATEMENT_TIMEOUT_MS = 450;

export interface MvpLearningCohortSignals {
  cohort: MvpLearningCohortKey;
  activatedGardeners: number;
  h1RetainedGardeners: number;
  h1Rate: number;
  publishedGardeners: number;
  publishedEntries: number;
  publishRate: number;
  sameObjectFollowUpEntries: number;
  sameSessionRevisitFollowUps: number;
}

export interface MvpLearningExclusionCounts {
  production_smoke: number;
  visual_fixture: number;
  editorial_seed: number;
  automated_bot: number;
}

export interface MvpLearningReport {
  policyVersion: typeof MVP_LEARNING_POLICY_VERSION;
  policyDate: typeof MVP_LEARNING_POLICY_DATE;
  retentionPolicyVersion: typeof RETENTION_POLICY_VERSION;
  generatedAt: Date;
  windowDays: number;
  since: Date;
  cohorts: {
    real_self_serve: MvpLearningCohortSignals;
  };
  exclusions: MvpLearningExclusionCounts;
  attributionOutbox: LearningAttributionOutboxCounts;
  unclassifiedEventCount: number;
  unclassifiedActiveGardenerCount: number;
  organicAcquisition: MvpLearningOrganicAcquisition;
  /**
   * Editorial-public activity is a content diagnostic. It is never an H6
   * acquisition substitute.
   */
  editorialPublicTrafficProxy: number;
  decisionGate: MvpLearningDecisionGate;
  notes: string[];
}

const EMPTY_EXCLUSIONS: MvpLearningExclusionCounts = {
  production_smoke: 0,
  visual_fixture: 0,
  editorial_seed: 0,
  automated_bot: 0,
};

export async function getMvpLearningReport(
  options: {
    executor?: QueryExecutor;
    windowDays?: number;
    now?: Date;
  } = {},
): Promise<MvpLearningReport> {
  const executor = options.executor ?? db;
  const windowDays = options.windowDays ?? 30;
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  return withMvpLearningReadSnapshot(executor, async (snapshot) => {
    const [
      selfServe,
      exclusions,
      unclassified,
      editorialPublic,
      attributionOutbox,
    ] = await Promise.all([
      loadCohortSignals(snapshot, REAL_SELF_SERVE_ACTOR_CLASS, since),
      loadExclusionCounts(snapshot, since),
      loadUnclassifiedCounts(snapshot, since),
      loadEditorialPublicProxy(snapshot, since),
      getLearningAttributionOutboxCounts(snapshot),
    ]);

    const organicAcquisition = ORGANIC_ACQUISITION_NOT_INSTRUMENTED;
    const decisionGate = evaluateMvpLearningDecisionGate({
      selfServe,
      unclassifiedEventCount: unclassified.events,
      unclassifiedActiveGardenerCount: unclassified.gardeners,
      attributionOutbox,
      organicAcquisition,
    });

    return {
      policyVersion: MVP_LEARNING_POLICY_VERSION,
      policyDate: MVP_LEARNING_POLICY_DATE,
      retentionPolicyVersion: RETENTION_POLICY_VERSION,
      generatedAt: now,
      windowDays,
      since,
      cohorts: {
        real_self_serve: selfServe,
      },
      exclusions,
      attributionOutbox,
      unclassifiedEventCount: unclassified.events,
      unclassifiedActiveGardenerCount: unclassified.gardeners,
      organicAcquisition,
      editorialPublicTrafficProxy: editorialPublic,
      decisionGate,
      notes: [
        "H1 requires same-object follow-up plus a same-session revisit/decision proxy; first save alone is not retention.",
        "H4 counts distinct eligible gardeners with at least one active public decision-eligible entry; raw entry volume is diagnostic only.",
        "H6 organic acquisition is not instrumented and cannot be inferred from editorial public traffic.",
        "Self-serve registrations are the only real-user decision cohort.",
        "Synthetic/editorial/bot classes are exclusion counts only and cannot drive continue/iterate/stop.",
        "Unclassified activity fails the decision gate closed rather than defaulting to real.",
        "Pending, retried, or dead learning-attribution work keeps the decision gate closed until durable classification converges.",
      ],
    };
  });
}

export async function getMvpLearningReportSafely(
  options: {
    reader?: () => Promise<MvpLearningReport>;
    logger?: Pick<Console, "error">;
  } = {},
): Promise<MvpLearningReport | null> {
  const reader = options.reader ?? (() => getMvpLearningReport());
  const logger = options.logger ?? console;
  try {
    return await reader();
  } catch (error) {
    logger.error("MVP learning report failed.", {
      error:
        error instanceof Error
          ? error.message
          : "Unknown MVP learning report error.",
    });
    return null;
  }
}

export function evaluateMvpLearningDecisionGate(input: {
  selfServe: MvpLearningCohortSignals;
  unclassifiedEventCount: number;
  unclassifiedActiveGardenerCount: number;
  attributionOutbox: LearningAttributionOutboxCounts;
  organicAcquisition: MvpLearningOrganicAcquisition;
}): MvpLearningDecisionGate {
  if (
    input.unclassifiedEventCount > 0 ||
    input.unclassifiedActiveGardenerCount > 0 ||
    input.attributionOutbox.pending > 0 ||
    input.attributionOutbox.processing > 0 ||
    input.attributionOutbox.failed > 0 ||
    input.attributionOutbox.dead > 0
  ) {
    return "unclassified";
  }

  if (!input.organicAcquisition.decisionReady) {
    return "insufficient";
  }

  const activated = input.selfServe.activatedGardeners;
  if (activated < 1) {
    return "insufficient";
  }
  if (activated < 3) {
    return "insufficient";
  }
  return "ok";
}

async function loadCohortSignals(
  executor: QueryExecutor,
  cohort: MvpLearningCohortKey,
  since: Date,
): Promise<MvpLearningCohortSignals> {
  const row = await executor
    .selectFrom("journal_entries")
    .select([
      sql<number>`count(distinct case when ${eligibleActorPredicate(cohort)} then journal_entries.owner_user_id end)::int`.as(
        "activatedGardeners",
      ),
      sql<number>`count(distinct case when ${eligibleActorPredicate(cohort)} and exists (
        select 1
        from journal_entries as previous_same_object_entry
        where previous_same_object_entry.owner_user_id = journal_entries.owner_user_id
          and previous_same_object_entry.plant_object_id = journal_entries.plant_object_id
          and previous_same_object_entry.plant_object_id is not null
          and previous_same_object_entry.created_at < journal_entries.created_at
      ) then journal_entries.id end)::int`.as("sameObjectFollowUpEntries"),
      sql<number>`count(distinct case when ${eligibleActorPredicate(cohort)} and exists (
        select 1
        from analytics_events as revisit
        where revisit.owner_user_id = journal_entries.owner_user_id
          and revisit.plant_object_id = journal_entries.plant_object_id
          and revisit.event_name = 'own_record_revisited'
          and revisit.properties ->> 'followed_by_action' = 'true'
          and revisit.created_at >= ${since}
      ) and exists (
        select 1
        from journal_entries as previous_same_object_entry
        where previous_same_object_entry.owner_user_id = journal_entries.owner_user_id
          and previous_same_object_entry.plant_object_id = journal_entries.plant_object_id
          and previous_same_object_entry.plant_object_id is not null
          and previous_same_object_entry.created_at < journal_entries.created_at
      ) then journal_entries.owner_user_id end)::int`.as("h1RetainedGardeners"),
      sql<number>`count(distinct case when ${eligibleActorPredicate(cohort)} and exists (
        select 1
        from analytics_events as revisit
        where revisit.owner_user_id = journal_entries.owner_user_id
          and revisit.plant_object_id = journal_entries.plant_object_id
          and revisit.event_name = 'own_record_revisited'
          and revisit.properties ->> 'followed_by_action' = 'true'
          and revisit.session_id is not null
          and revisit.created_at >= ${since}
      ) and exists (
        select 1
        from journal_entries as previous_same_object_entry
        where previous_same_object_entry.owner_user_id = journal_entries.owner_user_id
          and previous_same_object_entry.plant_object_id = journal_entries.plant_object_id
          and previous_same_object_entry.plant_object_id is not null
          and previous_same_object_entry.created_at < journal_entries.created_at
      ) then journal_entries.id end)::int`.as("sameSessionRevisitFollowUps"),
      sql<number>`count(distinct case when ${eligibleActorPredicate(cohort)}
        and journal_entries.visibility = 'public'
        and journal_entries.lifecycle_state = 'active'
        and journal_entries.content_class in (${sql.join(
          MVP_LEARNING_DECISION_ELIGIBLE_CONTENT_CLASSES.map((value) =>
            sql.lit(value),
          ),
        )})
        then journal_entries.owner_user_id end)::int`.as("publishedGardeners"),
      sql<number>`count(distinct case when ${eligibleActorPredicate(cohort)}
        and journal_entries.visibility = 'public'
        and journal_entries.lifecycle_state = 'active'
        and journal_entries.content_class in (${sql.join(
          MVP_LEARNING_DECISION_ELIGIBLE_CONTENT_CLASSES.map((value) =>
            sql.lit(value),
          ),
        )})
        then journal_entries.id end)::int`.as("publishedEntries"),
    ])
    .where("journal_entries.created_at", ">=", since)
    .executeTakeFirst();

  const activatedGardeners = toCount(row?.activatedGardeners);
  const h1RetainedGardeners = toCount(row?.h1RetainedGardeners);
  const publishedGardeners = toCount(row?.publishedGardeners);
  const publishedEntries = toCount(row?.publishedEntries);

  return {
    cohort,
    activatedGardeners,
    h1RetainedGardeners,
    h1Rate: safeRate(h1RetainedGardeners, activatedGardeners),
    publishedGardeners,
    publishedEntries,
    publishRate: safeRate(publishedGardeners, activatedGardeners),
    sameObjectFollowUpEntries: toCount(row?.sameObjectFollowUpEntries),
    sameSessionRevisitFollowUps: toCount(row?.sameSessionRevisitFollowUps),
  };
}

function eligibleActorPredicate(cohort: MvpLearningCohortKey) {
  return sql<boolean>`(
    exists (
      select 1
      from learning_actor_attributions as attribution
      where attribution.user_id = journal_entries.owner_user_id
        and attribution.actor_class = ${cohort}
    )
  )`;
}

async function loadExclusionCounts(
  executor: QueryExecutor,
  since: Date,
): Promise<MvpLearningExclusionCounts> {
  const rows = await executor
    .selectFrom("learning_actor_attributions")
    .innerJoin(
      "journal_entries",
      "journal_entries.owner_user_id",
      "learning_actor_attributions.user_id",
    )
    .select([
      "learning_actor_attributions.actor_class as actorClass",
      sql<number>`count(distinct journal_entries.owner_user_id)::int`.as(
        "count",
      ),
    ])
    .where("journal_entries.created_at", ">=", since)
    .where("learning_actor_attributions.actor_class", "in", [
      ...EXCLUDED_LEARNING_ACTOR_CLASSES,
    ])
    .groupBy("learning_actor_attributions.actor_class")
    .execute();

  const exclusions = { ...EMPTY_EXCLUSIONS };
  for (const row of rows) {
    const actorClass = normalizeActorClass(row.actorClass);
    if (!actorClass || !isExcludedKey(actorClass)) continue;
    exclusions[actorClass] = toCount(row.count);
  }
  return exclusions;
}

async function loadUnclassifiedCounts(
  executor: QueryExecutor,
  since: Date,
): Promise<{ events: number; gardeners: number }> {
  const row = await sql<{ events: number; gardeners: number }>`
    with unclassified_events as (
      select analytics_events.id, analytics_events.owner_user_id
      from analytics_events
      left join learning_actor_attributions as attribution
        on attribution.user_id = analytics_events.owner_user_id
      where analytics_events.created_at >= ${since}
        and (
          attribution.user_id is null
          or case analytics_events.properties ->> 'actor_class'
            when 'self_serve' then 'real_self_serve'
            when 'editorial' then 'editorial_seed'
            else analytics_events.properties ->> 'actor_class'
          end is distinct from attribution.actor_class
        )
    ), unclassified_journal_owners as (
      select distinct journal_entries.owner_user_id
      from journal_entries
      left join learning_actor_attributions as attribution
        on attribution.user_id = journal_entries.owner_user_id
      where journal_entries.created_at >= ${since}
        and attribution.user_id is null
    ), unclassified_owners as (
      select owner_user_id from unclassified_events
      union
      select owner_user_id from unclassified_journal_owners
    )
    select
      (select count(*)::int from unclassified_events) as events,
      (select count(*)::int from unclassified_owners) as gardeners
  `.execute(executor);

  const first = row.rows[0];
  return {
    events: toCount(first?.events),
    gardeners: toCount(first?.gardeners),
  };
}

async function loadEditorialPublicProxy(
  executor: QueryExecutor,
  since: Date,
): Promise<number> {
  const row = await executor
    .selectFrom("journal_entries")
    .select(sql<number>`count(*)::int`.as("count"))
    .where("created_at", ">=", since)
    .where("visibility", "=", "public")
    .where("lifecycle_state", "=", "active")
    .where("content_class", "in", ["editorial", "catalog_fact"])
    .executeTakeFirst();
  return toCount(row?.count);
}

function isExcludedKey(value: ActorClass): value is ExcludedLearningActorClass {
  return (EXCLUDED_LEARNING_ACTOR_CLASSES as readonly string[]).includes(value);
}

function safeRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.min(1, Math.max(0, numerator / denominator));
}

async function withMvpLearningReadSnapshot<T>(
  executor: QueryExecutor,
  reader: (snapshot: QueryExecutor) => Promise<T>,
): Promise<T> {
  if (!(executor instanceof Kysely) || executor.isTransaction) {
    return reader(executor);
  }

  return executor.transaction().execute(async (snapshot) => {
    await sql
      .raw("set transaction isolation level repeatable read, read only")
      .execute(snapshot);
    await sql
      .raw(
        `set local statement_timeout = '${MVP_LEARNING_REPORT_STATEMENT_TIMEOUT_MS}ms'`,
      )
      .execute(snapshot);
    return reader(snapshot);
  });
}

function toCount(value: string | number | bigint | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function emptyExclusionCounts(): MvpLearningExclusionCounts {
  return { ...EMPTY_EXCLUSIONS };
}

export function listKnownActorClassLabels(): ActorClass[] {
  return [
    REAL_SELF_SERVE_ACTOR_CLASS,
    PRODUCTION_SMOKE_ACTOR_CLASS,
    VISUAL_FIXTURE_ACTOR_CLASS,
    EDITORIAL_SEED_ACTOR_CLASS,
    AUTOMATED_BOT_ACTOR_CLASS,
  ];
}
