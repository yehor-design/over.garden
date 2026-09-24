import "server-only";

import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import { publicAuthorHandleSql } from "@/server/author-handle-sql";
import type {
  Database,
  NotificationReceiptState,
  PlantObjectKind,
} from "@/db/schema";
import {
  publicJournalEntryAddress,
  publicObjectPassportAddress,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import {
  normalizePublicContentLanguage,
  type PublicLocale,
} from "@/lib/public-localization";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { buildPublicFeedMediaQuery } from "@/server/public-feed-repository";
import type { RequestScope } from "@/server/request-scope";
import { catalogKindSql } from "@/server/catalog-kind-sql";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const FOLLOWED_FEED_PAGE_SIZE = 12;
export const NOTIFICATION_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 30;
const MAX_NOTIFICATION_CANDIDATES = 60;
const STALE_JOURNAL_DAYS = 14;
/** A receipt write is one small upsert; anything slower is an incident. */
const RECEIPT_STATEMENT_TIMEOUT = "3s";

export type FollowedFeedSource = "all" | "people" | "objects" | "topics";
export type FollowedFeedObjectKind = "all" | PlantObjectKind;

export interface FollowedFeedCursor {
  publishedAt: string;
  publicSlug: string;
}

export interface FollowedFeedQueryInput {
  limit?: number;
  source?: FollowedFeedSource;
  objectKind?: FollowedFeedObjectKind;
  cursor?: FollowedFeedCursor | null;
}

export interface FollowedFeedCandidateRow {
  entryId: string;
  publicSlug: string | null;
  /** The `{n}` of the entry's address, `/@{handle}/post/{n}`. */
  entryNumber: number | null;
  title: string;
  body: string;
  entryDate: Date | string;
  publishedAt: Date | string | null;
  /** The language the gardener wrote in; absent on a fixture row. */
  sourceLanguage?: string | null;
  ownerHandle: string;
  /** The registry handle the addresses hang from (ADR-0029 D9). */
  addressHandle: string;
  ownerDisplayName: string | null;
  objectId: string;
  objectPublicSlug: string | null;
  objectDisplayName: string;
  objectKind: string;
  varietyText: string | null;
  catalogKind: string | null;
  followedByProfile: boolean;
  followedByObject: boolean;
  followedByTopic: boolean;
  followedByLineage: boolean;
}

export interface FollowedFeedItem {
  key: string;
  href: string;
  title: string;
  excerpt: string;
  /**
   * The language the gardener wrote in, so a card can mark the gardener's own
   * words with it when it is not the page's (WCAG 3.1.2, `OVE-492`).
   */
  sourceLanguage?: PublicLocale;
  entryDate: Date | string;
  publishedAt: Date | string;
  author: {
    handle: string;
    label: string;
    href: string;
  };
  object: {
    id: string;
    displayName: string;
    kind: PlantObjectKind;
    varietyText: string | null;
    catalogKind: string | null;
    href: string;
  };
  reasons: FollowedFeedSource[];
  mediaUrl: string | null;
  /**
   * The gardener's own description of that photograph, when they wrote one:
   * the card's `alt`. Without it the photograph is decorative (OG-UX-029).
   */
  mediaCaption: string | null;
}

/** The first public photograph of an entry, as a feed card draws it. */
export interface FeedCardMedia {
  url: string;
  caption: string | null;
}

/** Each entry's first photograph, by entry id, from the public media rows. */
export function feedCardMediaByEntry(
  rows: readonly {
    entryId: string;
    derivativeKey: string;
    caption?: string | null;
  }[],
  publicUrl: (derivativeKey: string) => string = getPublicDerivativeUrl,
): Map<string, FeedCardMedia> {
  const byEntry = new Map<string, FeedCardMedia>();
  for (const media of rows) {
    if (!byEntry.has(media.entryId)) {
      byEntry.set(media.entryId, {
        url: publicUrl(media.derivativeKey),
        caption: media.caption?.trim() || null,
      });
    }
  }
  return byEntry;
}

export interface FollowedFeedPage {
  items: FollowedFeedItem[];
  nextCursor: string | null;
}

export type NotificationEventKind =
  | "comment"
  | "reply"
  | "profile_follow"
  | "object_follow"
  | "lineage_follow"
  | "mention"
  | "claim"
  | "question"
  | "system";

/**
 * What a row is (`OVE-501`): something another gardener did, or the optional
 * reminder to write about one of the reader's own plants and animals.
 *
 * No backend produces a notice from OverGarden itself, so there is no third
 * category to name. The reminder is stored as the `system` kind, and the kind
 * stays: it is hashed into every event's receipt key, and renaming it would
 * bring back every reminder a reader has already read or dismissed.
 */
export type NotificationCategory = "social" | "reminder";

/**
 * The reader's own plant or animal a row is about, with where it lives — the
 * identity the garden list shows (`garden-collection-repository.ts`), so one
 * tomato reads the same on both pages.
 */
export interface NotificationObjectSubject {
  id: string;
  name: string;
  objectKind: PlantObjectKind;
  spaceName: string;
  /** The catalogue's canonical name, when an active public identity is set. */
  species: string | null;
  variety: string | null;
  /** The day it was added, `YYYY-MM-DD`: how two twins are told apart. */
  addedOn: string;
  /** The minute it was added, `YYYY-MM-DDTHH:MMZ`, for twins added one day. */
  addedAt: string;
  /** The newest active entry's date, `YYYY-MM-DD`, or null when none. */
  lastEntryDate: string | null;
}

/**
 * The filters. `reminders` holds the journaling reminders; it was called
 * `system` while the chip said «Системні», and an old `?filter=system` link
 * still lands on it.
 */
export type NotificationFilter =
  | "all"
  | "comments"
  | "follows"
  | "mentions"
  | "claims"
  | "reminders";

export type NotificationSummaryKey =
  | "comment_on_journal"
  | "reply_to_comment"
  | "profile_followed"
  | "object_followed"
  | "lineage_followed"
  | "provenance_mention"
  | "claim_decided"
  | "lineage_question"
  | "stale_journal_prompt";

export type NotificationActionKind =
  | "open_journal"
  | "open_profile"
  | "open_object"
  | "review_claims"
  | "open_questions"
  | "continue_journal";

export interface NotificationCandidateRow {
  sourceId: string;
  kind: NotificationEventKind;
  createdAt: Date | string;
  actorHandle: string | null;
  targetRef: string;
  targetLabel: string | null;
  href: string;
  summaryKey: NotificationSummaryKey;
  groupRef: string;
  actionKind?: NotificationActionKind;
  /** The reader's own object the row is about, resolved to its identity. */
  objectRef?: string | null;
}

export interface NotificationEvent {
  key: string;
  kind: NotificationEventKind;
  category: NotificationCategory;
  summaryKey: NotificationSummaryKey;
  createdAt: Date | string;
  actorMention: `@${string}` | null;
  /** The entry's title or the object's name the row is about. */
  targetLabel: string | null;
  /** The reader's own plant or animal, when the row is about one. */
  object: NotificationObjectSubject | null;
  href: string;
  actionKind: NotificationActionKind;
  groupKey: string;
  read: boolean;
}

export interface GroupedNotificationEvent extends NotificationEvent {
  count: number;
  /** How many of `eventKeys` are unread; the page's count is their sum. */
  unreadCount: number;
  eventKeys: string[];
  /** Everyone who did it, newest first, so a group never hides who acted. */
  actors: Array<`@${string}`>;
}

export interface NotificationPage {
  items: NotificationEvent[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface NotificationPreferences {
  comments: boolean;
  replies: boolean;
  follows: boolean;
  mentions: boolean;
  claims: boolean;
  system: boolean;
}

export interface NotificationPageOptions {
  pageSize?: number;
  cursor?: string | null;
  filter?: NotificationFilter;
  unreadOnly?: boolean;
}

interface NotificationCommentRow {
  sourceId: string;
  parentCommentId: string | null;
  createdAt: Date | string;
  actorHandle: string | null;
  /** The entry id (the engagement ref since `0073`). */
  targetRef: string;
  entryPublicSlug: string;
  /** The `{n}` of the entry's address, `/@{handle}/post/{n}`. */
  entryNumber: number | null;
  /** The author's registry handle; the entry's address hangs from it. */
  addressHandle: string;
  /** The entry's public title: which entry the comment is on. */
  entryTitle: string | null;
  /**
   * The entry's object, only when the entry is the reader's own. A reply can
   * sit under somebody else's entry, whose space is not the reader's to see.
   */
  ownObjectId: string | null;
}

interface NotificationFollowRow {
  sourceId: string;
  createdAt: Date | string;
  actorHandle: string | null;
  targetRef: string;
  targetLabel?: string | null;
  /** For an object target: its slug and its owner's handle, for the address. */
  objectPublicSlug?: string | null;
  addressHandle?: string | null;
}

interface NotificationReceiptRow {
  eventKey: string;
  state: string;
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  comments: true,
  replies: true,
  follows: true,
  mentions: true,
  claims: true,
  system: true,
};

export async function listFollowedFeedPage(
  scope: RequestScope,
  input: {
    source?: FollowedFeedSource;
    objectKind?: FollowedFeedObjectKind;
    cursor?: string | null;
    pageSize?: number;
    locale?: PublicLocale;
  } = {},
  executor: QueryExecutor = db,
): Promise<FollowedFeedPage> {
  const pageSize = normalizePageSize(
    input.pageSize ?? FOLLOWED_FEED_PAGE_SIZE,
    FOLLOWED_FEED_PAGE_SIZE,
  );
  const rows = await buildFollowedFeedCandidatesQuery(executor, scope, {
    limit: pageSize + 1,
    source: input.source ?? "all",
    objectKind: input.objectKind ?? "all",
    cursor: decodeFollowedFeedCursor(input.cursor),
  }).execute();

  const mediaRows = rows.length
    ? await buildPublicFeedMediaQuery(
        executor,
        rows.slice(0, pageSize).map((row) => row.entryId),
      ).execute()
    : [];
  const mediaByEntry = feedCardMediaByEntry(mediaRows);

  return serializeFollowedFeedPage(
    rows as FollowedFeedCandidateRow[],
    pageSize,
    input.locale ?? "uk",
    mediaByEntry,
  );
}

export function buildFollowedFeedCandidatesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: FollowedFeedQueryInput = {},
) {
  const source = normalizeFollowedFeedSource(input.source ?? "all");
  const objectKind = normalizeFollowedFeedObjectKind(input.objectKind ?? "all");
  const profileFollow = profileFollowPredicate(scope.userId);
  const objectFollow = objectFollowPredicate(scope.userId);
  const topicFollow = topicFollowPredicate(scope.userId);
  const lineageFollow = lineageFollowPredicate(scope.userId);

  let query = executor
    .selectFrom("journal_entries as entries")
    .innerJoin("plant_objects as objects", (join) =>
      join
        .onRef("objects.id", "=", "entries.plant_object_id")
        .onRef("objects.owner_user_id", "=", "entries.owner_user_id"),
    )
    .innerJoin("spaces as spaces", (join) =>
      join
        .onRef("spaces.id", "=", "entries.space_id")
        .onRef("spaces.owner_user_id", "=", "entries.owner_user_id"),
    )
    .innerJoin("user_handle_registry as owner_handles", (join) =>
      join
        .onRef("owner_handles.user_id", "=", "entries.owner_user_id")
        .on("owner_handles.lifecycle_state", "=", "current"),
    )
    .innerJoin("user_public_profiles as profiles", (join) =>
      join
        .onRef("profiles.user_id", "=", "owner_handles.user_id")
        .onRef(
          "profiles.normalized_handle",
          "=",
          "owner_handles.normalized_handle",
        )
        .on("profiles.profile_lifecycle_state", "=", "active")
        .on("profiles.removed_at", "is", null),
    )
    .leftJoin("catalog_items as catalog", (join) =>
      join
        .onRef("catalog.id", "=", "objects.catalog_item_id")
        .on("catalog.created_by_user_id", "is", null),
    )
    .select([
      "entries.id as entryId",
      "entries.public_slug as publicSlug",
      "entries.author_entry_number as entryNumber",
      "entries.title",
      "entries.body",
      "entries.entry_date as entryDate",
      "entries.published_at as publishedAt",
      "entries.source_language as sourceLanguage",
      "profiles.handle as ownerHandle",
      "owner_handles.normalized_handle as addressHandle",
      "profiles.display_name as ownerDisplayName",
      "objects.id as objectId",
      "objects.public_slug as objectPublicSlug",
      "objects.display_name as objectDisplayName",
      "objects.object_kind as objectKind",
      "objects.variety_text as varietyText",
      catalogKindSql("catalog").as("catalogKind"),
      profileFollow.as("followedByProfile"),
      objectFollow.as("followedByObject"),
      topicFollow.as("followedByTopic"),
      lineageFollow.as("followedByLineage"),
    ])
    .where("entries.visibility", "=", "public")
    .where("entries.lifecycle_state", "=", "active")
    .where("entries.public_gone_at", "is", null)
    .where("entries.public_slug", "is not", null)
    .where("entries.published_at", "is not", null)
    .where(noActiveBlockPredicate(scope.userId, "entries.owner_user_id"))
    .where(
      followedSourcePredicate(source, {
        profileFollow,
        objectFollow,
        topicFollow,
        lineageFollow,
      }),
    );

  if (objectKind !== "all") {
    query = query.where("objects.object_kind", "=", objectKind);
  }

  if (input.cursor) {
    query = query.where((eb) =>
      eb.or([
        eb("entries.published_at", "<", new Date(input.cursor!.publishedAt)),
        eb.and([
          eb("entries.published_at", "=", new Date(input.cursor!.publishedAt)),
          eb("entries.public_slug", ">", input.cursor!.publicSlug),
        ]),
      ]),
    );
  }

  return query
    .orderBy("entries.published_at", "desc")
    .orderBy("entries.public_slug", "asc")
    .limit(
      normalizePageSize(
        input.limit ?? FOLLOWED_FEED_PAGE_SIZE + 1,
        FOLLOWED_FEED_PAGE_SIZE + 1,
      ),
    );
}

export function serializeFollowedFeedPage(
  rows: FollowedFeedCandidateRow[],
  pageSize = FOLLOWED_FEED_PAGE_SIZE,
  locale: PublicLocale = "uk",
  mediaByEntry: ReadonlyMap<string, FeedCardMedia> = new Map(),
): FollowedFeedPage {
  const boundedPageSize = normalizePageSize(pageSize, FOLLOWED_FEED_PAGE_SIZE);
  const visible = rows.slice(0, boundedPageSize).flatMap((row) => {
    if (!row.publicSlug || !row.publishedAt) return [];
    const reasons: FollowedFeedSource[] = [];
    if (row.followedByProfile) reasons.push("people");
    if (row.followedByObject || row.followedByLineage) reasons.push("objects");
    if (row.followedByTopic) reasons.push("topics");

    return [
      mapFeedEntryRow(
        { ...row, publicSlug: row.publicSlug, publishedAt: row.publishedAt },
        locale,
        mediaByEntry,
        Array.from(new Set(reasons)),
      ),
    ];
  });
  const last = visible.at(-1);

  return {
    items: visible,
    nextCursor:
      rows.length > boundedPageSize && last
        ? encodeFollowedFeedCursor({
            publishedAt: toIsoString(last.publishedAt),
            publicSlug: last.href.split("/").at(-1) ?? "",
          })
        : null,
  };
}

/** One entry as a feed card: the followed feed's and the saved shelf's. */
function mapFeedEntryRow(
  row: Omit<
    FollowedFeedCandidateRow,
    | "followedByProfile"
    | "followedByObject"
    | "followedByTopic"
    | "followedByLineage"
  > & { publicSlug: string; publishedAt: Date | string },
  locale: PublicLocale,
  mediaByEntry: ReadonlyMap<string, FeedCardMedia>,
  reasons: FollowedFeedSource[],
): FollowedFeedItem {
  return {
    key: stableOpaqueKey("feed", row.entryId),
    // Under the author (ADR-0029 D9); this feed used to link the legacy
    // address, a 308 on every story.
    href: publicJournalEntryAddress({
      authorHandle: row.addressHandle,
      entryNumber: row.entryNumber,
      publicSlug: row.publicSlug,
    }),
    title: row.title,
    excerpt: summarizePublicText(row.body, 240),
    sourceLanguage: normalizePublicContentLanguage(row.sourceLanguage),
    entryDate: row.entryDate,
    publishedAt: row.publishedAt,
    author: {
      handle: row.ownerHandle,
      label: row.ownerDisplayName?.trim() || `@${row.ownerHandle}`,
      href: publicProfilePath(locale, row.ownerHandle),
    },
    object: {
      id: stableOpaqueKey("object", row.objectId),
      displayName: row.objectDisplayName,
      kind: row.objectKind as PlantObjectKind,
      varietyText: row.varietyText,
      catalogKind: row.catalogKind,
      href: publicObjectPassportAddress({
        authorHandle: row.addressHandle,
        publicSlug: row.objectPublicSlug,
        plantObjectId: row.objectId,
      }),
    },
    reasons,
    mediaUrl: mediaByEntry.get(row.entryId)?.url ?? null,
    mediaCaption: mediaByEntry.get(row.entryId)?.caption ?? null,
  };
}

/**
 * The entries a reader saved, drawn as the feed draws them (`OVE-502`): a
 * saved entry reads on the shelf as it read where it was saved. Only what is
 * still public, and not behind a block either way, comes back — the shelf
 * says the rest is unavailable rather than dropping it. Keyed by entry id.
 */
export async function listSavedEntryCards(
  scope: RequestScope,
  entryIds: readonly string[],
  locale: PublicLocale,
  executor: QueryExecutor = db,
): Promise<Map<string, FollowedFeedItem>> {
  if (entryIds.length === 0) return new Map();
  const rows = await buildSavedEntryCardsQuery(
    executor,
    scope,
    entryIds,
  ).execute();
  const mediaRows = rows.length
    ? await buildPublicFeedMediaQuery(
        executor,
        rows.map((row) => row.entryId),
      ).execute()
    : [];
  const mediaByEntry = feedCardMediaByEntry(mediaRows);
  const cards = new Map<string, FollowedFeedItem>();
  for (const row of rows) {
    if (!row.publicSlug || !row.publishedAt) continue;
    cards.set(
      row.entryId,
      mapFeedEntryRow(
        { ...row, publicSlug: row.publicSlug, publishedAt: row.publishedAt },
        locale,
        mediaByEntry,
        [],
      ),
    );
  }
  return cards;
}

export function buildSavedEntryCardsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: readonly string[],
) {
  return executor
    .selectFrom("journal_entries as entries")
    .innerJoin("plant_objects as objects", (join) =>
      join
        .onRef("objects.id", "=", "entries.plant_object_id")
        .onRef("objects.owner_user_id", "=", "entries.owner_user_id"),
    )
    .innerJoin("user_handle_registry as owner_handles", (join) =>
      join
        .onRef("owner_handles.user_id", "=", "entries.owner_user_id")
        .on("owner_handles.lifecycle_state", "=", "current"),
    )
    .innerJoin("user_public_profiles as profiles", (join) =>
      join
        .onRef("profiles.user_id", "=", "owner_handles.user_id")
        .onRef(
          "profiles.normalized_handle",
          "=",
          "owner_handles.normalized_handle",
        )
        .on("profiles.profile_lifecycle_state", "=", "active")
        .on("profiles.removed_at", "is", null),
    )
    .leftJoin("catalog_items as catalog", (join) =>
      join
        .onRef("catalog.id", "=", "objects.catalog_item_id")
        .on("catalog.created_by_user_id", "is", null),
    )
    .select([
      "entries.id as entryId",
      "entries.public_slug as publicSlug",
      "entries.author_entry_number as entryNumber",
      "entries.title",
      "entries.body",
      "entries.entry_date as entryDate",
      "entries.published_at as publishedAt",
      "entries.source_language as sourceLanguage",
      "profiles.handle as ownerHandle",
      "owner_handles.normalized_handle as addressHandle",
      "profiles.display_name as ownerDisplayName",
      "objects.id as objectId",
      "objects.public_slug as objectPublicSlug",
      "objects.display_name as objectDisplayName",
      "objects.object_kind as objectKind",
      "objects.variety_text as varietyText",
      catalogKindSql("catalog").as("catalogKind"),
    ])
    .where("entries.id", "in", [...entryIds])
    .where("entries.visibility", "=", "public")
    .where("entries.lifecycle_state", "=", "active")
    .where("entries.public_gone_at", "is", null)
    .where("entries.public_slug", "is not", null)
    .where("entries.published_at", "is not", null)
    .where(noActiveBlockPredicate(scope.userId, "entries.owner_user_id"));
}

/**
 * Every event the reader can see, with the receipts that say what they have
 * read and the identity of the objects the rows name.
 *
 * Three round trips at most: the preferences and the eight event sources
 * together, then the receipts and the object identities together. The
 * preferences used to be read first and alone.
 */
async function collectNotificationCandidates(
  scope: RequestScope,
  locale: PublicLocale,
  executor: QueryExecutor,
  options: { subjects: boolean },
) {
  const candidateLimit = MAX_NOTIFICATION_CANDIDATES;
  const [
    preferences,
    commentRows,
    profileFollowRows,
    objectFollowRows,
    mentionRows,
    claimRows,
    questionRows,
    lineageFollowRows,
    staleRows,
  ] = await Promise.all([
    getNotificationPreferences(scope, executor),
    buildNotificationCommentEventsQuery(
      executor,
      scope,
      candidateLimit,
    ).execute(),
    buildNotificationProfileFollowEventsQuery(
      executor,
      scope,
      candidateLimit,
    ).execute(),
    buildNotificationObjectFollowEventsQuery(
      executor,
      scope,
      candidateLimit,
    ).execute(),
    buildNotificationMentionEventsQuery(
      executor,
      scope,
      candidateLimit,
    ).execute(),
    buildNotificationClaimDecisionEventsQuery(
      executor,
      scope,
      candidateLimit,
    ).execute(),
    buildNotificationQuestionEventsQuery(
      executor,
      scope,
      candidateLimit,
    ).execute(),
    buildNotificationLineageFollowEventsQuery(
      executor,
      scope,
      candidateLimit,
    ).execute(),
    buildStaleJournalPromptEventsQuery(
      executor,
      scope,
      new Date(),
      candidateLimit,
    ).execute(),
  ]);

  const candidates: NotificationCandidateRow[] = [
    ...(commentRows as NotificationCommentRow[]).map((row) =>
      mapCommentNotification(row),
    ),
    ...(profileFollowRows as NotificationFollowRow[]).map((row) => ({
      sourceId: row.sourceId,
      kind: "profile_follow" as const,
      createdAt: row.createdAt,
      actorHandle: row.actorHandle,
      targetRef: row.targetRef,
      targetLabel: null,
      href: publicProfilePath(locale, row.targetRef),
      summaryKey: "profile_followed" as const,
      groupRef: "profile-follows",
      actionKind: "open_profile" as const,
    })),
    ...(objectFollowRows as NotificationFollowRow[]).map((row) => ({
      sourceId: row.sourceId,
      kind: "object_follow" as const,
      createdAt: row.createdAt,
      actorHandle: row.actorHandle,
      targetRef: row.targetRef,
      targetLabel: row.targetLabel ?? null,
      href: publicObjectPassportAddress({
        authorHandle: row.addressHandle ?? null,
        publicSlug: row.objectPublicSlug ?? null,
        plantObjectId: row.targetRef,
      }),
      summaryKey: "object_followed" as const,
      groupRef: `object:${row.targetRef}`,
      actionKind: "open_object" as const,
      objectRef: row.targetRef,
    })),
    ...(mentionRows as NotificationFollowRow[]).map((row) => ({
      sourceId: row.sourceId,
      kind: "mention" as const,
      createdAt: row.createdAt,
      actorHandle: row.actorHandle,
      targetRef: row.targetRef,
      targetLabel: row.targetLabel ?? null,
      href: "/garden/lineage/claims",
      summaryKey: "provenance_mention" as const,
      groupRef: `claim:${row.targetRef}`,
      actionKind: "review_claims" as const,
      objectRef: row.targetRef,
    })),
    ...(claimRows as NotificationFollowRow[]).map((row) => ({
      sourceId: row.sourceId,
      kind: "claim" as const,
      createdAt: row.createdAt,
      actorHandle: row.actorHandle,
      targetRef: row.targetRef,
      targetLabel: row.targetLabel ?? null,
      href: "/garden/lineage/claims",
      summaryKey: "claim_decided" as const,
      groupRef: `claim:${row.targetRef}`,
      actionKind: "review_claims" as const,
      objectRef: row.targetRef,
    })),
    ...(questionRows as NotificationFollowRow[]).map((row) => ({
      sourceId: row.sourceId,
      kind: "question" as const,
      createdAt: row.createdAt,
      actorHandle: row.actorHandle,
      targetRef: row.targetRef,
      targetLabel: row.targetLabel ?? null,
      href: "/garden/lineage/questions",
      summaryKey: "lineage_question" as const,
      groupRef: `question:${row.targetRef}`,
      actionKind: "open_questions" as const,
      objectRef: row.targetRef,
    })),
    ...(lineageFollowRows as NotificationFollowRow[]).map((row) => ({
      sourceId: row.sourceId,
      kind: "lineage_follow" as const,
      createdAt: row.createdAt,
      actorHandle: row.actorHandle,
      targetRef: row.targetRef,
      targetLabel: row.targetLabel ?? null,
      href: publicObjectPassportAddress({
        authorHandle: row.addressHandle ?? null,
        publicSlug: row.objectPublicSlug ?? null,
        plantObjectId: row.targetRef,
      }),
      summaryKey: "lineage_followed" as const,
      groupRef: `lineage:${row.targetRef}`,
      actionKind: "open_object" as const,
      objectRef: row.targetRef,
    })),
    ...(staleRows as NotificationFollowRow[]).map((row) => ({
      sourceId: row.sourceId,
      kind: "system" as const,
      createdAt: row.createdAt,
      actorHandle: null,
      targetRef: row.targetRef,
      targetLabel: row.targetLabel ?? null,
      href: `/garden/objects/${encodeURIComponent(row.targetRef)}`,
      summaryKey: "stale_journal_prompt" as const,
      groupRef: `stale:${row.targetRef}`,
      actionKind: "continue_journal" as const,
      objectRef: row.targetRef,
    })),
  ].filter((candidate) => notificationEnabled(candidate.kind, preferences));

  const eventKeys = candidates.map((candidate) =>
    notificationEventKey(candidate.kind, candidate.sourceId),
  );
  const objectIds = options.subjects
    ? Array.from(
        new Set(
          candidates
            .map((candidate) => candidate.objectRef)
            .filter((id): id is string => Boolean(id)),
        ),
      )
    : [];
  const [receiptRows, subjectRows] = await Promise.all([
    eventKeys.length > 0
      ? buildListNotificationReceiptsQuery(executor, scope, eventKeys).execute()
      : Promise.resolve([]),
    objectIds.length > 0
      ? buildNotificationObjectSubjectsQuery(
          executor,
          scope,
          objectIds,
        ).execute()
      : Promise.resolve([]),
  ]);
  const receipts = new Map(
    (receiptRows as NotificationReceiptRow[]).map((row) => [
      row.eventKey,
      row.state,
    ]),
  );
  const subjects = new Map<string, NotificationObjectSubject>(
    subjectRows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        objectKind: row.objectKind === "animal" ? "animal" : "plant",
        spaceName: row.spaceName,
        species: row.species ?? null,
        variety: row.variety?.trim() || null,
        addedOn: row.addedOn,
        addedAt: row.addedAt,
        lastEntryDate: row.lastEntryDate ?? null,
      },
    ]),
  );

  return { candidates, receipts, subjects };
}

