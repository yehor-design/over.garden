import "server-only";

import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import type {
  CatalogKind,
  Database,
  JournalEntryTopicPublicMembershipState,
  JournalEntryTopicReviewState,
  JournalEntryTopicSignalSource,
  JournalTopic,
  JournalTopicTrustState,
  PlantObjectKind,
} from "@/db/schema";
import { addressManifestEntry } from "@/lib/address/address-manifest";
import { isAddressSlug } from "@/lib/address/address-contract.generated";
import { slugify } from "@/lib/address/slugify";
import { normalizeJournalTopicTagLabels } from "@/lib/garden/journal-topics";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import type { RequestScope } from "@/server/request-scope";
import { catalogKindSql } from "@/server/catalog-kind-sql";

const TOPIC = addressManifestEntry("topic");

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const AUTOMATIC_TOPIC_SIGNAL_SOURCES = [
  "object_kind",
  "catalog_node_kind",
  "catalog_mention",
] as const satisfies readonly JournalEntryTopicSignalSource[];

interface TopicDefinition {
  slug: string;
  label: string;
  trustState: JournalTopicTrustState;
  /**
   * A gardener's own tag joins the topic that already carries its label,
   * whatever that topic's address is spelled like. Absent for a topic whose
   * slug an editor or the code chose: those are found by that slug.
   */
  joinByLabel?: boolean;
}

interface TopicSignalCandidate {
  topic: TopicDefinition;
  source: JournalEntryTopicSignalSource;
}

export interface PersistJournalEntryTopicSignalsInput {
  journalEntryId: string;
  explicitTagLabels?: unknown;
}

export interface RefreshPlantObjectTopicSignalsInput {
  plantObjectId: string;
}

export interface UpsertOperatorCuratedTopicSignalInput {
  journalEntryId: string;
  topicSlug: string;
  topicLabel: string;
}

export async function persistJournalEntryTopicSignals(
  executor: QueryExecutor,
  scope: RequestScope,
  input: PersistJournalEntryTopicSignalsInput,
) {
  const entry = await buildJournalEntryForTopicSignalsQuery(
    executor,
    scope,
    input.journalEntryId,
  ).executeTakeFirst();

  if (!entry) {
    throw new Error("Journal entry was not found in this garden.");
  }

  await buildDeleteAutomaticTopicSignalsForEntryQuery(
    executor,
    entry.id,
  ).execute();

  const candidates = await buildTopicSignalCandidates(
    executor,
    scope,
    entry.id,
    input.explicitTagLabels,
    normalizeTopicLanguage(entry.sourceLanguage),
  );

  await upsertTopicSignals(executor, entry.id, candidates);
}

export async function refreshJournalEntryTopicSignalsForPlantObject(
  executor: QueryExecutor,
  scope: RequestScope,
  input: RefreshPlantObjectTopicSignalsInput,
) {
  const entryRows = await buildJournalEntryIdsForPlantObjectTopicRefreshQuery(
    executor,
    scope,
    input.plantObjectId,
  ).execute();

  for (const row of entryRows) {
    await persistJournalEntryTopicSignals(executor, scope, {
      journalEntryId: row.journalEntryId,
      explicitTagLabels: [],
    });
  }
}

export async function upsertOperatorCuratedTopicSignal(
  executor: QueryExecutor,
  scope: RequestScope,
  input: UpsertOperatorCuratedTopicSignalInput,
) {
  const entry = await buildJournalEntryForTopicSignalsQuery(
    executor,
    scope,
    input.journalEntryId,
  ).executeTakeFirst();

  if (!entry) {
    throw new Error("Journal entry was not found in this garden.");
  }

  const topic = await ensureJournalTopic(executor, {
    slug: normalizeCuratedTopicSlug(input.topicSlug),
    label: normalizeCuratedTopicLabel(input.topicLabel),
    trustState: "curated",
  });

  await buildUpsertJournalEntryTopicSignalQuery(executor, {
    journalEntryId: entry.id,
    topicId: topic.id,
    source: "operator_curated",
    reviewState: "accepted",
    publicMembershipState: "eligible",
    now: new Date(),
  }).execute();
}

export function buildJournalEntryForTopicSignalsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  journalEntryId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select(["id", "space_id as spaceId", "source_language as sourceLanguage"])
    .where("id", "=", journalEntryId)
    .where("owner_user_id", "=", scope.userId);
}

export function buildDirectObjectTopicContextQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  journalEntryId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .innerJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        )
        .onRef("plant_objects.space_id", "=", "journal_entries.space_id"),
    )
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.created_by_user_id", "is", null)
        .on("catalog_items.identity_state", "=", "active"),
    )
    .select([
      "plant_objects.object_kind as objectKind",
      catalogKindSql("catalog_items").as("catalogKind"),
    ])
    .where("journal_entries.id", "=", journalEntryId)
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where("journal_entries.entry_scope", "=", "object");
}

export function buildMentionedObjectTopicContextQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  journalEntryId: string,
) {
  return executor
    .selectFrom("journal_entry_object_mentions")
    .innerJoin("plant_objects", (join) =>
      join
        .onRef(
          "plant_objects.id",
          "=",
          "journal_entry_object_mentions.plant_object_id",
        )
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entry_object_mentions.owner_user_id",
        )
        .onRef(
          "plant_objects.space_id",
          "=",
          "journal_entry_object_mentions.space_id",
        ),
    )
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.created_by_user_id", "is", null)
        .on("catalog_items.identity_state", "=", "active"),
    )
    .select([
      "plant_objects.object_kind as objectKind",
      catalogKindSql("catalog_items").as("catalogKind"),
    ])
    .where("journal_entry_object_mentions.journal_entry_id", "=", journalEntryId)
    .where("journal_entry_object_mentions.owner_user_id", "=", scope.userId);
}

export function buildCatalogMentionTopicContextQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  journalEntryId: string,
) {
  return executor
    .selectFrom("journal_entry_catalog_mentions")
    .innerJoin("catalog_items", (join) =>
      join
        .onRef(
          "catalog_items.id",
          "=",
          "journal_entry_catalog_mentions.catalog_item_id",
        )
        .on("catalog_items.created_by_user_id", "is", null)
        .on("catalog_items.identity_state", "=", "active"),
    )
    .select(catalogKindSql("catalog_items").as("catalogKind"))
    .where("journal_entry_catalog_mentions.journal_entry_id", "=", journalEntryId)
    .where("journal_entry_catalog_mentions.owner_user_id", "=", scope.userId);
}

export function buildDeleteAutomaticTopicSignalsForEntryQuery(
  executor: QueryExecutor,
  journalEntryId: string,
) {
  return executor
    .deleteFrom("journal_entry_topic_signals")
    .where("journal_entry_id", "=", journalEntryId)
    .where("signal_source", "in", [...AUTOMATIC_TOPIC_SIGNAL_SOURCES]);
}

export function buildJournalEntryIdsForPlantObjectTopicRefreshQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .leftJoin("journal_entry_object_mentions", (join) =>
      join
        .onRef(
          "journal_entry_object_mentions.journal_entry_id",
          "=",
          "journal_entries.id",
        )
        .on("journal_entry_object_mentions.owner_user_id", "=", scope.userId)
        .on(
          "journal_entry_object_mentions.plant_object_id",
          "=",
          plantObjectId,
        ),
    )
    .select("journal_entries.id as journalEntryId")
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("journal_entries.entry_scope", "=", "object"),
          eb("journal_entries.plant_object_id", "=", plantObjectId),
        ]),
        eb.and([
          eb("journal_entries.entry_scope", "=", "space"),
          eb(
            "journal_entry_object_mentions.plant_object_id",
            "=",
            plantObjectId,
          ),
        ]),
      ]),
    )
    .orderBy("journal_entries.created_at", "asc");
}

export function buildFindJournalTopicBySlugQuery(
  executor: QueryExecutor,
  slug: string,
) {
  return executor
    .selectFrom("journal_topics")
    .selectAll("journal_topics")
    .where("slug", "=", slug);
}

/**
 * The topic that already carries a label, however its address is spelled.
 * Case-insensitive, the way `normalizeJournalTopicTagLabels` dedupes a
 * gardener's own list; the oldest wins, so the answer is stable when two
 * topics share a label from before this lookup existed.
 */
export function buildFindJournalTopicByLabelQuery(
  executor: QueryExecutor,
  label: string,
) {
  return executor
    .selectFrom("journal_topics")
    .selectAll("journal_topics")
    .where(sql<boolean>`lower(${sql.ref("label")}) = lower(${label})`)
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .limit(1);
}

export function buildInsertJournalTopicQuery(
  executor: QueryExecutor,
  input: TopicDefinition,
) {
  return executor
    .insertInto("journal_topics")
    .values({
      slug: input.slug,
      label: input.label,
      trust_state: input.trustState,
    })
    .onConflict((oc) => oc.column("slug").doNothing())
    .returningAll();
}

export function buildUpgradeJournalTopicTrustQuery(
  executor: QueryExecutor,
  input: TopicDefinition,
) {
  return executor
    .updateTable("journal_topics")
    .set({
      label: input.label,
      trust_state: input.trustState,
      updated_at: new Date(),
    })
    .where("slug", "=", input.slug)
    .where("trust_state", "!=", "curated")
    .returningAll();
}

