import "server-only";

import { createHash } from "node:crypto";

import { type Kysely, type Transaction } from "kysely";

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
import { normalizeJournalTopicTagLabels } from "@/lib/garden/journal-topics";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const AUTOMATIC_TOPIC_SIGNAL_SOURCES = [
  "object_kind",
  "catalog_kind",
  "catalog_mention",
] as const satisfies readonly JournalEntryTopicSignalSource[];

interface TopicDefinition {
  slug: string;
  label: string;
  trustState: JournalTopicTrustState;
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
    .select(["id", "space_id as spaceId"])
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
        .on("catalog_items.status", "in", ["seeded", "confirmed"]),
    )
    .select([
      "plant_objects.object_kind as objectKind",
      "catalog_items.catalog_kind as catalogKind",
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
        .on("catalog_items.status", "in", ["seeded", "confirmed"]),
    )
    .select([
      "plant_objects.object_kind as objectKind",
      "catalog_items.catalog_kind as catalogKind",
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
        .on("catalog_items.status", "in", ["seeded", "confirmed"]),
    )
    .select("catalog_items.catalog_kind as catalogKind")
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
): Promise<TopicSignalCandidate[]> {
  const candidates: TopicSignalCandidate[] = normalizeJournalTopicTagLabels(
    explicitTagLabels,
  ).map((label) => ({
    topic: explicitTagTopicDefinition(label),
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
      candidates.push({ topic: catalogTopic, source: "catalog_kind" });
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
      return { slug: "plants", label: "Plants", trustState: "curated" };
    case "bee_colony":
      return {
        slug: "bee-colonies",
        label: "Bee colonies",
        trustState: "curated",
      };
    case "animal":
      return { slug: "animals", label: "Animals", trustState: "curated" };
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
        label: "Plant varieties",
        trustState: "curated",
      };
    case "species":
      return { slug: "species", label: "Species", trustState: "curated" };
    case "breed":
      return { slug: "breeds", label: "Breeds", trustState: "curated" };
    default:
      return null;
  }
}

function explicitTagTopicDefinition(label: string): TopicDefinition {
  const asciiSlug = label
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^\w -]+/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return {
    slug:
      asciiSlug.length >= 2
        ? `tag-${asciiSlug}`
        : `tag-${createStableTopicHash(label)}`,
    label,
    trustState: "provisional",
  };
}

function normalizeCuratedTopicSlug(value: string) {
  const normalized = value.trim().toLocaleLowerCase("en");
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized)) {
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