export async function listNotificationCenterPage(
  scope: RequestScope,
  locale: PublicLocale,
  options: NotificationPageOptions = {},
  executor: QueryExecutor = db,
): Promise<NotificationPage> {
  const { candidates, receipts, subjects } =
    await collectNotificationCandidates(scope, locale, executor, {
      subjects: true,
    });
  return serializeNotificationPage(candidates, receipts, options, subjects);
}

/**
 * The reader's unread count, from the same events and the same receipts as
 * the Activity page (`OVE-501`). The garden's rail counted another model —
 * lineage events, with no receipts at all — so its number never went down
 * when a reader read something, and never matched the page it linked to.
 */
export async function countUnreadNotifications(
  scope: RequestScope,
  executor: QueryExecutor = db,
): Promise<number> {
  const { candidates, receipts } = await collectNotificationCandidates(
    scope,
    "uk",
    executor,
    { subjects: false },
  );
  return serializeNotificationPage(candidates, receipts).unreadCount;
}

export function buildNotificationCommentEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = MAX_NOTIFICATION_CANDIDATES,
) {
  return executor
    .selectFrom("engagement_comments as comments")
    .leftJoin("engagement_comments as parent_comments", (join) =>
      join.onRef("parent_comments.id", "=", "comments.parent_comment_id"),
    )
    .innerJoin("journal_entries as entries", (join) =>
      join
        // The ref is the entry id since `0073`; it was the slug, which the
        // move under the author left pointing at a name nothing answered to.
        .on(sql`${sql.ref("entries.id")}::text = ${sql.ref("comments.target_ref")}`)
        .on("comments.target_kind", "=", "journal_entry"),
    )
    .innerJoin("user_handle_registry as owner_handles", (join) =>
      join
        .onRef("owner_handles.user_id", "=", "entries.owner_user_id")
        .on("owner_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_handle_registry as actor_handles", (join) =>
      join
        .onRef("actor_handles.user_id", "=", "comments.author_user_id")
        .on("actor_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles as profiles", (join) =>
      join
        .onRef("profiles.user_id", "=", "actor_handles.user_id")
        .onRef(
          "profiles.normalized_handle",
          "=",
          "actor_handles.normalized_handle",
        )
        .on("profiles.profile_lifecycle_state", "=", "active")
        .on("profiles.removed_at", "is", null),
    )
    .select([
      "comments.id as sourceId",
      "comments.parent_comment_id as parentCommentId",
      "comments.created_at as createdAt",
      "profiles.handle as actorHandle",
      "comments.target_ref as targetRef",
      "entries.public_slug as entryPublicSlug",
      "entries.author_entry_number as entryNumber",
      "owner_handles.normalized_handle as addressHandle",
      "entries.title as entryTitle",
      sql<string | null>`case when ${sql.ref("entries.owner_user_id")} = ${scope.userId}::uuid then ${sql.ref("entries.plant_object_id")} end`.as(
        "ownObjectId",
      ),
    ])
    .where("comments.comment_state", "=", "active")
    .where("comments.author_user_id", "!=", scope.userId)
    .where("entries.visibility", "=", "public")
    .where("entries.lifecycle_state", "=", "active")
    .where("entries.public_gone_at", "is", null)
    .where("entries.public_slug", "is not", null)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("comments.parent_comment_id", "is", null),
          eb("entries.owner_user_id", "=", scope.userId),
        ]),
        eb.and([
          eb("comments.parent_comment_id", "is not", null),
          eb("parent_comments.author_user_id", "=", scope.userId),
        ]),
      ]),
    )
    .where(noActiveBlockPredicate(scope.userId, "comments.author_user_id"))
    .orderBy("comments.created_at", "desc")
    .orderBy("comments.id", "asc")
    .limit(normalizePageSize(limit, MAX_NOTIFICATION_CANDIDATES));
}

export function buildNotificationProfileFollowEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = MAX_NOTIFICATION_CANDIDATES,
) {
  return executor
    .selectFrom("profile_follows as follows")
    .leftJoin("user_handle_registry as actor_handles", (join) =>
      join
        .onRef("actor_handles.user_id", "=", "follows.follower_user_id")
        .on("actor_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles as profiles", (join) =>
      join
        .onRef("profiles.user_id", "=", "actor_handles.user_id")
        .onRef(
          "profiles.normalized_handle",
          "=",
          "actor_handles.normalized_handle",
        )
        .on("profiles.profile_lifecycle_state", "=", "active")
        .on("profiles.removed_at", "is", null),
    )
    .innerJoin("user_handle_registry as target_handles", (join) =>
      join
        .onRef("target_handles.user_id", "=", "follows.target_user_id")
        .on("target_handles.lifecycle_state", "=", "current"),
    )
    .innerJoin("user_public_profiles as target_profiles", (join) =>
      join
        .onRef("target_profiles.user_id", "=", "target_handles.user_id")
        .onRef(
          "target_profiles.normalized_handle",
          "=",
          "target_handles.normalized_handle",
        )
        .on("target_profiles.profile_lifecycle_state", "=", "active")
        .on("target_profiles.removed_at", "is", null),
    )
    .select([
      "follows.id as sourceId",
      "follows.updated_at as createdAt",
      "profiles.handle as actorHandle",
      "target_profiles.handle as targetRef",
    ])
    .where("follows.target_user_id", "=", scope.userId)
    .where("follows.follow_state", "=", "active")
    .where(noActiveBlockPredicate(scope.userId, "follows.follower_user_id"))
    .orderBy("follows.updated_at", "desc")
    .orderBy("follows.id", "asc")
    .limit(normalizePageSize(limit, MAX_NOTIFICATION_CANDIDATES));
}

export function buildNotificationObjectFollowEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = MAX_NOTIFICATION_CANDIDATES,
) {
  return executor
    .selectFrom("engagement_follows as follows")
    .innerJoin("plant_objects as objects", (join) =>
      join.on(
        sql<boolean>`${sql.ref("objects.id")}::text = ${sql.ref("follows.target_ref")}`,
      ),
    )
    .innerJoin("journal_entries as entries", (join) =>
      join
        .onRef("entries.plant_object_id", "=", "objects.id")
        .onRef("entries.owner_user_id", "=", "objects.owner_user_id")
        .on("entries.visibility", "=", "public")
        .on("entries.lifecycle_state", "=", "active")
        .on("entries.public_gone_at", "is", null)
        .on("entries.public_slug", "is not", null),
    )
    .leftJoin("user_handle_registry as actor_handles", (join) =>
      join
        .onRef("actor_handles.user_id", "=", "follows.follower_user_id")
        .on("actor_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles as profiles", (join) =>
      join
        .onRef("profiles.user_id", "=", "actor_handles.user_id")
        .onRef(
          "profiles.normalized_handle",
          "=",
          "actor_handles.normalized_handle",
        )
        .on("profiles.profile_lifecycle_state", "=", "active")
        .on("profiles.removed_at", "is", null),
    )
    .select([
      "follows.id as sourceId",
      "follows.updated_at as createdAt",
      "profiles.handle as actorHandle",
      "objects.id as targetRef",
      "objects.display_name as targetLabel",
      "objects.public_slug as objectPublicSlug",
      publicAuthorHandleSql("objects.owner_user_id").as("addressHandle"),
    ])
    .where("objects.owner_user_id", "=", scope.userId)
    .where("follows.target_kind", "=", "lineage_object")
    .where("follows.follow_state", "=", "active")
    .where(noActiveBlockPredicate(scope.userId, "follows.follower_user_id"))
    // `owner_user_id` is grouped by, which is what lets the handle scalar
    // read it (see `author-handle-sql.ts`).
    .groupBy([
      "follows.id",
      "follows.updated_at",
      "profiles.handle",
      "objects.id",
      "objects.display_name",
      "objects.public_slug",
      "objects.owner_user_id",
    ])
    .orderBy("follows.updated_at", "desc")
    .orderBy("follows.id", "asc")
    .limit(normalizePageSize(limit, MAX_NOTIFICATION_CANDIDATES));
}

export function buildNotificationMentionEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = MAX_NOTIFICATION_CANDIDATES,
) {
  return executor
    .selectFrom("lineage_provenance_edges as edges")
    .innerJoin("plant_objects as source_objects", (join) =>
      join
        .onRef("source_objects.id", "=", "edges.source_plant_object_id")
        .onRef(
          "source_objects.owner_user_id",
          "=",
          "edges.source_owner_user_id",
        ),
    )
    .leftJoin("user_handle_registry as actor_handles", (join) =>
      join
        .onRef("actor_handles.user_id", "=", "edges.owner_user_id")
        .on("actor_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles as profiles", (join) =>
      join
        .onRef("profiles.user_id", "=", "actor_handles.user_id")
        .onRef(
          "profiles.normalized_handle",
          "=",
          "actor_handles.normalized_handle",
        )
        .on("profiles.profile_lifecycle_state", "=", "active")
        .on("profiles.removed_at", "is", null),
    )
    .select([
      "edges.id as sourceId",
      "edges.created_at as createdAt",
      "profiles.handle as actorHandle",
      "source_objects.id as targetRef",
      "source_objects.display_name as targetLabel",
    ])
    .where("edges.source_owner_user_id", "=", scope.userId)
    .where("edges.owner_user_id", "!=", scope.userId)
    .where("edges.source_kind", "=", "own_object")
    .where("edges.consent_state", "=", "proposed")
    .where("edges.visibility_policy", "=", "owner_only_until_confirmed")
    .where("edges.erasure_state", "=", "active")
    .where(noActiveBlockPredicate(scope.userId, "edges.owner_user_id"))
    .orderBy("edges.created_at", "desc")
    .orderBy("edges.id", "asc")
    .limit(normalizePageSize(limit, MAX_NOTIFICATION_CANDIDATES));
}

export function buildNotificationClaimDecisionEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = MAX_NOTIFICATION_CANDIDATES,
) {
  return executor
    .selectFrom("lineage_provenance_edge_audit_events as audit_events")
    .innerJoin("lineage_provenance_edges as edges", (join) =>
      join.onRef("edges.id", "=", "audit_events.edge_id"),
    )
    .innerJoin("plant_objects as subject_objects", (join) =>
      join
        .onRef("subject_objects.id", "=", "edges.subject_plant_object_id")
        .onRef("subject_objects.owner_user_id", "=", "edges.owner_user_id"),
    )
    .leftJoin("user_handle_registry as actor_handles", (join) =>
      join
        .onRef("actor_handles.user_id", "=", "edges.source_owner_user_id")
        .on("actor_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles as profiles", (join) =>
      join
        .onRef("profiles.user_id", "=", "actor_handles.user_id")
        .onRef(
          "profiles.normalized_handle",
          "=",
          "actor_handles.normalized_handle",
        )
        .on("profiles.profile_lifecycle_state", "=", "active")
        .on("profiles.removed_at", "is", null),
    )
    .select([
      "audit_events.id as sourceId",
      "audit_events.created_at as createdAt",
      "profiles.handle as actorHandle",
      "subject_objects.id as targetRef",
      "subject_objects.display_name as targetLabel",
    ])
    .where("edges.owner_user_id", "=", scope.userId)
    .where("edges.source_owner_user_id", "!=", scope.userId)
    .where("edges.source_kind", "=", "own_object")
    .where("edges.visibility_policy", "=", "owner_only_until_confirmed")
    .where("audit_events.new_consent_state", "in", ["confirmed", "declined"])
    .where(noActiveBlockPredicate(scope.userId, "edges.source_owner_user_id"))
    .orderBy("audit_events.created_at", "desc")
    .orderBy("audit_events.id", "asc")
    .limit(normalizePageSize(limit, MAX_NOTIFICATION_CANDIDATES));
}

export function buildNotificationQuestionEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = MAX_NOTIFICATION_CANDIDATES,
) {
  return executor
    .selectFrom("lineage_questions as questions")
    .innerJoin("plant_objects as objects", (join) =>
      join
        .onRef("objects.id", "=", "questions.target_plant_object_id")
        .onRef("objects.owner_user_id", "=", "questions.recipient_user_id"),
    )
    .leftJoin("user_handle_registry as actor_handles", (join) =>
      join
        .onRef("actor_handles.user_id", "=", "questions.asker_user_id")
        .on("actor_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles as profiles", (join) =>
      join
        .onRef("profiles.user_id", "=", "actor_handles.user_id")
        .onRef(
          "profiles.normalized_handle",
          "=",
          "actor_handles.normalized_handle",
        )
        .on("profiles.profile_lifecycle_state", "=", "active")
        .on("profiles.removed_at", "is", null),
    )
    .select([
      "questions.id as sourceId",
      "questions.created_at as createdAt",
      "profiles.handle as actorHandle",
      "objects.id as targetRef",
      "objects.display_name as targetLabel",
    ])
    .where("questions.recipient_user_id", "=", scope.userId)
    .where("questions.question_state", "=", "delivered")
    .where(noActiveBlockPredicate(scope.userId, "questions.asker_user_id"))
    .orderBy("questions.created_at", "desc")
    .orderBy("questions.id", "asc")
    .limit(normalizePageSize(limit, MAX_NOTIFICATION_CANDIDATES));
}

export function buildNotificationLineageFollowEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = MAX_NOTIFICATION_CANDIDATES,
) {
  return executor
    .selectFrom("lineage_node_follows as follows")
    .innerJoin("plant_objects as objects", (join) =>
      join
        .onRef("objects.id", "=", "follows.target_plant_object_id")
        .onRef("objects.owner_user_id", "=", "follows.target_owner_user_id"),
    )
    .innerJoin("journal_entries as entries", (join) =>
      join
        .onRef("entries.plant_object_id", "=", "objects.id")
        .onRef("entries.owner_user_id", "=", "objects.owner_user_id")
        .on("entries.visibility", "=", "public")
        .on("entries.lifecycle_state", "=", "active")
        .on("entries.public_gone_at", "is", null)
        .on("entries.public_slug", "is not", null),
    )
    .leftJoin("user_handle_registry as actor_handles", (join) =>
      join
        .onRef("actor_handles.user_id", "=", "follows.follower_user_id")
        .on("actor_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles as profiles", (join) =>
      join
        .onRef("profiles.user_id", "=", "actor_handles.user_id")
        .onRef(
          "profiles.normalized_handle",
          "=",
          "actor_handles.normalized_handle",
        )
        .on("profiles.profile_lifecycle_state", "=", "active")
        .on("profiles.removed_at", "is", null),
    )
    .select([
      "follows.id as sourceId",
      "follows.updated_at as createdAt",
      "profiles.handle as actorHandle",
      "objects.id as targetRef",
      "objects.display_name as targetLabel",
      "objects.public_slug as objectPublicSlug",
      publicAuthorHandleSql("objects.owner_user_id").as("addressHandle"),
    ])
    .where("follows.target_owner_user_id", "=", scope.userId)
    .where("follows.follow_state", "=", "active")
    .where(noActiveBlockPredicate(scope.userId, "follows.follower_user_id"))
    .groupBy([
      "follows.id",
      "follows.updated_at",
      "profiles.handle",
      "objects.id",
      "objects.display_name",
      "objects.public_slug",
      "objects.owner_user_id",
    ])
    .orderBy("follows.updated_at", "desc")
    .orderBy("follows.id", "asc")
    .limit(normalizePageSize(limit, MAX_NOTIFICATION_CANDIDATES));
}

export function buildStaleJournalPromptEventsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  now = new Date(),
  limit = MAX_NOTIFICATION_CANDIDATES,
) {
  const threshold = new Date(
    now.getTime() - STALE_JOURNAL_DAYS * 24 * 60 * 60 * 1000,
  );

  const lastEntryDate = sql<string | null>`(
    select max(last_entries.entry_date)
    from "journal_entries" as last_entries
    where last_entries.owner_user_id = ${scope.userId}
      and last_entries.plant_object_id = ${sql.ref("objects.id")}
      and last_entries.lifecycle_state = 'active'
  )`;

  return executor
    .selectFrom("plant_objects as objects")
    .select([
      "objects.id as sourceId",
      // When the reminder began to hold (`OVE-501`): two weeks after the newest
      // entry, or when an object with none was added. It was the object's
      // `updated_at`, so renaming a plant dated its reminder today.
      sql<Date>`coalesce(
        (${lastEntryDate} + ${STALE_JOURNAL_DAYS}::int)::timestamptz,
        ${sql.ref("objects.created_at")}
      )`.as("createdAt"),
      "objects.id as targetRef",
      "objects.display_name as targetLabel",
    ])
    .where("objects.owner_user_id", "=", scope.userId)
    .where(
      sql<boolean>`not exists (
        select 1
        from "journal_entries" as recent_entries
        where recent_entries.owner_user_id = ${scope.userId}
          and recent_entries.plant_object_id = ${sql.ref("objects.id")}
          and recent_entries.lifecycle_state = 'active'
          and recent_entries.entry_date >= ${threshold.toISOString().slice(0, 10)}
      )`,
    )
    // The most recently due first, as the list reads them.
    .orderBy(sql.ref("createdAt"), "desc")
    .orderBy("objects.id", "asc")
    .limit(normalizePageSize(limit, MAX_NOTIFICATION_CANDIDATES));
}