export function buildUpsertJournalEntryTopicSignalQuery(
  executor: QueryExecutor,
  input: {
    journalEntryId: string;
    topicId: string;
    source: JournalEntryTopicSignalSource;
    reviewState: JournalEntryTopicReviewState;
    publicMembershipState: JournalEntryTopicPublicMembershipState;
    now: Date;
  },
) {
  return executor
    .insertInto("journal_entry_topic_signals")
    .values({
      journal_entry_id: input.journalEntryId,
      topic_id: input.topicId,
      signal_source: input.source,
      review_state: input.reviewState,
      public_membership_state: input.publicMembershipState,
      updated_at: input.now,
    })
    .onConflict((oc) =>
      oc
        .columns(["journal_entry_id", "topic_id", "signal_source"])
        .doUpdateSet({
          review_state: input.reviewState,
          public_membership_state: input.publicMembershipState,
          updated_at: input.now,
        }),
    )
    .returningAll();
}

async function buildTopicSignalCandidates(
  executor: QueryExecutor,
  scope: RequestScope,
  journalEntryId: string,
  explicitTagLabels: unknown,
  language: PublicLocale,
): Promise<TopicSignalCandidate[]> {
  const candidates: TopicSignalCandidate[] = normalizeJournalTopicTagLabels(
    explicitTagLabels,
  ).map((label) => ({
    topic: explicitTagTopicDefinition(label, language),
    source: "explicit_tag",
  }));

  const directRows = await buildDirectObjectTopicContextQuery(
    executor,
    scope,
    journalEntryId,
  ).execute();
  const mentionedRows = await buildMentionedObjectTopicContextQuery(
    executor,
    scope,
    journalEntryId,
  ).execute();
  const catalogMentionRows = await buildCatalogMentionTopicContextQuery(
    executor,
    scope,
    journalEntryId,
  ).execute();

  for (const row of [...directRows, ...mentionedRows]) {
    const objectTopic = topicDefinitionForObjectKind(row.objectKind);
    if (objectTopic) {
      candidates.push({ topic: objectTopic, source: "object_kind" });
    }

    const catalogTopic = topicDefinitionForCatalogKind(row.catalogKind);
    if (catalogTopic) {
      candidates.push({ topic: catalogTopic, source: "catalog_node_kind" });
    }
  }

  for (const row of catalogMentionRows) {
    const catalogTopic = topicDefinitionForCatalogKind(row.catalogKind);
    if (catalogTopic) {
      candidates.push({ topic: catalogTopic, source: "catalog_mention" });
    }
  }

  return dedupeCandidates(candidates);
}

async function upsertTopicSignals(
  executor: QueryExecutor,
  journalEntryId: string,
  candidates: TopicSignalCandidate[],
) {
  for (const candidate of candidates) {
    const topic = await ensureJournalTopic(executor, candidate.topic);
    const state = signalStateForTopic(topic);

    await buildUpsertJournalEntryTopicSignalQuery(executor, {
      journalEntryId,
      topicId: topic.id,
      source: candidate.source,
      reviewState: state.reviewState,
      publicMembershipState: state.publicMembershipState,
      now: new Date(),
    }).execute();
  }
}

async function ensureJournalTopic(
  executor: QueryExecutor,
  input: TopicDefinition,
): Promise<JournalTopic> {
  // One topic per label. A tag's address is its label romanized by the
  // language of the entry that *first* used it (ADR-0029 D4, amendment of
  // 2026-09-18), and the two tables spell the same letters differently: `рози`
  // is `rozy` from a Ukrainian entry and `rozi` from a Bulgarian one. Looked up
  // by slug alone, the second gardener's tag would found a second topic beside
  // the first, with the same word over it. So a gardener's tag looks for its
  // label first, and keeps whatever address that topic was given.
  if (input.joinByLabel) {
    const sameLabel = await buildFindJournalTopicByLabelQuery(
      executor,
      input.label,
    ).executeTakeFirst();
    if (sameLabel) return sameLabel as JournalTopic;
  }

  const existing = await buildFindJournalTopicBySlugQuery(
    executor,
    input.slug,
  ).executeTakeFirst();

  if (existing) {
    if (input.trustState === "curated" && existing.trust_state !== "curated") {
      const upgraded = await buildUpgradeJournalTopicTrustQuery(
        executor,
        input,
      ).executeTakeFirst();
      return (upgraded ?? existing) as JournalTopic;
    }

    return existing as JournalTopic;
  }

  const inserted = await buildInsertJournalTopicQuery(
    executor,
    input,
  ).executeTakeFirst();

  if (inserted) return inserted as JournalTopic;

  const afterConflict = await buildFindJournalTopicBySlugQuery(
    executor,
    input.slug,
  ).executeTakeFirst();
  if (!afterConflict) {
    throw new Error("Topic could not be created.");
  }

  return afterConflict as JournalTopic;
}

