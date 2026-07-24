import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  AUTOMATED_BOT_ACTOR_CLASS,
  EDITORIAL_SEED_ACTOR_CLASS,
  EXCLUDED_LEARNING_ACTOR_CLASSES,
  FOUNDER_REHEARSAL_ACTOR_CLASS,
  normalizeActorClass,
  PRODUCTION_SMOKE_ACTOR_CLASS,
  REAL_CLOSED_PILOT_ACTOR_CLASS,
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

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export type MvpLearningCohortKey =
  | typeof REAL_SELF_SERVE_ACTOR_CLASS
  | typeof REAL_CLOSED_PILOT_ACTOR_CLASS;

export type MvpLearningDecisionGate =
  | "ok"
  | "unclassified"
  | "stale"
  | "insufficient";

export interface MvpLearningCohortSignals {
  cohort: MvpLearningCohortKey;
  activatedGardeners: number;
  h1RetainedGardeners: number;
  h1Rate: number;
  publishedEntries: number;
  publishRate: number;
  sameObjectFollowUpEntries: number;
  sameSessionRevisitFollowUps: number;
}

export interface MvpLearningExclusionCounts {
  founder_rehearsal: number;
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
    real_closed_pilot: MvpLearningCohortSignals;
  };
  exclusions: MvpLearningExclusionCounts;
  unclassifiedEventCount: number;
  unclassifiedActiveGardenerCount: number;
  editorialPublicTrafficProxy: number;
  decisionGate: MvpLearningDecisionGate;
  notes: string[];
}

const EMPTY_EXCLUSIONS: MvpLearningExclusionCounts = {
  founder_rehearsal: 0,
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

  const [selfServe, closedPilot, exclusions, unclassified, editorialPublic] =
    await Promise.all([
      loadCohortSignals(executor, REAL_SELF_SERVE_ACTOR_CLASS, since),
      loadCohortSignals(executor, REAL_CLOSED_PILOT_ACTOR_CLASS, since),
      loadExclusionCounts(executor, since),
      loadUnclassifiedCounts(executor, since),
      loadEditorialPublicProxy(executor, since),
    ]);

  const decisionGate = evaluateDecisionGate({
    selfServe,
    closedPilot,
    unclassifiedEventCount: unclassified.events,
    unclassifiedActiveGardenerCount: unclassified.gardeners,
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
      real_closed_pilot: closedPilot,
    },
    exclusions,
    unclassifiedEventCount: unclassified.events,
    unclassifiedActiveGardenerCount: unclassified.gardeners,
    editorialPublicTrafficProxy: editorialPublic,
    decisionGate,
    notes: [
      "H1 requires same-object follow-up plus a same-session revisit/decision proxy; first save alone is not retention.",
      "H4 publication counts only decision-eligible content classes (real_ugc, founder_first_hand) for eligible actor classes.",
      "Closed-pilot and self-serve cohorts are never mixed into one denominator.",
      "Synthetic/editorial/bot classes are exclusion counts only and cannot drive continue/iterate/stop.",
      "Unclassified activity fails the decision gate closed rather than defaulting to real.",
    ],
  };
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

function evaluateDecisionGate(input: {
  selfServe: MvpLearningCohortSignals;
  closedPilot: MvpLearningCohortSignals;
  unclassifiedEventCount: number;
  unclassifiedActiveGardenerCount: number;
}): MvpLearningDecisionGate {
  if (
    input.unclassifiedEventCount > 0 ||
    input.unclassifiedActiveGardenerCount > 0
  ) {
    return "unclassified";
  }

  const activated =
    input.selfServe.activatedGardeners + input.closedPilot.activatedGardeners;
  if (activated < 1) {
    // Honest zero is valid and decision-ready for "no real signal yet".
    return "ok";
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
        then journal_entries.id end)::int`.as("publishedEntries"),
    ])
    .where("journal_entries.created_at", ">=", since)
    .executeTakeFirst();

  const activatedGardeners = toCount(row?.activatedGardeners);
  const h1RetainedGardeners = toCount(row?.h1RetainedGardeners);
  const publishedEntries = toCount(row?.publishedEntries);

  return {
    cohort,
    activatedGardeners,
    h1RetainedGardeners,
    h1Rate: safeRate(h1RetainedGardeners, activatedGardeners),
    publishedEntries,
    publishRate: safeRate(publishedEntries, activatedGardeners),
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
    or (
      not exists (
        select 1
        from learning_actor_attributions as any_attribution
        where any_attribution.user_id = journal_entries.owner_user_id
      )
      and ${
        cohort === REAL_CLOSED_PILOT_ACTOR_CLASS
          ? sql`exists (
              select 1
              from pilot_invite_grants as grant_row
              where grant_row.user_id = journal_entries.owner_user_id
                and grant_row.cohort = 'closed_pilot'
            )`
          : sql`not exists (
              select 1
              from pilot_invite_grants as grant_row
              where grant_row.user_id = journal_entries.owner_user_id
            )`
      }
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
    .where(
      "learning_actor_attributions.actor_class",
      "in",
      [...EXCLUDED_LEARNING_ACTOR_CLASSES],
    )
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
    select
      count(*)::int as events,
      count(distinct owner_user_id)::int as gardeners
    from analytics_events
    where created_at >= ${since}
      and (
        properties ->> 'actor_class' is null
        or properties ->> 'actor_class' not in (
          'real_self_serve',
          'real_closed_pilot',
          'founder_rehearsal',
          'production_smoke',
          'visual_fixture',
          'editorial_seed',
          'automated_bot',
          'self_serve',
          'closed_pilot',
          'editorial'
        )
      )
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
  return numerator / denominator;
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
    REAL_CLOSED_PILOT_ACTOR_CLASS,
    FOUNDER_REHEARSAL_ACTOR_CLASS,
    PRODUCTION_SMOKE_ACTOR_CLASS,
    VISUAL_FIXTURE_ACTOR_CLASS,
    EDITORIAL_SEED_ACTOR_CLASS,
    AUTOMATED_BOT_ACTOR_CLASS,
  ];
}