/**
 * The identity of the reader's own objects the rows name (`OVE-501`): name,
 * kind, space, organism, variety, the day it was added and the date of its
 * newest active entry. The organism and the last entry are read exactly as the
 * garden list reads them, and only the reader's own objects are ever resolved
 * — a row about somebody else's entry names that entry and nothing of theirs.
 */
export function buildNotificationObjectSubjectsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  objectIds: readonly string[],
) {
  return executor
    .selectFrom("plant_objects as objects")
    .innerJoin("spaces", (join) =>
      join
        .onRef("spaces.id", "=", "objects.space_id")
        .onRef("spaces.owner_user_id", "=", "objects.owner_user_id"),
    )
    .leftJoin("catalog_items as catalog", (join) =>
      join
        .onRef("catalog.id", "=", "objects.catalog_item_id")
        .on("catalog.identity_state", "=", "active")
        .on("catalog.created_by_user_id", "is", null),
    )
    .select([
      "objects.id as id",
      "objects.display_name as name",
      "objects.object_kind as objectKind",
      "spaces.display_name as spaceName",
      "catalog.canonical_name as species",
      "objects.variety_text as variety",
      sql<string>`to_char(${sql.ref("objects.created_at")} at time zone 'UTC', 'YYYY-MM-DD')`.as(
        "addedOn",
      ),
      sql<string>`to_char(${sql.ref("objects.created_at")} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"')`.as(
        "addedAt",
      ),
      sql<string | null>`(
        select to_char(max(last_entries.entry_date), 'YYYY-MM-DD')
        from "journal_entries" as last_entries
        where last_entries.owner_user_id = ${scope.userId}
          and last_entries.plant_object_id = ${sql.ref("objects.id")}
          and last_entries.lifecycle_state = 'active'
      )`.as("lastEntryDate"),
    ])
    .where("objects.owner_user_id", "=", scope.userId)
    .where("objects.id", "in", [...objectIds]);
}

