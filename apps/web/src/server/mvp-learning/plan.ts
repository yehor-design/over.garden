import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  EDITORIAL_SEED_ACTOR_CLASS,
  normalizeActorClass,
  PRODUCTION_SMOKE_ACTOR_CLASS,
  REAL_SELF_SERVE_ACTOR_CLASS,
  VISUAL_FIXTURE_ACTOR_CLASS,
  type ActorClass,
} from "@/lib/garden/actor-class";
import { MVP_LEARNING_POLICY_VERSION } from "@/lib/mvp-learning/policy";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface MvpLearningPlanClassCount {
  actorClass: ActorClass | "unclassified";
  users: number;
  events: number;
  journals: number;
}

export interface MvpLearningPlanReport {
  ok: true;
  policyVersion: typeof MVP_LEARNING_POLICY_VERSION;
  environment: "local" | "production";
  selectOnly: true;
  inferred: MvpLearningPlanClassCount[];
  proposedAttributionUpserts: {
    actorClass: ActorClass;
    users: number;
    source: "operator_plan";
  }[];
  proposedEventPropertyRemaps: {
    from: string;
    to: ActorClass;
    events: number;
  }[];
  notes: string[];
}

export const MVP_LEARNING_INVENTORY_SQL = `
with user_signal as (
  select
    u.id as user_id,
    case
      when exists (
        select 1 from journal_entries je
        where je.owner_user_id = u.id and je.content_class = 'visual_fixture'
      ) then 'visual_fixture'
      when exists (
        select 1 from journal_entries je
        where je.owner_user_id = u.id and je.content_class = 'production_smoke'
      ) then 'production_smoke'
      when exists (
        select 1 from journal_entries je
        where je.owner_user_id = u.id and je.content_class in ('editorial', 'catalog_fact')
      ) then 'editorial_seed'
      when exists (
        select 1 from journal_entries je where je.owner_user_id = u.id
      ) or exists (
        select 1 from analytics_events ae where ae.owner_user_id = u.id
      ) then 'real_self_serve'
      else null
    end as inferred_class
  from "user" u
),
event_counts as (
  select owner_user_id, count(*)::int as events
  from analytics_events
  group by owner_user_id
),
journal_counts as (
  select owner_user_id, count(*)::int as journals
  from journal_entries
  group by owner_user_id
)
select
  coalesce(user_signal.inferred_class, 'unclassified') as actor_class,
  count(*) filter (where user_signal.inferred_class is not null or event_counts.events > 0 or journal_counts.journals > 0)::int as users,
  coalesce(sum(event_counts.events), 0)::int as events,
  coalesce(sum(journal_counts.journals), 0)::int as journals
from user_signal
left join event_counts on event_counts.owner_user_id = user_signal.user_id
left join journal_counts on journal_counts.owner_user_id = user_signal.user_id
where user_signal.inferred_class is not null
   or coalesce(event_counts.events, 0) > 0
   or coalesce(journal_counts.journals, 0) > 0
group by coalesce(user_signal.inferred_class, 'unclassified')
order by actor_class
`;

export function assertMvpLearningInventorySqlIsSelectOnly() {
  const normalized = MVP_LEARNING_INVENTORY_SQL.toLowerCase();
  for (const banned of [
    "insert ",
    "update ",
    "delete ",
    "drop ",
    "alter ",
    "truncate ",
    "create ",
  ]) {
    if (normalized.includes(banned)) {
      throw new Error(
        `MVP learning inventory SQL must stay SELECT-only; found ${banned.trim()}.`,
      );
    }
  }
}

export function buildMvpLearningPlanReport(input: {
  environment: "local" | "production";
  inventory: Array<{
    actor_class: string;
    users: number;
    events: number;
    journals: number;
  }>;
  legacyEventRemaps?: Array<{ from: string; to: string; events: number }>;
}): MvpLearningPlanReport {
  const inferred: MvpLearningPlanClassCount[] = input.inventory.map((row) => {
    const actorClass =
      row.actor_class === "unclassified"
        ? "unclassified"
        : (normalizeActorClass(row.actor_class) ?? "unclassified");
    return {
      actorClass,
      users: Number(row.users) || 0,
      events: Number(row.events) || 0,
      journals: Number(row.journals) || 0,
    };
  });

  const proposedAttributionUpserts = inferred
    .filter(
      (row): row is MvpLearningPlanClassCount & { actorClass: ActorClass } =>
        row.actorClass !== "unclassified" && row.users > 0,
    )
    .map((row) => ({
      actorClass: row.actorClass,
      users: row.users,
      source: "operator_plan" as const,
    }));

  const defaultRemaps = [
    { from: "self_serve", to: REAL_SELF_SERVE_ACTOR_CLASS },
    { from: "editorial", to: EDITORIAL_SEED_ACTOR_CLASS },
  ];

  const proposedEventPropertyRemaps = (
    input.legacyEventRemaps ??
    defaultRemaps.map((remap) => ({ ...remap, events: 0 }))
  ).map((row) => ({
    from: row.from,
    to: (normalizeActorClass(row.to) ??
      REAL_SELF_SERVE_ACTOR_CLASS) as ActorClass,
    events: Number(row.events) || 0,
  }));

  return {
    ok: true,
    policyVersion: MVP_LEARNING_POLICY_VERSION,
    environment: input.environment,
    selectOnly: true,
    inferred,
    proposedAttributionUpserts,
    proposedEventPropertyRemaps,
    notes: [
      "SELECT-only plan. No row IDs, journal text, emails, or media keys.",
      "Reclassify requires an explicit confirm command and never invents users.",
      "Unclassified remaining activity fails the MVP learning decision gate closed.",
      `visual_fixture inference uses journal content_class=${VISUAL_FIXTURE_ACTOR_CLASS}.`,
      `production_smoke inference uses journal content_class=${PRODUCTION_SMOKE_ACTOR_CLASS}.`,
    ],
  };
}

