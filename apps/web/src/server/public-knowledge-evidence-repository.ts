import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";
import type { Database } from "@/db/schema";
import { buildPublicJournalDirectoryHref } from "@/lib/public-journal-directory-navigation";
import {
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  normalizePublicJournalDirectoryEntryIds,
  PUBLIC_JOURNAL_DIRECTORY_SELECTABLE_CATALOG_STATUSES,
} from "@/server/public-journal-directory-query";
import {
  listPublicJournalDirectoryPage,
  normalizePublicJournalDirectoryRequest,
  type PublicJournalDirectoryCard,
  type PublicJournalDirectoryPage,
} from "@/server/public-journal-directory-repository";
import type { PublicKnowledgeEvidenceRule } from "@/server/public-seo-content";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{1,127}$/;
const MAX_RULE_SLUGS = 12;
const MAX_MATCHING_ENTRY_IDS = 100;
export const PUBLIC_KNOWLEDGE_VISIBLE_EVIDENCE_LIMIT = 3;

export interface PublicKnowledgeEvidenceMatch {
  kind: "topic" | "catalog";
  slug: string;
  label: string;
  publicPath: string;
}

export interface PublicKnowledgeEvidenceItem {
  card: PublicJournalDirectoryCard;
  matches: PublicKnowledgeEvidenceMatch[];
}

export interface PublicKnowledgeEvidence {
  items: PublicKnowledgeEvidenceItem[];
  totalCount: number;
  hasMore: boolean;
  allEvidencePath: string;
}

export interface PublicKnowledgeEvidenceOptions {
  executor?: QueryExecutor;
  restrictToEntryIds?: readonly string[] | null;
  visibleLimit?: number;
  visualCorpus?: boolean;
}

export async function listPublicKnowledgeEvidence(
  rule: PublicKnowledgeEvidenceRule,
  locale: PublicLocale,
  options: PublicKnowledgeEvidenceOptions = {},
): Promise<PublicKnowledgeEvidence> {
  const executor = options.executor ?? db;
  const normalizedRule = normalizePublicKnowledgeEvidenceRule(rule);
  const rows = await buildPublicKnowledgeEvidenceEntryIdsQuery(
    executor,
    normalizedRule,
    options.restrictToEntryIds,
  ).execute();
  const request = normalizePublicJournalDirectoryRequest({});

  if (rows.length === 0) {
    return serializePublicKnowledgeEvidence(
      emptyDirectoryPage(request),
      normalizedRule,
      locale,
      options.visibleLimit,
      options.visualCorpus,
    );
  }

  const page = await listPublicJournalDirectoryPage(request, locale, {
    executor,
    restrictToEntryIds: rows.map((row) => row.entryId),
  });

  return serializePublicKnowledgeEvidence(
    page,
    normalizedRule,
    locale,
    options.visibleLimit,
    options.visualCorpus,
  );
}

export function buildPublicKnowledgeEvidenceEntryIdsQuery(
  executor: QueryExecutor,
  rule: PublicKnowledgeEvidenceRule,
  restrictToEntryIds?: readonly string[] | null,
) {
  const normalizedRule = normalizePublicKnowledgeEvidenceRule(rule);
  let query = executor
    .selectFrom("journal_entries")
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
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.status", "in", [
          ...PUBLIC_JOURNAL_DIRECTORY_SELECTABLE_CATALOG_STATUSES,
        ])
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "journal_entries.id as entryId",
      "plant_objects.id as objectId",
      "journal_entries.published_at as publishedAt",
    ])
    .distinct()
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where(publicLaunchSurfacePredicates())
    .where("journal_entries.published_at", "is not", null)
    .$narrowType<{ entryId: string; objectId: string; publishedAt: Date }>();

  const hasTopics = normalizedRule.topicSlugs.length > 0;
  const hasCatalogs = normalizedRule.catalogSlugs.length > 0;
  if (hasTopics && hasCatalogs) {
    query = query.where(({ eb, exists, or, selectFrom }) =>
      or([
        eb("catalog_items.public_slug", "in", normalizedRule.catalogSlugs),
        exists(
          selectFrom("journal_entry_topic_signals")
            .innerJoin(
              "journal_topics",
              "journal_topics.id",
              "journal_entry_topic_signals.topic_id",
            )
            .select(sql<number>`1`.as("membership"))
            .whereRef(
              "journal_entry_topic_signals.journal_entry_id",
              "=",
              "journal_entries.id",
            )
            .where("journal_topics.slug", "in", normalizedRule.topicSlugs)
            .where("journal_topics.trust_state", "=", "curated")
            .where("journal_entry_topic_signals.review_state", "=", "accepted")
            .where(
              "journal_entry_topic_signals.public_membership_state",
              "=",
              "eligible",
            ),
        ),
      ]),
    );
  } else if (hasTopics) {
    query = query.where(({ exists, selectFrom }) =>
      exists(
        selectFrom("journal_entry_topic_signals")
          .innerJoin(
            "journal_topics",
            "journal_topics.id",
            "journal_entry_topic_signals.topic_id",
          )
          .select(sql<number>`1`.as("membership"))
          .whereRef(
            "journal_entry_topic_signals.journal_entry_id",
            "=",
            "journal_entries.id",
          )
          .where("journal_topics.slug", "in", normalizedRule.topicSlugs)
          .where("journal_topics.trust_state", "=", "curated")
          .where("journal_entry_topic_signals.review_state", "=", "accepted")
          .where(
            "journal_entry_topic_signals.public_membership_state",
            "=",
            "eligible",
          ),
      ),
    );
  } else if (hasCatalogs) {
    query = query.where(
      "catalog_items.public_slug",
      "in",
      normalizedRule.catalogSlugs,
    );
  } else {
    query = query.where(sql<boolean>`false`);
  }

  const restrictedIds =
    normalizePublicJournalDirectoryEntryIds(restrictToEntryIds);
  if (restrictedIds) {
    query = restrictedIds.length
      ? query.where("journal_entries.id", "in", restrictedIds)
      : query.where(sql<boolean>`false`);
  }

  return query
    .orderBy("journal_entries.published_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(MAX_MATCHING_ENTRY_IDS);
}