export function buildListNotificationReceiptsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  eventKeys: readonly string[],
) {
  return executor
    .selectFrom("notification_receipts")
    .select(["event_key as eventKey", "receipt_state as state"])
    .where("owner_user_id", "=", scope.userId)
    .where("event_key", "in", eventKeys.map(normalizeNotificationEventKey));
}

export function buildUpsertNotificationReceiptsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    eventKeys: readonly string[];
    state: NotificationReceiptState;
    now?: Date;
  },
) {
  const state = normalizeNotificationReceiptState(input.state);
  const now = input.now ?? new Date();
  const readAt = state === "read" ? now : null;

  return executor
    .insertInto("notification_receipts")
    .values(
      input.eventKeys.map((eventKey) => ({
        owner_user_id: scope.userId,
        event_key: normalizeNotificationEventKey(eventKey),
        receipt_state: state,
        read_at: readAt,
        created_at: now,
        updated_at: now,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["owner_user_id", "event_key"]).doUpdateSet({
        receipt_state: state,
        read_at: readAt,
        updated_at: now,
      }),
    )
    .returning(["event_key as eventKey", "receipt_state as state"]);
}

export function buildUpsertNotificationPreferencesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: NotificationPreferences & { now?: Date },
) {
  const now = input.now ?? new Date();
  return executor
    .insertInto("notification_preferences")
    .values({
      owner_user_id: scope.userId,
      comments_enabled: Boolean(input.comments),
      replies_enabled: Boolean(input.replies),
      follows_enabled: Boolean(input.follows),
      mentions_enabled: Boolean(input.mentions),
      claims_enabled: Boolean(input.claims),
      system_enabled: Boolean(input.system),
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column("owner_user_id").doUpdateSet({
        comments_enabled: Boolean(input.comments),
        replies_enabled: Boolean(input.replies),
        follows_enabled: Boolean(input.follows),
        mentions_enabled: Boolean(input.mentions),
        claims_enabled: Boolean(input.claims),
        system_enabled: Boolean(input.system),
        updated_at: now,
      }),
    )
    .returning([
      "comments_enabled as comments",
      "replies_enabled as replies",
      "follows_enabled as follows",
      "mentions_enabled as mentions",
      "claims_enabled as claims",
      "system_enabled as system",
    ]);
}

/**
 * One row's receipts, all or none (`OVE-501`, criterion 4). A grouped row is
 * one control over several events, so marking it is one statement: it was one
 * upsert per event outside a transaction, and a failure half-way left the row
 * half read while the page said nothing. The statement timeout bounds the
 * wait, so a stuck write is a failure the page can name rather than a request
 * that never answers.
 */
export async function updateNotificationReceipts(
  scope: RequestScope,
  input: {
    eventKeys: readonly string[];
    state: NotificationReceiptState;
    now?: Date;
  },
  database: Kysely<Database> = db,
): Promise<number> {
  const eventKeys = Array.from(
    new Set(input.eventKeys.map(normalizeNotificationEventKey)),
  ).slice(0, MAX_NOTIFICATION_CANDIDATES);
  if (eventKeys.length === 0) return 0;
  const state = normalizeNotificationReceiptState(input.state);
  const now = input.now ?? new Date();

  await database.transaction().execute(async (trx) => {
    await sql
      .raw(`set local statement_timeout = '${RECEIPT_STATEMENT_TIMEOUT}'`)
      .execute(trx);
    await buildUpsertNotificationReceiptsQuery(trx, scope, {
      eventKeys,
      state,
      now,
    }).execute();
  });

  return eventKeys.length;
}

export async function updateNotificationPreferences(
  scope: RequestScope,
  input: NotificationPreferences,
  executor: QueryExecutor = db,
) {
  const row = await buildUpsertNotificationPreferencesQuery(
    executor,
    scope,
    input,
  ).executeTakeFirstOrThrow();
  return mapNotificationPreferences(row);
}

export async function getNotificationPreferences(
  scope: RequestScope,
  executor: QueryExecutor = db,
): Promise<NotificationPreferences> {
  const row = await executor
    .selectFrom("notification_preferences")
    .select([
      "comments_enabled as comments",
      "replies_enabled as replies",
      "follows_enabled as follows",
      "mentions_enabled as mentions",
      "claims_enabled as claims",
      "system_enabled as system",
    ])
    .where("owner_user_id", "=", scope.userId)
    .executeTakeFirst();

  return row
    ? mapNotificationPreferences(row)
    : DEFAULT_NOTIFICATION_PREFERENCES;
}

export function serializeNotificationPage(
  rows: NotificationCandidateRow[],
  receipts: ReadonlyMap<string, string>,
  options: NotificationPageOptions = {},
  subjects: ReadonlyMap<string, NotificationObjectSubject> = new Map(),
): NotificationPage {
  const pageSize = normalizePageSize(
    options.pageSize ?? NOTIFICATION_PAGE_SIZE,
    NOTIFICATION_PAGE_SIZE,
  );
  const filter = normalizeNotificationFilter(options.filter);
  const cursor = decodeNotificationCursor(options.cursor);
  const mapped = rows
    .map((row) => serializeNotificationEvent(row, receipts, subjects))
    .filter((event): event is NotificationEvent => Boolean(event))
    .sort(compareNotificationEvents);
  const unreadCount = mapped.filter((event) => !event.read).length;
  const filtered = mapped.filter((event) => {
    if (options.unreadOnly && event.read) return false;
    if (filter !== "all" && notificationFilterForKind(event.kind) !== filter) {
      return false;
    }
    if (!cursor) return true;
    const createdAt = timestamp(event.createdAt);
    return (
      createdAt < cursor.createdAt ||
      (createdAt === cursor.createdAt && event.key > cursor.key)
    );
  });
  const visible = filtered.slice(0, pageSize);
  const last = visible.at(-1);

  return {
    items: visible,
    nextCursor:
      filtered.length > pageSize && last
        ? encodeNotificationCursor({
            createdAt: timestamp(last.createdAt),
            key: last.key,
          })
        : null,
    unreadCount,
  };
}

/**
 * Rows that say the same thing about the same target and lead to the same
 * place become one row (`OVE-501`, criterion 4): the comments on one entry,
 * the follows of one object, and nothing wider. Every reminder is about one
 * object, so no two reminders ever share a row. A group keeps everyone who
 * acted and how many of its events are unread — the page's count is the sum
 * of those, never a count of rows.
 *
 * `grouped: false` is the individual view: one row per event, same shape.
 */
export function groupNotificationEvents(
  events: NotificationEvent[],
  grouped = true,
): GroupedNotificationEvent[] {
  const groups = new Map<string, GroupedNotificationEvent>();

  for (const event of events) {
    const groupingKey = grouped
      ? `${event.summaryKey}:${event.groupKey}:${event.href}`
      : event.key;
    const existing = groups.get(groupingKey);
    if (!existing) {
      groups.set(groupingKey, {
        ...event,
        count: 1,
        unreadCount: event.read ? 0 : 1,
        eventKeys: [event.key],
        actors: event.actorMention ? [event.actorMention] : [],
      });
      continue;
    }

    existing.count += 1;
    existing.eventKeys.push(event.key);
    if (!event.read) existing.unreadCount += 1;
    existing.read = existing.read && event.read;
    if (event.actorMention && !existing.actors.includes(event.actorMention)) {
      existing.actors.push(event.actorMention);
    }
    if (timestamp(event.createdAt) > timestamp(existing.createdAt)) {
      existing.createdAt = event.createdAt;
      existing.actorMention = event.actorMention;
    }
  }

  return Array.from(groups.values()).sort(compareNotificationEvents);
}

export function notificationEventKey(
  kind: NotificationEventKind,
  rawSourceId: string,
) {
  return createHash("sha256")
    .update(`overgarden-notification:${kind}:${rawSourceId}`)
    .digest("hex")
    .slice(0, 32);
}

function serializeNotificationEvent(
  row: NotificationCandidateRow,
  receipts: ReadonlyMap<string, string>,
  subjects: ReadonlyMap<string, NotificationObjectSubject>,
): NotificationEvent | null {
  const key = notificationEventKey(row.kind, row.sourceId);
  const state = receipts.get(key);
  if (state === "dismissed") return null;

  return {
    key,
    kind: row.kind,
    category: notificationCategory(row.kind),
    summaryKey: row.summaryKey,
    createdAt: row.createdAt,
    actorMention: row.actorHandle
      ? `@${normalizeHandle(row.actorHandle)}`
      : null,
    targetLabel: row.targetLabel?.trim() || null,
    object: row.objectRef ? (subjects.get(row.objectRef) ?? null) : null,
    href: normalizeNotificationHref(row.href),
    actionKind: row.actionKind ?? defaultNotificationAction(row.kind),
    groupKey: stableOpaqueKey("notification-group", row.groupRef),
    read: state === "read",
  };
}

/** Everything another gardener did is social; the one stored kind that is
 * not is the journaling reminder. */
export function notificationCategory(
  kind: NotificationEventKind,
): NotificationCategory {
  return kind === "system" ? "reminder" : "social";
}

function mapCommentNotification(
  row: NotificationCommentRow,
): NotificationCandidateRow {
  const reply = Boolean(row.parentCommentId);
  return {
    sourceId: row.sourceId,
    kind: reply ? "reply" : "comment",
    createdAt: row.createdAt,
    actorHandle: row.actorHandle,
    targetRef: row.targetRef,
    // Which entry: a comment row used to name none, so three comments on
    // three entries read as the same sentence three times (`OVE-501`).
    targetLabel: row.entryTitle,
    objectRef: row.ownObjectId,
    // Under the author, at its number (ADR-0029 D9): the ref is an id, and
    // the row carries the handle and the number the address is built from.
    href: publicJournalEntryAddress({
      authorHandle: row.addressHandle,
      entryNumber: row.entryNumber,
      publicSlug: row.entryPublicSlug,
    }),
    summaryKey: reply ? "reply_to_comment" : "comment_on_journal",
    groupRef: `journal:${row.targetRef}`,
    actionKind: "open_journal",
  };
}

function mapNotificationPreferences(row: {
  comments: boolean;
  replies: boolean;
  follows: boolean;
  mentions: boolean;
  claims: boolean;
  system: boolean;
}): NotificationPreferences {
  return {
    comments: Boolean(row.comments),
    replies: Boolean(row.replies),
    follows: Boolean(row.follows),
    mentions: Boolean(row.mentions),
    claims: Boolean(row.claims),
    system: Boolean(row.system),
  };
}

function profileFollowPredicate(userId: string) {
  return sql<boolean>`exists (
    select 1 from "profile_follows"
    where profile_follows.follower_user_id = ${userId}
      and profile_follows.target_user_id = ${sql.ref("entries.owner_user_id")}
      and profile_follows.follow_state = 'active'
  )`;
}

function objectFollowPredicate(userId: string) {
  return sql<boolean>`exists (
    select 1 from "engagement_follows"
    where engagement_follows.follower_user_id = ${userId}
      and engagement_follows.target_kind = 'lineage_object'
      and engagement_follows.target_ref = ${sql.ref("entries.plant_object_id")}::text
      and engagement_follows.follow_state = 'active'
  )`;
}

function topicFollowPredicate(userId: string) {
  return sql<boolean>`exists (
    select 1
    from "engagement_follows"
    inner join "journal_topics"
      on journal_topics.slug = engagement_follows.target_ref
      and journal_topics.trust_state = 'curated'
    inner join "journal_entry_topic_signals"
      on journal_entry_topic_signals.topic_id = journal_topics.id
      and journal_entry_topic_signals.journal_entry_id = ${sql.ref("entries.id")}
      and journal_entry_topic_signals.review_state = 'accepted'
      and journal_entry_topic_signals.public_membership_state = 'eligible'
    where engagement_follows.follower_user_id = ${userId}
      and engagement_follows.target_kind = 'topic'
      and engagement_follows.follow_state = 'active'
  )`;
}

function lineageFollowPredicate(userId: string) {
  return sql<boolean>`exists (
    select 1 from "lineage_node_follows"
    where lineage_node_follows.follower_user_id = ${userId}
      and lineage_node_follows.target_plant_object_id = ${sql.ref("entries.plant_object_id")}
      and lineage_node_follows.follow_state = 'active'
  )`;
}

function followedSourcePredicate(
  source: FollowedFeedSource,
  predicates: {
    profileFollow: ReturnType<typeof profileFollowPredicate>;
    objectFollow: ReturnType<typeof objectFollowPredicate>;
    topicFollow: ReturnType<typeof topicFollowPredicate>;
    lineageFollow: ReturnType<typeof lineageFollowPredicate>;
  },
) {
  switch (source) {
    case "people":
      return predicates.profileFollow;
    case "objects":
      return sql<boolean>`(${predicates.objectFollow} or ${predicates.lineageFollow})`;
    case "topics":
      return predicates.topicFollow;
    case "all":
      return sql<boolean>`(
        ${predicates.profileFollow}
        or ${predicates.objectFollow}
        or ${predicates.topicFollow}
        or ${predicates.lineageFollow}
      )`;
  }
}

function noActiveBlockPredicate(userId: string, actorRef: string) {
  return sql<boolean>`not exists (
    select 1 from "profile_blocks"
    where profile_blocks.block_state = 'active'
      and (
        (profile_blocks.blocker_user_id = ${userId}
          and profile_blocks.blocked_user_id = ${sql.ref(actorRef)})
        or
        (profile_blocks.blocker_user_id = ${sql.ref(actorRef)}
          and profile_blocks.blocked_user_id = ${userId})
      )
  )`;
}

function notificationEnabled(
  kind: NotificationEventKind,
  preferences: NotificationPreferences,
) {
  switch (kind) {
    case "comment":
      return preferences.comments;
    case "reply":
      return preferences.replies;
    case "profile_follow":
    case "object_follow":
    case "lineage_follow":
      return preferences.follows;
    case "mention":
      return preferences.mentions;
    case "claim":
    case "question":
      return preferences.claims;
    case "system":
      return preferences.system;
  }
}

function notificationFilterForKind(
  kind: NotificationEventKind,
): NotificationFilter {
  switch (kind) {
    case "comment":
    case "reply":
      return "comments";
    case "profile_follow":
    case "object_follow":
    case "lineage_follow":
      return "follows";
    case "mention":
      return "mentions";
    case "claim":
    case "question":
      return "claims";
    case "system":
      return "reminders";
  }
}

function defaultNotificationAction(
  kind: NotificationEventKind,
): NotificationActionKind {
  switch (kind) {
    case "comment":
    case "reply":
      return "open_journal";
    case "profile_follow":
      return "open_profile";
    case "object_follow":
    case "lineage_follow":
      return "open_object";
    case "mention":
    case "claim":
      return "review_claims";
    case "question":
      return "open_questions";
    case "system":
      return "continue_journal";
  }
}

function compareNotificationEvents(
  left: Pick<NotificationEvent, "createdAt" | "key">,
  right: Pick<NotificationEvent, "createdAt" | "key">,
) {
  const dateDelta = timestamp(right.createdAt) - timestamp(left.createdAt);
  return dateDelta || left.key.localeCompare(right.key);
}

function normalizePageSize(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value)));
}