export async function loadLegacyActorClassRemapCounts(
  executor: QueryExecutor = db,
): Promise<Array<{ from: string; to: string; events: number }>> {
  const pairs = [
    { from: "self_serve", to: REAL_SELF_SERVE_ACTOR_CLASS },
    { from: "editorial", to: EDITORIAL_SEED_ACTOR_CLASS },
  ] as const;

  const results: Array<{ from: string; to: string; events: number }> = [];
  for (const pair of pairs) {
    const row = await executor
      .selectFrom("analytics_events")
      .select(sql<number>`count(*)::int`.as("events"))
      .where(sql`properties ->> 'actor_class'`, "=", pair.from)
      .executeTakeFirst();
    results.push({
      from: pair.from,
      to: pair.to,
      events: Number(row?.events) || 0,
    });
  }
  return results;
}

export async function applyMvpLearningReclassify(input: {
  executor?: QueryExecutor;
  confirm: true;
}): Promise<{
  attributionUpserts: number;
  eventRemaps: number;
}> {
  if (input.confirm !== true) {
    throw new Error("Reclassify refused without confirm: true.");
  }
  const executor = input.executor ?? db;

  // Remap legacy event property values only.
  let eventRemaps = 0;
  for (const pair of [
    { from: "self_serve", to: REAL_SELF_SERVE_ACTOR_CLASS },
    { from: "editorial", to: EDITORIAL_SEED_ACTOR_CLASS },
  ] as const) {
    const result = await sql`
      update analytics_events
      set properties = jsonb_set(properties, '{actor_class}', to_jsonb(${pair.to}::text), true),
          updated_at = now()
      where properties ->> 'actor_class' = ${pair.from}
    `.execute(executor);
    eventRemaps += Number(result.numAffectedRows ?? 0);
  }

  // Upsert attributions from content-class inference (aggregates only via SQL).
  const attributionResult = await sql`
    insert into learning_actor_attributions (user_id, actor_class, source, classified_at, created_at, updated_at)
    select
      u.id,
      case
        when exists (
          select 1 from journal_entries je
          where je.owner_user_id = u.id and je.content_class = 'visual_fixture'
        ) then 'visual_fixture'
        when exists (
          select 1 from journal_entries je
          where je.owner_user_id = u.id and je.content_class = 'production_smoke'
        ) then 'production_smoke'
        when exists (
          select 1 from journal_entries je
          where je.owner_user_id = u.id and je.content_class in ('editorial', 'catalog_fact')
        ) then 'editorial_seed'
        else 'real_self_serve'
      end as actor_class,
      'operator_plan'::text as source,
      now(),
      now(),
      now()
    from "user" u
    where exists (select 1 from journal_entries je where je.owner_user_id = u.id)
       or exists (select 1 from analytics_events ae where ae.owner_user_id = u.id)
    on conflict (user_id) do update set
      actor_class = excluded.actor_class,
      source = excluded.source,
      classified_at = excluded.classified_at,
      updated_at = excluded.updated_at
  `.execute(executor);

  // Backfill missing actor_class on events from durable attribution (no content).
  const backfillResult = await sql`
    update analytics_events as events
    set properties = jsonb_set(
          coalesce(events.properties, '{}'::jsonb),
          '{actor_class}',
          to_jsonb(attribution.actor_class),
          true
        ),
        updated_at = now()
    from learning_actor_attributions as attribution
    where attribution.user_id = events.owner_user_id
      and (
        events.properties ->> 'actor_class' is null
        or events.properties ->> 'actor_class' = ''
      )
  `.execute(executor);

  // Orphaned events (no matching auth user) cannot invent identities; classify as automated_bot.
  const orphanResult = await sql`
    update analytics_events as events
    set properties = jsonb_set(
          coalesce(events.properties, '{}'::jsonb),
          '{actor_class}',
          to_jsonb('automated_bot'::text),
          true
        ),
        updated_at = now()
    where (
      events.properties ->> 'actor_class' is null
      or events.properties ->> 'actor_class' = ''
    )
    and not exists (
      select 1 from "user" as auth_user where auth_user.id = events.owner_user_id
    )
  `.execute(executor);

  return {
    attributionUpserts: Number(attributionResult.numAffectedRows ?? 0),
    eventRemaps:
      eventRemaps +
      Number(backfillResult.numAffectedRows ?? 0) +
      Number(orphanResult.numAffectedRows ?? 0),
  };
}