function signalStateForTopic(topic: JournalTopic): {
  reviewState: JournalEntryTopicReviewState;
  publicMembershipState: JournalEntryTopicPublicMembershipState;
} {
  return topic.trust_state === "curated"
    ? { reviewState: "accepted", publicMembershipState: "eligible" }
    : { reviewState: "review_needed", publicMembershipState: "hidden" };
}

function topicDefinitionForObjectKind(
  value: string | null,
): TopicDefinition | null {
  switch (value as PlantObjectKind | string | null) {
    case "plant":
      return { slug: "plants", label: "Рослини", trustState: "curated" };
    case "animal":
      return { slug: "animals", label: "Тварини", trustState: "curated" };
    default:
      return null;
  }
}

function topicDefinitionForCatalogKind(
  value: string | null,
): TopicDefinition | null {
  switch (value as CatalogKind | string | null) {
    case "plant_variety":
      return {
        slug: "plant-varieties",
        label: "Сорти рослин",
        trustState: "curated",
      };
    case "species":
      return { slug: "species", label: "Види", trustState: "curated" };
    case "breed":
      return { slug: "breeds", label: "Породи", trustState: "curated" };
    default:
      return null;
  }
}

/**
 * A gardener's own word becomes the address, in Latin letters (ADR-0029 D4,
 * amendment of 2026-09-18): `помідори` opens `/topics/pomidory`.
 *
 * Two earlier versions stood here. The first filtered with `/[^\w -]+/g`;
 * without the `u` flag `\w` is `[A-Za-z0-9_]`, so every Cyrillic letter was
 * deleted and the fallback took over — `помідори` became `tag-81e9f6d3034d`.
 * The second kept the Cyrillic, which a browser hands the clipboard as six
 * characters a letter. Romanized, the tag is readable in both places.
 *
 * **By the language of the entry, never by a constant.** The Ukrainian and
 * Bulgarian tables spell the same letters differently, and this function used
 * to hard-code `uk`, which was invisible while the output was Cyrillic:
 * Bulgarian `домати` would now come out `domaty`, which is not how anybody
 * spells it. The caller passes the entry's `source_language`.
 *
 * The `tag-` prefix is gone. It kept a gardener's tag from landing on a
 * curated topic's slug, and that turns out to be the wrong thing to prevent:
 * `ensureJournalTopic` keeps the curated trust state and never downgrades it,
 * so tagging *Species* joins the curated Species topic instead of forking a
 * near-duplicate beside it. Which is what a reader would expect the word to
 * mean. For the same reason a tag joins a topic that already carries its
 * *label* (`joinByLabel`), whatever that topic's address is spelled like.
 *
 * The hash survives as the fallback alone — for a label made of emoji, or
 * written in a script no table here romanizes. It is stable, so the same
 * unslugifiable label keeps reaching the same topic.
 */
export function explicitTagTopicDefinition(
  label: string,
  language: PublicLocale,
): TopicDefinition {
  const slug = slugify(label, {
    script: TOPIC.script,
    language,
    budget: TOPIC.budget,
    fallback: `tag-${createStableTopicHash(label)}`,
  });

  return { slug, label, trustState: "provisional", joinByLabel: true };
}

/**
 * The language a tag is romanized by. An entry written before
 * `source_language` was recorded has none (ADR-0029 D11 left the column
 * nullable), and the render path treats that as the default locale; so does
 * this.
 */
function normalizeTopicLanguage(value: string | null | undefined): PublicLocale {
  return value === "bg" || value === "ru" || value === "uk"
    ? value
    : DEFAULT_PUBLIC_LOCALE;
}

/**
 * A curated slug is chosen by an editor rather than derived, so it is checked
 * rather than slugified — and checked against the manifest, not against a
 * fourth copy of the pattern. `isAddressSlug` is the same guard the generated
 * `CHECK` on the column enforces, so the two cannot disagree about what an
 * editor may type.
 */
function normalizeCuratedTopicSlug(value: string) {
  const normalized = value.trim().toLocaleLowerCase("uk");
  if (!isAddressSlug("topic", normalized)) {
    throw new Error("Curated topic slug must be a safe public slug.");
  }
  return normalized;
}

function normalizeCuratedTopicLabel(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 80) {
    throw new Error("Curated topic label must be 2-80 characters.");
  }
  return normalized;
}

function createStableTopicHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function dedupeCandidates(candidates: TopicSignalCandidate[]) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = `${candidate.topic.slug}:${candidate.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