function normalizeFollowedFeedSource(value: string): FollowedFeedSource {
  if (
    value === "all" ||
    value === "people" ||
    value === "objects" ||
    value === "topics"
  ) {
    return value;
  }
  return "all";
}

function normalizeFollowedFeedObjectKind(
  value: string,
): FollowedFeedObjectKind {
  if (value === "plant" || value === "animal") {
    return value;
  }
  return "all";
}

/** A filter from an address; `system` is the reminders' old name. */
export function normalizeNotificationFilter(
  value: string | null | undefined,
): NotificationFilter {
  if (
    value === "comments" ||
    value === "follows" ||
    value === "mentions" ||
    value === "claims" ||
    value === "reminders"
  ) {
    return value;
  }
  return value === "system" ? "reminders" : "all";
}

function normalizeNotificationEventKey(value: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(normalized)) {
    throw new Error("Notification event is not available.");
  }
  return normalized;
}

function normalizeNotificationReceiptState(
  value: string,
): NotificationReceiptState {
  if (value === "unread" || value === "read" || value === "dismissed") {
    return value;
  }
  throw new Error("Notification receipt state is not available.");
}

function normalizeNotificationHref(value: string) {
  const href = String(value ?? "").trim();
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) {
    return "/notifications";
  }
  return href;
}

