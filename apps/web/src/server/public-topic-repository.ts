import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import { isAddressSlug } from "@/lib/address/address-contract.generated";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";
import type { Database, PlantObjectKind } from "@/db/schema";
import type { PublicProjectionQualityClass } from "@/lib/public-projection-quality";
import { normalizePublicObjectKindFilter } from "@/lib/garden/catalog-object-kind";
import {
  legacyPublicJournalEntryPath,
  publicTopicPath,
} from "@/lib/garden/public-paths";
import {
  DEFAULT_PUBLIC_LOCALE,
  PUBLIC_LOCALES,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { normalizePublicJournalDirectoryEntryIds } from "@/server/public-journal-directory-query";
import type { PublicSurfaceIndexState } from "@/server/public-surface-indexing-policy";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  type PublicSurfaceDiscoveryConsumerId,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface PublicTopicEntry {
  id: string;
  objectId: string;
  title: string;
  bodyPreview: string;
  entryDate: Date | string;
  publishedAt: Date | string;
  publicPath: string;
}

export interface PublicTopicAggregationPage {
  topic: { slug: string; label: string };
  entryCount: number;
  aggregateBodyLength: number;
  latestPublishedAt: Date | string | null;
  qualityClass?: PublicProjectionQualityClass;
  indexState: PublicSurfaceIndexState;
  entries: PublicTopicEntry[];
}

export interface PublicKnowledgeTopic {
  slug: string;
  label: string;
  entryCount: number;
  aggregateBodyLength: number;
  latestPublishedAt: Date | string | null;
  objectKinds: PlantObjectKind[];
  indexState: PublicSurfaceIndexState;
}

export interface PublicTopicRepositoryOptions {
  executor?: QueryExecutor;
  locale?: PublicLocale;
  restrictToEntryIds?: readonly string[] | null;
  restrictToTopicSlugs?: readonly string[] | null;
}

interface TopicRow {
  slug: string;
  label: string;
}

interface TopicStatsRow {
  slug: string;
  entryCount: number | string | bigint;
  aggregateBodyLength: number | string | bigint;
  latestPublishedAt: Date | string | null;
}

interface TopicKindRow {
  slug: string;
  kind: string;
  count: number | string | bigint;
}

export interface PublicTopicEntryRow {
  id: string;
  objectId: string;
  title: string;
  body: string;
  entryDate: Date | string;
  publishedAt: Date | string | null;
  publicSlug: string | null;
}

export async function getPublicTopicAggregationPage(
  slug: string,
  options: PublicTopicRepositoryOptions = {},
): Promise<PublicTopicAggregationPage | null> {
  const normalizedSlug = normalizePublicTopicSlug(slug);
  if (!normalizedSlug) return null;
  const executor = options.executor ?? db;
  const topic = await buildPublicTopicLookupQuery(
    executor,
    normalizedSlug,
  ).executeTakeFirst();
  if (!topic) return null;

  const stats = await buildPublicTopicAggregationStatsQuery(
    executor,
    normalizedSlug,
    options.restrictToEntryIds,
  ).executeTakeFirst();
  const entryCount = Number(stats?.entryCount ?? 0);
  const aggregateBodyLength = Number(stats?.aggregateBodyLength ?? 0);
  const entries = await buildPublicTopicAggregationEntriesQuery(
    executor,
    normalizedSlug,
    options.restrictToEntryIds,
  ).execute();

  const page = {
    topic: { slug: topic.slug, label: topic.label },
    entryCount,
    aggregateBodyLength,
    latestPublishedAt: stats?.latestPublishedAt ?? null,
    qualityClass: "verified" as const,
    entries: serializePublicTopicEntries(entries),
  } satisfies Omit<PublicTopicAggregationPage, "indexState">;
  return {
    ...page,
    indexState: resolvePublicSurfaceDiscoveryForRequest(
      buildPublicTopicDiscoverySource(page, "public_topic_repository"),
    ).decision,
  };
}

export async function listPublicKnowledgeTopics(
  options: PublicTopicRepositoryOptions = {},
): Promise<PublicKnowledgeTopic[]> {
  const executor = options.executor ?? db;
  const [topics, stats, kinds] = await Promise.all([
    buildPublicTopicListQuery(executor, options.restrictToTopicSlugs).execute(),
    buildPublicTopicStatsListQuery(
      executor,
      options.restrictToEntryIds,
    ).execute(),
    buildPublicTopicKindsQuery(executor, options.restrictToEntryIds).execute(),
  ]);

  return serializePublicKnowledgeTopics(topics, stats, kinds);
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

export function buildPublicTopicListQuery(
  executor: QueryExecutor,
  restrictToTopicSlugs?: readonly string[] | null,
) {
  let query = executor
    .selectFrom("journal_topics")
    .select(["slug", "label"])
    .where("trust_state", "=", "curated");
  const normalizedSlugs = normalizePublicTopicSlugs(restrictToTopicSlugs);
  if (normalizedSlugs) {
    query = normalizedSlugs.length
      ? query.where("slug", "in", normalizedSlugs)
      : query.where(sql<boolean>`false`);
  }

  return query.orderBy("label", "asc").limit(24);
}

export function buildPublicTopicAggregationStatsQuery(
  executor: QueryExecutor,
  slug: string,
  restrictToEntryIds?: readonly string[] | null,
) {
  return buildPublicTopicMembershipBaseQuery(
    executor,
    slug,
    restrictToEntryIds,
  ).select(() => [
    sql<number>`count(distinct ${sql.ref("journal_entries.id")})`.as(
      "entryCount",
    ),
    sql<number>`coalesce(sum(char_length(${sql.ref("journal_entries.body")})), 0)`.as(
      "aggregateBodyLength",
    ),
    sql<
      Date | string | null
    >`max(${sql.ref("journal_entries.published_at")})`.as("latestPublishedAt"),
  ]);
}

export function buildPublicTopicStatsListQuery(
  executor: QueryExecutor,
  restrictToEntryIds?: readonly string[] | null,
) {
  return buildPublicTopicMembershipBaseQuery(executor, null, restrictToEntryIds)
    .select([
      "journal_topics.slug as slug",
      sql<number>`count(distinct ${sql.ref("journal_entries.id")})`.as(
        "entryCount",
      ),
      sql<number>`coalesce(sum(char_length(${sql.ref("journal_entries.body")})), 0)`.as(
        "aggregateBodyLength",
      ),
      sql<
        Date | string | null
      >`max(${sql.ref("journal_entries.published_at")})`.as(
        "latestPublishedAt",
      ),
    ])
    .groupBy("journal_topics.slug");
}

export function buildPublicTopicKindsQuery(
  executor: QueryExecutor,
  restrictToEntryIds?: readonly string[] | null,
) {
  return buildPublicTopicMembershipBaseQuery(executor, null, restrictToEntryIds)
    .select([
      "journal_topics.slug as slug",
      "plant_objects.object_kind as kind",
      sql<number>`count(distinct ${sql.ref("journal_entries.id")})`.as("count"),
    ])
    .groupBy(["journal_topics.slug", "plant_objects.object_kind"])
    .orderBy("journal_topics.slug", "asc");
}

export function buildPublicTopicAggregationEntriesQuery(
  executor: QueryExecutor,
  slug: string,
  restrictToEntryIds?: readonly string[] | null,
) {
  return buildPublicTopicMembershipBaseQuery(executor, slug, restrictToEntryIds)
    .select([
      "journal_entries.id as id",
      "plant_objects.id as objectId",
      "journal_entries.title as title",
      "journal_entries.body as body",
      "journal_entries.entry_date as entryDate",
      "journal_entries.published_at as publishedAt",
      "journal_entries.public_slug as publicSlug",
    ])
    .orderBy("journal_entries.published_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(12);
}

export function serializePublicTopicEntries(
  rows: readonly PublicTopicEntryRow[],
): PublicTopicEntry[] {
  return rows.flatMap((entry) =>
    entry.publicSlug && entry.publishedAt
      ? [
          {
            id: entry.id,
            objectId: entry.objectId,
            title: entry.title,
            bodyPreview: publicTopicBodyPreview(entry.body),
            entryDate: entry.entryDate,
            publishedAt: entry.publishedAt,
            // A topic gathers entries from every gardener, and this row
            // carries no handle. The legacy address 308s to the canonical one.
            publicPath: legacyPublicJournalEntryPath(entry.publicSlug),
          },
        ]
      : [],
  );
}

export function serializePublicKnowledgeTopics(
  topicRows: readonly TopicRow[],
  statsRows: readonly TopicStatsRow[],
  kindRows: readonly TopicKindRow[],
): PublicKnowledgeTopic[] {
  const statsBySlug = new Map(statsRows.map((row) => [row.slug, row]));
  const kindsBySlug = Object.groupBy(kindRows, (row) => row.slug);

  return topicRows.map((topic) => {
    const stats = statsBySlug.get(topic.slug);
    const entryCount = Number(stats?.entryCount ?? 0);
    const aggregateBodyLength = Number(stats?.aggregateBodyLength ?? 0);
    const objectKindSet = new Set<PlantObjectKind>();
    for (const row of kindsBySlug[topic.slug] ?? []) {
      const kind = normalizePublicObjectKindFilter(row.kind);
      if (kind) objectKindSet.add(kind);
    }
    const objectKinds = (["plant", "animal"] as const).filter((kind) =>
      objectKindSet.has(kind),
    );

    return {
      slug: topic.slug,
      label: topic.label,
      entryCount,
      aggregateBodyLength,
      latestPublishedAt: stats?.latestPublishedAt ?? null,
      objectKinds,
      indexState: resolvePublicSurfaceDiscoveryForRequest({
        consumerId: "public_topic_repository",
        candidateState: "candidate",
        visibleText: entryCount > 0 ? [topic.label] : [],
        distinctPublicEntityIds:
          entryCount > 0 ? [`topic:${topic.slug}`] : [],
        canonicalPath: publicTopicPath(topic.slug),
        equivalentLocales: [...PUBLIC_LOCALES],
      }).decision,
    };
  });
}

export function buildPublicTopicDiscoverySource(
  page: Omit<PublicTopicAggregationPage, "indexState">,
  consumerId: Extract<
    PublicSurfaceDiscoveryConsumerId,
    "localized_topic" | "topic_sitemap" | "public_topic_repository"
  >,
  candidateState: "candidate" | "not_public_candidate" = "candidate",
  routeLocale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): PublicSurfaceDiscoverySource {
  return {
    consumerId,
    candidateState,
    visibleText:
      page.entries.length > 0
        ? [
            page.topic.label,
            ...page.entries.flatMap((entry) => [
              entry.title,
              entry.bodyPreview,
            ]),
          ]
        : [],
    distinctPublicEntityIds:
      page.entries.length > 0
        ? [
            `topic:${page.topic.slug}`,
            ...page.entries.flatMap((entry) => [entry.id, entry.objectId]),
          ]
        : [],
    // A topic page's own content is its chrome — the label, the headings, the
    // counts — and that is translated, so the page genuinely exists in three
    // languages and each is its own canonical (ADR-0029 D10). The entries it
    // lists are not translated, and are not meant to be: `hreflang` is for
    // pages carrying the same content in different languages, which is exactly
    // what translated chrome over one shared list is.
    canonicalPath: localizedPath(routeLocale, publicTopicPath(page.topic.slug)),
    equivalentLocales: [...PUBLIC_LOCALES],
  };
}

function publicTopicBodyPreview(body: string) {
  const normalized = body.replace(/\s+/gu, " ").trim();
  return normalized.length <= 360
    ? normalized
    : `${normalized.slice(0, 357).trimEnd()}...`;
}

function buildPublicTopicMembershipBaseQuery(
  executor: QueryExecutor,
  slug: string | null,
  restrictToEntryIds?: readonly string[] | null,
) {
  let query = executor
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
    .innerJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .innerJoin("spaces", (join) =>
      join
        .onRef("spaces.id", "=", "journal_entries.space_id")
        .onRef("spaces.owner_user_id", "=", "journal_entries.owner_user_id"),
    )
    .where("journal_topics.trust_state", "=", "curated")
    .where("journal_entry_topic_signals.review_state", "=", "accepted")
    .where(
      "journal_entry_topic_signals.public_membership_state",
      "=",
      "eligible",
    )
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .where(publicLaunchSurfacePredicates());

  if (slug) query = query.where("journal_topics.slug", "=", slug);

  const restrictedIds =
    normalizePublicJournalDirectoryEntryIds(restrictToEntryIds);
  if (restrictedIds) {
    query = restrictedIds.length
      ? query.where("journal_entries.id", "in", restrictedIds)
      : query.where(sql<boolean>`false`);
  }

  return query;
}

/**
 * A topic slug as the manifest defines it, or `null`.
 *
 * This restated `^[a-z0-9][a-z0-9-]{1,63}$` — the pattern the column carried
 * before `OVE-426` widened it — so `помідори` would have failed to resolve its
 * own page the day the first Cyrillic topic existed. The guard is the
 * generated one now, which is the same shape the `CHECK` enforces.
 */
function normalizePublicTopicSlug(value: string) {
  const normalized = value.trim().toLocaleLowerCase("uk");
  return isAddressSlug("topic", normalized) ? normalized : null;
}

/**
 * Whether a topic exists at all, for the proxy's bounded lookup.
 *
 * Deliberately not `getPublicTopicAggregationPage`: that reads the topic, its
 * statistics and its entries, and the proxy only needs to know whether the
 * address resolves. One indexed lookup by slug, before any shell streams.
 */
export async function getPublicTopicLifecycleLookup(
  slug: string,
  executor: QueryExecutor = db,
) {
  const normalizedSlug = normalizePublicTopicSlug(slug);
  if (!normalizedSlug) return { status: "not_found" as const };
  const topic = await buildPublicTopicLookupQuery(
    executor,
    normalizedSlug,
  ).executeTakeFirst();
  return topic
    ? { status: "found" as const, slug: topic.slug }
    : { status: "not_found" as const };
}

function normalizePublicTopicSlugs(values?: readonly string[] | null) {
  if (values === undefined || values === null) return null;
  return [
    ...new Set(
      values.flatMap((value) => normalizePublicTopicSlug(value) ?? []),
    ),
  ].slice(0, 24);
}
