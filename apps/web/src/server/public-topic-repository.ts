import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import {
  evaluatePublicSurfaceIndexability,
  type PublicSurfaceIndexState,
} from "@/server/public-surface-indexing-policy";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface PublicTopicEntry {
  id: string;
  title: string;
  entryDate: Date | string;
  publicPath: string;
}

export interface PublicTopicAggregationPage {
  topic: {
    slug: string;
    label: string;
  };
  entryCount: number;
  aggregateBodyLength: number;
  indexState: PublicSurfaceIndexState;
  entries: PublicTopicEntry[];
}

export async function getPublicTopicAggregationPage(
  slug: string,
  executor: QueryExecutor = db,
): Promise<PublicTopicAggregationPage | null> {
  const normalizedSlug = normalizePublicTopicSlug(slug);
  if (!normalizedSlug) return null;

  const topic = await buildPublicTopicLookupQuery(
    executor,
    normalizedSlug,
  ).executeTakeFirst();
  if (!topic) return null;

  const stats = await buildPublicTopicAggregationStatsQuery(
    executor,
    normalizedSlug,
  ).executeTakeFirst();
  const entryCount = Number(stats?.entryCount ?? 0);
  const aggregateBodyLength = Number(stats?.aggregateBodyLength ?? 0);
  const entries = await buildPublicTopicAggregationEntriesQuery(
    executor,
    normalizedSlug,
  ).execute();

  return {
    topic: {
      slug: topic.slug,
      label: topic.label,
    },
    entryCount,
    aggregateBodyLength,
    indexState: evaluatePublicSurfaceIndexability({
      kind: "topic_aggregation",
      entryCount,
      aggregateBodyLength,
      topicTrust: "curated",
    }),
    entries: entries.flatMap((entry) =>
      entry.publicSlug
        ? [
            {
              id: entry.id,
              title: entry.title,
              entryDate: entry.entryDate,
              publicPath: publicJournalEntryPath(entry.publicSlug),
            },
          ]
        : [],
    ),
  };
}

export function buildPublicTopicLookupQuery(
  executor: QueryExecutor,
  slug: string,
) {
  return executor
    .selectFrom("journal_topics")
    .select(["slug", "label"])
    .where("slug", "=", slug)
    .where("trust_state", "=", "curated");
}

export function buildPublicTopicAggregationStatsQuery(
  executor: QueryExecutor,
  slug: string,
) {
  return buildPublicTopicMembershipBaseQuery(executor, slug).select(() => [
    sql<number>`count(distinct ${sql.ref("journal_entries.id")})`.as(
      "entryCount",
    ),
    sql<number>`coalesce(sum(char_length(${sql.ref("journal_entries.body")})), 0)`.as(
      "aggregateBodyLength",
    ),
  ]);
}

export function buildPublicTopicAggregationEntriesQuery(
  executor: QueryExecutor,
  slug: string,
) {
  return buildPublicTopicMembershipBaseQuery(executor, slug)
    .select([
      "journal_entries.id as id",
      "journal_entries.title as title",
      "journal_entries.entry_date as entryDate",
      "journal_entries.public_slug as publicSlug",
    ])
    .orderBy("journal_entries.published_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(12);
}

function buildPublicTopicMembershipBaseQuery(
  executor: QueryExecutor,
  slug: string,
) {
  return executor
    .selectFrom("journal_entry_topic_signals")
    .innerJoin(
      "journal_topics",
      "journal_topics.id",
      "journal_entry_topic_signals.topic_id",
    )
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "journal_entry_topic_signals.journal_entry_id",
    )
    .where("journal_topics.slug", "=", slug)
    .where("journal_topics.trust_state", "=", "curated")
    .where("journal_entry_topic_signals.review_state", "=", "accepted")
    .where(
      "journal_entry_topic_signals.public_membership_state",
      "=",
      "eligible",
    )
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null);
}

function normalizePublicTopicSlug(value: string) {
  const normalized = value.trim().toLocaleLowerCase("en");
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized)) return null;
  return normalized;
}