export function serializePublicKnowledgeEvidence(
  page: PublicJournalDirectoryPage,
  rule: PublicKnowledgeEvidenceRule,
  locale: PublicLocale,
  visibleLimit = PUBLIC_KNOWLEDGE_VISIBLE_EVIDENCE_LIMIT,
  visualCorpus = false,
): PublicKnowledgeEvidence {
  const normalizedRule = normalizePublicKnowledgeEvidenceRule(rule);
  const limit = Math.min(Math.max(Math.trunc(visibleLimit), 1), 8);
  const items = page.cards.slice(0, limit).map((card) => ({
    card,
    matches: matchesForCard(card, normalizedRule, locale, visualCorpus),
  }));

  return {
    items,
    totalCount: page.totalCount,
    hasMore: page.totalCount > items.length,
    allEvidencePath: evidenceDirectoryPath(
      locale,
      normalizedRule,
      visualCorpus,
    ),
  };
}

export function normalizePublicKnowledgeEvidenceRule(
  rule: PublicKnowledgeEvidenceRule,
): PublicKnowledgeEvidenceRule {
  return {
    topicSlugs: normalizeSlugs(rule.topicSlugs),
    catalogSlugs: normalizeSlugs(rule.catalogSlugs),
  };
}

function matchesForCard(
  card: PublicJournalDirectoryCard,
  rule: PublicKnowledgeEvidenceRule,
  locale: PublicLocale,
  visualCorpus: boolean,
) {
  const matches: PublicKnowledgeEvidenceMatch[] = card.topics
    .filter((topic) => rule.topicSlugs.includes(topic.slug))
    .map((topic) => ({
      kind: "topic" as const,
      slug: topic.slug,
      label: topic.label,
      publicPath: topicPath(locale, topic.slug, visualCorpus),
    }));

  if (
    card.object.catalogSlug &&
    card.object.identityLabel &&
    card.object.catalogPath &&
    rule.catalogSlugs.includes(card.object.catalogSlug)
  ) {
    matches.push({
      kind: "catalog",
      slug: card.object.catalogSlug,
      label: card.object.identityLabel,
      publicPath: card.object.catalogPath,
    });
  }

  return matches;
}

function topicPath(
  locale: PublicLocale,
  slug: string,
  visualCorpus: boolean,
) {
  const path = localizedPath(locale, `/topics/${slug}`);
  return visualCorpus
    ? `${path}?${new URLSearchParams({ __visualKnowledge: "corpus" })}`
    : path;
}

function evidenceDirectoryPath(
  locale: PublicLocale,
  rule: PublicKnowledgeEvidenceRule,
  visualCorpus: boolean,
) {
  const request = normalizePublicJournalDirectoryRequest({
    topic: rule.topicSlugs[0],
    catalog: rule.topicSlugs.length === 0 ? rule.catalogSlugs[0] : undefined,
  });
  return buildPublicJournalDirectoryHref(locale, request, visualCorpus);
}

function normalizeSlugs(values: readonly string[]) {
  return [
    ...new Set(values.map((value) => value.trim().toLocaleLowerCase("en"))),
  ]
    .filter((value) => SAFE_SLUG.test(value))
    .slice(0, MAX_RULE_SLUGS);
}

function emptyDirectoryPage(
  request: ReturnType<typeof normalizePublicJournalDirectoryRequest>,
): PublicJournalDirectoryPage {
  return {
    request,
    cards: [],
    totalCount: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
    searchSource: "database",
    searchFallbackReason: null,
  };
}