function normalizeHandle(value: string) {
  return value.trim().replace(/^@/, "").slice(0, 40) || "gardener";
}

function summarizePublicText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

function stableOpaqueKey(namespace: string, value: string) {
  return createHash("sha256")
    .update(`${namespace}:${value}`)
    .digest("hex")
    .slice(0, 24);
}

function encodeFollowedFeedCursor(cursor: FollowedFeedCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeFollowedFeedCursor(
  value: string | null | undefined,
): FollowedFeedCursor | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<FollowedFeedCursor>;
    if (
      typeof parsed.publishedAt !== "string" ||
      !Number.isFinite(new Date(parsed.publishedAt).getTime()) ||
      typeof parsed.publicSlug !== "string" ||
      !/^[\p{Letter}\p{Number}-]{1,160}$/u.test(parsed.publicSlug)
    ) {
      return null;
    }
    return {
      publishedAt: new Date(parsed.publishedAt).toISOString(),
      publicSlug: parsed.publicSlug,
    };
  } catch {
    return null;
  }
}

function encodeNotificationCursor(cursor: { createdAt: number; key: string }) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeNotificationCursor(value: string | null | undefined) {
  if (!value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { createdAt?: unknown; key?: unknown };
    if (
      typeof parsed.createdAt !== "number" ||
      !Number.isFinite(parsed.createdAt) ||
      typeof parsed.key !== "string" ||
      !/^[a-f0-9]{32}$/.test(parsed.key)
    ) {
      return null;
    }
    return { createdAt: parsed.createdAt, key: parsed.key };
  } catch {
    return null;
  }
}

function timestamp(value: Date | string) {
  const result =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
}

function toIsoString(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
