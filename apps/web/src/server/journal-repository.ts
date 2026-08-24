import "server-only";
import { publicMediaEligibilityPredicate } from "@/server/media/public-media-eligibility";

import { sql, type Insertable, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  Database,
  CatalogKind,
  EntryLifecycleState,
  EntryScope,
  JournalEntry,
  LocationVisibility,
  PlantObject,
  PlantObjectKind,
  Space,
  VarietyState,
} from "@/db/schema";
import type { Json } from "@/db/generated";
import { normalizeCoarseRegionCode } from "@/lib/garden/regions";
import {
  MAX_PUBLIC_JOURNAL_SLUG_LENGTH,
  normalizePublicJournalSlug,
} from "@/lib/garden/public-journal-slug";
import type { JournalMentionSelection } from "@/lib/garden/journal-mentions";
import {
  localizedPublicJournalEvidencePath,
  publicJournalEntryPath,
  publicLineageObjectPath,
  publicProfilePath,
  publicTopicPath,
} from "@/lib/garden/public-paths";
import {
  normalizePlantObjectKind,
  resolveObjectKindForCatalogSelection,
} from "@/lib/garden/catalog-object-kind";
import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import type { PublicProjectionQualityClass } from "@/lib/public-projection-quality";
import { getPublicDerivativeUrl } from "@/lib/storage";
import {
  SELECTABLE_CATALOG_STATUSES,
  createUserAddedCatalogCandidate,
  findSelectableCatalogItem,
} from "@/server/catalog-repository";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";
import { persistJournalEntryMentions } from "@/server/journal-mention-repository";
import {
  persistJournalEntryTopicSignals,
  refreshJournalEntryTopicSignalsForPlantObject,
} from "@/server/journal-topic-repository";
import { enqueueLearningAttributionIntent } from "@/server/mvp-learning/attribution-outbox";
import type { RequestScope } from "@/server/request-scope";
import { FIRST_PUBLICATION_DISCLOSURE_VERSION } from "@/lib/privacy/disclosures";
import { assertNoPreciseLocationText } from "@/lib/privacy/precise-location-text";
import {
  claimJournalEntryCover,
  claimOrderedInlineMediaForEntry,
  journalRevisionNumber,
  resolveJournalContentForWrite,
  writeJournalMutationReceipt,
  JournalAggregateConflictError,
  readJournalDocumentFromEntry,
  type JournalCoverClaimInput,
} from "@/server/journal-document-persistence";
import {
  buildEnqueueMediaDerivativeRevokeJobQuery,
  buildEnqueueMediaStagingFinalizeJobQuery,
  enqueueArchiveDerivativeRevokes,
} from "@/server/media/media-lifecycle-enqueue";
import {
  buildInsertClaimedEphemeralEditMediaQuery,
  buildReplaceClaimedEphemeralMediaQuery,
  insertClaimedEphemeralMediaForEntry,
} from "@/server/media/media-repository";
import type { ClaimedEphemeralPublicationMedia } from "@/server/media/ephemeral-publication-handoff";
import {
  recordPublicProjectionIntent,
  recordPublicProjectionIntentsForPlantObject,
} from "@/server/search/public-projection-outbox";
import type { JournalCoverSource } from "@/lib/garden/journal-cover-contract";
import {
  listJournalDocumentImageMediaIds,
  type JournalDocumentV1,
} from "@/lib/garden/journal-document";
import { blockOrderHashFromDocument } from "@/server/mvp-learning/composer-signals";
import type { AtomicJournalEditFocalPoint } from "@/lib/garden/entry-contracts";
import { journalEntryDateInputValue } from "@/lib/garden/journal-entry-date";
import { stableJson } from "@/lib/media/ephemeral-staging-crypto";
import {
  isAtomicJournalEditPublicPath,
  validateAtomicJournalEditMediaPlan,
} from "@/server/atomic-journal-edit-contract";

export { JournalAggregateConflictError, readJournalDocumentFromEntry };

const MAX_TITLE_LENGTH = 140;
const MAX_NAME_LENGTH = 120;
const MAX_RECENT_ITEMS = 20;
const MAX_PUBLIC_SLUG_LENGTH = MAX_PUBLIC_JOURNAL_SLUG_LENGTH;
const MAX_RELATED_PUBLIC_JOURNAL_ENTRIES = 3;
const MAX_OBJECT_GALLERY_MEDIA = 6;
const MAX_PUBLIC_JOURNAL_MEDIA = 10;
const MAX_PUBLIC_JOURNAL_TOPICS = 8;
const MAX_PUBLIC_JOURNAL_MENTIONED_OBJECTS = 6;
const MAX_PUBLIC_JOURNAL_MENTIONED_PROFILES = 8;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_LOCATION_VISIBILITY: LocationVisibility = "hidden";

type QueryExecutor = Kysely<Database> | Transaction<Database>;
type NewJournalEntryRow = Insertable<Database["journal_entries"]>;

export interface AtomicCreatePublicationInput {
  publishId: string;
  requestDigest: string;
  disclosureAccepted: boolean;
  coverMediaAssetId: string | null;
  handoff: {
    stagingSessionId: string;
    receiptSetDigest: string;
    publicMedia: readonly ClaimedEphemeralPublicationMedia[];
  } | null;
}

export interface CreateFirstPlantEntryInput {
  spaceId?: string | null;
  spaceName?: string | null;
  plantName: string;
  objectKind?: string | null;
  catalogItemId?: string | null;
  userAddedCatalogName?: string | null;
  varietyText?: string | null;
  title: string;
  contentDocument: unknown;
  entryDate?: string | null;
  locationVisibility?: string | null;
  coarseRegionCode?: string | null;
  clientMutationId: string;
  cover?: JournalCoverClaimInput | null;
  mentionSelections?: JournalMentionSelection[];
  topicTags?: unknown;
  internalDeterministicIds?: {
    spaceId: string;
    plantObjectId: string;
    entryId: string;
  };
  atomicPublication: AtomicCreatePublicationInput;
}

export interface CreatePlantObjectJournalEntryInput {
  plantObjectId: string;
  title: string;
  contentDocument: unknown;
  entryDate?: string | null;
  clientMutationId: string;
  cover?: JournalCoverClaimInput | null;
  mentionSelections?: JournalMentionSelection[];
  topicTags?: unknown;
  internalDeterministicIds?: {
    entryId: string;
  };
  atomicPublication: AtomicCreatePublicationInput;
}

export interface CreateSpaceJournalEntryInput {
  spaceId: string;
  mentionedPlantObjectIds: string[];
  title: string;
  contentDocument: unknown;
  entryDate?: string | null;
  clientMutationId: string;
  cover?: JournalCoverClaimInput | null;
  topicTags?: unknown;
  internalDeterministicIds?: {
    entryId: string;
  };
  atomicPublication: AtomicCreatePublicationInput;
}

export interface ArchiveJournalEntryInput {
  entryId: string;
}

export interface ArchiveJournalEntryResult {
  entry: JournalEntry;
  publicUrl: string | null;
  publicGone: boolean;
}

export interface ResolvePlantObjectCatalogInput {
  plantObjectId: string;
  catalogItemId: string;
}

export interface ResolvePlantObjectCatalogOptions {
  /**
   * Allows an owner-scoped adjacent receipt to commit with catalog resolution.
   * Callers may not perform external effects here.
   */
  afterResolve?: (input: {
    transaction: Transaction<Database>;
    plantObjectId: string;
    catalogItemId: string;
  }) => Promise<void>;
}

export interface UpdatePlantObjectLocationInput {
  plantObjectId: string;
  locationVisibility?: string | null;
  coarseRegionCode?: string | null;
}

export interface PlantObjectCatalogResolutionResult {
  space: PlantObjectPage["space"];
  plantObject: PlantObjectPage["plantObject"];
  entryCount: number;
  publicEntryPaths: string[];
}

export interface PlantObjectLocationUpdateResult {
  space: PlantObjectPage["space"];
  plantObject: PlantObjectPage["plantObject"];
  publicEntryPaths: string[];
}

export interface PlantObjectSummary {
  id: string;
  displayName: string;
  objectKind: PlantObjectKind;
  spaceDisplayName: string;
  catalogItemId: string | null;
  catalogKind: CatalogKind | null;
  varietyText: string | null;
  varietyState: VarietyState;
  createdAt: Date;
  entryCount: number;
  publicEntryCount: number;
  archivedEntryCount: number;
  latestEntryDate: Date | string | null;
  coverMedia: {
    publicUrl: string;
    altText: string;
    focalX: number;
    focalY: number;
    intrinsicWidth: number | null;
    intrinsicHeight: number | null;
  } | null;
}

export interface SpaceTimelineObjectSummary {
  id: string;
  displayName: string;
  objectKind: PlantObjectKind;
  catalogKind: CatalogKind | null;
  varietyText: string | null;
  varietyState: VarietyState;
}

export interface SpaceJournalTimeline {
  space: Pick<
    Space,
    "id" | "display_name" | "location_visibility" | "coarse_region_code"
  >;
  objects: SpaceTimelineObjectSummary[];
  entries: JournalEntryReadback[];
}

export interface PlantObjectPage {
  space: Pick<
    Space,
    "id" | "display_name" | "location_visibility" | "coarse_region_code"
  >;
  plantObject: {
    id: PlantObject["id"];
    display_name: PlantObject["display_name"];
    object_kind: PlantObjectKind;
    catalog_item_id: PlantObject["catalog_item_id"];
    catalog_kind: CatalogKind | null;
    catalog_canonical_name: string | null;
    catalog_public_slug: string | null;
    variety_text: PlantObject["variety_text"];
    variety_state: VarietyState;
    location_visibility: PlantObject["location_visibility"];
    coarse_region_code: PlantObject["coarse_region_code"];
    source_credit: PlantObjectCatalogSourceCredit | null;
  };
  hasPriorPublicationDisclosure: boolean;
  entries: JournalEntryReadback[];
  gallery_media: EntryMediaReadback[];
}

export interface PlantObjectCatalogSourceCredit {
  sourceSlug: string;
  sourceName: string;
  sourceUrl: string;
  attributionText: string | null;
}

export interface EntryMediaReadback {
  id: string;
  derivativeKey: string;
  publicUrl: string;
  focalX: number;
  focalY: number;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
}

export interface MentionedPlantObjectReadback {
  id: string;
  displayName: string;
}

export type JournalEntryTimelineRelation =
  | "direct_object"
  | "mentioned_space"
  | "space_timeline";

export type JournalEntryReadback = JournalEntry & {
  media: EntryMediaReadback | null;
  mentionedObjects: MentionedPlantObjectReadback[];
  timelineRelation: JournalEntryTimelineRelation;
};

export interface PublicJournalEntryPage {
  entry: {
    id: string;
    title: string;
    body: string;
    contentDocument: unknown | null;
    contentSchemaVersion: number | null;
    entryDate: Date | string;
    createdAt: Date | string;
    entryScope: EntryScope;
    publicSlug: string;
    publicPath: string;
    publicNoindex: boolean;
    publishedAt: Date | string | null;
  };
  context: PublicJournalEntryContext;
  author: {
    handle: string;
    mention: string;
    displayName: string;
    avatarUrl: string | null;
    profilePath: string;
  } | null;
  topics: PublicJournalEntryTopic[];
  relatedEntries: PublicJournalEntryRelatedEntry[];
  adjacentEntries: {
    newer: PublicJournalEntryRelatedEntry | null;
    older: PublicJournalEntryRelatedEntry | null;
  };
  media: PublicJournalEntryMedia[];
  mentionedProfiles: PublicJournalEntryMentionedProfile[];
  qualityClass?: PublicProjectionQualityClass;
}

export interface PublicJournalEntryMentionedProfile {
  handle: string;
  mention: `@${string}`;
  displayName: string;
  profilePath: string;
}

export interface PublicJournalEntrySpaceContext {
  kind: "space";
  space: PublicJournalEntrySafeSpace;
  mentionedObjects: PublicJournalEntryMentionedObject[];
}

export interface PublicJournalEntryObjectContext {
  kind: "object";
  space: PublicJournalEntrySafeSpace;
  object: PublicJournalEntryObject;
}

export type PublicJournalEntryContext =
  | PublicJournalEntrySpaceContext
  | PublicJournalEntryObjectContext;

export interface PublicJournalEntrySafeSpace {
  displayName: string;
  locationVisibility: LocationVisibility;
  coarseRegionCode: string | null;
}

export interface PublicJournalEntryObject {
  plantObjectId: string;
  displayName: string;
  objectKind: PlantObjectKind;
  catalogKind: CatalogKind | null;
  catalogCanonicalName: string | null;
  catalogPublicSlug: string | null;
  publicPath: string;
  varietyText: string | null;
  varietyState: VarietyState;
  locationVisibility: LocationVisibility;
  coarseRegionCode: string | null;
}

export interface PublicJournalEntryMentionedObject {
  plantObjectId: string;
  displayName: string;
  objectKind: PlantObjectKind;
  catalogCanonicalName: string | null;
  catalogPublicSlug: string | null;
  publicPath: string;
  varietyText: string | null;
  varietyState: VarietyState;
}

export interface PublicJournalEntryMedia {
  id: string;
  publicUrl: string;
  altText: string | null;
  caption: string | null;
  focalX: number;
  focalY: number;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
}

export interface PublicJournalEntryTopic {
  slug: string;
  label: string;
  publicPath: string;
}

export interface PublicJournalEntryRelatedEntry {
  id: string;
  title: string;
  bodyPreview: string;
  entryDate: Date | string;
  publicSlug: string;
  publicPath: string;
}

interface PublicJournalEntryRootRow {
  entryId: string;
  title: string;
  body: string;
  contentDocument: unknown | null;
  contentSchemaVersion: number | null;
  entryDate: Date | string;
  entryCreatedAt: Date | string;
  entryScope: string;
  visibility: string;
  lifecycleState: string;
  publicSlug: string | null;
  publicNoindex: boolean;
  publishedAt: Date | string | null;
  publicGoneAt: Date | string | null;
  spaceId: string;
  spaceDisplayName: string;
  spaceLocationVisibility: string;
  spaceCoarseRegionCode: string | null;
  plantObjectId: string | null;
  objectDisplayName: string | null;
  objectKind: string | null;
  catalogKind: string | null;
  catalogCanonicalName: string | null;
  catalogPublicSlug: string | null;
  varietyText: string | null;
  varietyState: string | null;
  objectLocationVisibility: string | null;
  objectCoarseRegionCode: string | null;
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
}

interface PublicJournalEntryMediaRow {
  id: string;
  derivativeKey: string;
  altText: string | null;
  caption: string | null;
}

interface PublicJournalEntryTopicRow {
  slug: string;
  label: string;
}

interface PublicJournalEntryMentionedObjectRow {
  plantObjectId: string;
  displayName: string;
  objectKind: string;
  varietyText: string | null;
  varietyState: string;
  catalogCanonicalName: string | null;
  catalogPublicSlug: string | null;
}

interface PublicJournalEntryMentionedProfileRow {
  handle: string;
  displayName: string | null;
}

interface PublicJournalEntryRelatedRow {
  entryId: string;
  title: string;
  body: string;
  entryDate: Date | string;
  publicSlug: string;
}

export interface GonePublicJournalEntryPage {
  publicSlug: string;
  publicGoneAt: Date | string;
  publicNoindex: boolean;
}

export type PublicJournalEntryLookup =
  | {
      status: "active";
      page: PublicJournalEntryPage;
    }
  | {
      status: "gone";
      entry: GonePublicJournalEntryPage;
    }
  | {
      status: "not_found";
    };

export type PublicJournalEntryLifecycleLookup =
  | { status: "active" }
  | { status: "gone"; publicSlug: string }
  | { status: "not_found" };

interface PublicJournalEntryLifecycleRow {
  entryScope: string;
  visibility: string;
  lifecycleState: string;
  publicSlug: string | null;
  publicGoneAt: Date | string | null;
  plantObjectId: string | null;
  joinedPlantObjectId: string | null;
}

export interface FirstPlantEntryResult {
  space: PlantObjectPage["space"];
  plantObject: PlantObjectPage["plantObject"];
  entry: JournalEntry;
  isNewEntry: boolean;
  mediaAttached: boolean;
  priorObjectEntryCount: number;
}

export interface PlantObjectJournalEntryResult {
  space: PlantObjectPage["space"];
  plantObject: PlantObjectPage["plantObject"];
  entry: JournalEntry;
  isNewEntry: boolean;
  mediaAttached: boolean;
  priorObjectEntryCount: number;
}

export interface SpaceJournalEntryResult {
  space: Pick<
    Space,
    "id" | "display_name" | "location_visibility" | "coarse_region_code"
  >;
  entry: JournalEntry;
  mentionedObjects: MentionedPlantObjectReadback[];
  isNewEntry: boolean;
  mediaAttached: boolean;
}

export interface CommittedAtomicJournalCreateReadback {
  entry: JournalEntry;
  publicMedia: Array<{
    mediaAssetId: string;
    publicPath: string;
  }>;
  finalizeHandoff: {
    stagingSessionId: string;
    receiptSetDigest: string;
  } | null;
}

export interface AtomicJournalEditMediaBaseline {
  mediaAssetId: string;
  generation: number;
  publicPath: string;
  publicUrl: string;
  focalX: number;
  focalY: number;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
  caption: string | null;
  altText: string | null;
  usageRole: "inline" | "cover_only";
  documentPosition: number | null;
}

export interface AtomicJournalEditBaseline {
  entry: JournalEntry;
  document: JournalDocumentV1;
  media: AtomicJournalEditMediaBaseline[];
}

export interface AtomicJournalEditReadback {
  entry: JournalEntry;
  publicMedia: Array<{
    mediaAssetId: string;
    publicPath: string;
  }>;
  finalizeHandoff: {
    stagingSessionId: string;
    receiptSetDigest: string;
  } | null;
  isReplay: boolean;
}

export interface AtomicJournalEditInput {
  entryId: string;
  mutationPrefix: string;
  mutationReceiptId: string;
  expectedRevision: number;
  title: string;
  entryDate: string;
  document: JournalDocumentV1;
  coverMediaAssetId: string | null;
  finalMediaAssetIds: readonly string[];
  retainedMediaAssetIds: readonly string[];
  removedMediaAssetIds: readonly string[];
  focalPoints: readonly AtomicJournalEditFocalPoint[];
  handoff: {
    stagingSessionId: string;
    receiptSetDigest: string;
    publicMedia: readonly ClaimedEphemeralPublicationMedia[];
  } | null;
}

/**
 * Owner-scoped, public-only baseline for the OVE-348 atomic editor. A private,
 * archived, malformed, revoked, or partially linked aggregate is
 * intentionally indistinguishable from a missing entry at this boundary.
 */
export async function readAtomicJournalEditBaseline(
  scope: RequestScope,
  entryId: string,
  executor: QueryExecutor = db,
): Promise<AtomicJournalEditBaseline> {
  const entry = await buildFindJournalEntryByIdQuery(
    executor,
    scope,
    entryId,
  ).executeTakeFirst();
  if (
    !entry ||
    entry.visibility !== "public" ||
    entry.lifecycle_state !== "active" ||
    !entry.public_slug ||
    !entry.published_at ||
    entry.public_gone_at !== null
  ) {
    return atomicEditUnavailable();
  }

  const documentRead = readJournalDocumentFromEntry(entry);
  if (documentRead.status === "unavailable") {
    return atomicEditUnavailable();
  }
  const document = documentRead.document;
  const expectedIds = listJournalDocumentImageMediaIds(document);
  if (
    entry.cover_media_asset_id &&
    !expectedIds.includes(entry.cover_media_asset_id)
  ) {
    expectedIds.push(entry.cover_media_asset_id);
  }
  if (new Set(expectedIds).size !== expectedIds.length) {
    return atomicEditUnavailable();
  }

  const rows = await executor
    .selectFrom("media_assets")
    .select([
      "id",
      "upload_generation",
      "derivative_key",
      "revoked_at",
      "focal_x",
      "focal_y",
      "intrinsic_width",
      "intrinsic_height",
      "caption",
      "alt_text",
      "usage_role",
      "document_position",
    ])
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "=", entry.id)
    .orderBy("document_position", "asc")
    .orderBy("id", "asc")
    .execute();
  const rowById = new Map(rows.map((row) => [row.id, row]));
  if (
    rows.length !== expectedIds.length ||
    expectedIds.some((id) => !rowById.has(id)) ||
    rows.some(
      (row) =>
        !row.derivative_key ||
        !isAtomicJournalEditPublicPath(row.derivative_key) ||
        row.revoked_at !== null ||
        (row.usage_role !== "inline" && row.usage_role !== "cover_only"),
    )
  ) {
    return atomicEditUnavailable();
  }

  return {
    entry,
    document,
    media: expectedIds.map((mediaAssetId) => {
      const row = rowById.get(mediaAssetId)!;
      const publicPath = row.derivative_key!;
      return {
        mediaAssetId,
        generation: Math.max(1, Number(row.upload_generation ?? 1)),
        publicPath,
        publicUrl: getPublicDerivativeUrl(publicPath),
        focalX: Number(row.focal_x ?? 0.5),
        focalY: Number(row.focal_y ?? 0.5),
        intrinsicWidth: row.intrinsic_width,
        intrinsicHeight: row.intrinsic_height,
        caption: row.caption,
        altText: row.alt_text,
        usageRole: row.usage_role as "inline" | "cover_only",
        documentPosition: row.document_position,
      };
    }),
  };
}

export async function readCommittedAtomicJournalEdit(
  scope: RequestScope,
  input: Omit<
    AtomicJournalEditInput,
    "retainedMediaAssetIds" | "removedMediaAssetIds" | "handoff"
  > & {
    receiptSetDigest: string | null;
  },
): Promise<AtomicJournalEditReadback | null> {
  return readCommittedAtomicJournalEditWithExecutor(scope, input, db);
}

async function readCommittedAtomicJournalEditWithExecutor(
  scope: RequestScope,
  input: Omit<
    AtomicJournalEditInput,
    "retainedMediaAssetIds" | "removedMediaAssetIds" | "handoff"
  > & {
    receiptSetDigest: string | null;
  },
  executor: QueryExecutor,
): Promise<AtomicJournalEditReadback | null> {
  const receipts = await executor
    .selectFrom("journal_entry_mutation_receipts")
    .selectAll()
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "=", input.entryId)
    .where("mutation_kind", "=", "edit")
    .where("client_mutation_id", "like", `${input.mutationPrefix}%`)
    .execute();
  if (receipts.length === 0) return null;
  const receipt = receipts.find(
    (candidate) => candidate.client_mutation_id === input.mutationReceiptId,
  );
  if (
    receipts.length !== 1 ||
    !receipt ||
    Number(receipt.base_revision) !== input.expectedRevision ||
    Number(receipt.result_revision) !== input.expectedRevision + 1
  ) {
    return invalidAtomicReplay();
  }

  const baseline = await readAtomicJournalEditBaseline(
    scope,
    input.entryId,
    executor,
  );
  const normalizedTitle = normalizeJournalEntryTitle(input.title);
  const replayChecks = {
    revision:
      journalRevisionNumber(baseline.entry.journal_revision) ===
      input.expectedRevision + 1,
    title: baseline.entry.title === normalizedTitle,
    entryDate: journalEntryDateMatches(
      baseline.entry.entry_date,
      input.entryDate,
    ),
    document: stableJson(baseline.document) === stableJson(input.document),
    cover: baseline.entry.cover_media_asset_id === input.coverMediaAssetId,
    mediaSet: sameStringSet(
      baseline.media.map((item) => item.mediaAssetId),
      input.finalMediaAssetIds,
    ),
    focal: focalPointsMatch(baseline.media, input.focalPoints),
  };
  if (Object.values(replayChecks).some((passed) => !passed)) {
    return invalidAtomicReplay();
  }

  let finalizeHandoff: AtomicJournalEditReadback["finalizeHandoff"] = null;
  if (input.receiptSetDigest) {
    const job = await executor
      .selectFrom("job_queue")
      .select(["idempotency_key", "payload"])
      .where("queue_name", "=", "media_lifecycle")
      .where(
        "idempotency_key",
        "=",
        `media_staging_finalize:${input.entryId}:${input.receiptSetDigest}`,
      )
      .executeTakeFirst();
    if (!job) return invalidAtomicReplay();
    finalizeHandoff = parseAtomicFinalizeHandoff(job, input.entryId);
  }

  const mediaById = new Map(
    baseline.media.map((item) => [item.mediaAssetId, item]),
  );
  return {
    entry: baseline.entry,
    publicMedia: input.finalMediaAssetIds.map((mediaAssetId) => ({
      mediaAssetId,
      publicPath: mediaById.get(mediaAssetId)!.publicPath,
    })),
    finalizeHandoff,
    isReplay: true,
  };
}

export async function updateAtomicJournalEntry(
  scope: RequestScope,
  input: AtomicJournalEditInput,
): Promise<
  AtomicJournalEditReadback & {
    learning?: {
      priorBlockOrderHash: string;
      nextBlockOrderHash: string;
      priorCoverSource: JournalCoverSource;
      nextCoverSource: JournalCoverSource;
      document: JournalDocumentV1;
    };
  }
> {
  const entryId = normalizeRequiredText(input.entryId, "Entry id", 200);
  const expectedRevision = Math.trunc(Number(input.expectedRevision));
  if (
    !Number.isFinite(expectedRevision) ||
    expectedRevision < 1 ||
    !input.mutationReceiptId.startsWith(input.mutationPrefix)
  ) {
    throw new Error("atomic_edit_request_invalid");
  }
  const title = normalizeJournalEntryTitle(input.title);
  const entryDate = normalizeEntryDate(input.entryDate);
  const content = resolveJournalContentForWrite({
    contentDocument: input.document,
    requireStructured: true,
  });
  const expectedFinalIds = [...content.mediaAssetIds];
  if (
    input.coverMediaAssetId &&
    !expectedFinalIds.includes(input.coverMediaAssetId)
  ) {
    expectedFinalIds.push(input.coverMediaAssetId);
  }
  if (
    stableJson(content.document) !== stableJson(input.document) ||
    !sameOrderedStrings(expectedFinalIds, input.finalMediaAssetIds)
  ) {
    throw new Error("atomic_media_claim_mismatch");
  }

  return db.transaction().execute(async (trx) => {
    await sql`set local statement_timeout = '3000ms'`.execute(trx);
    await sql`set local lock_timeout = '2750ms'`.execute(trx);
    await buildJournalMutationAdvisoryLockQuery(scope, entryId).execute(trx);

    const replay = await readCommittedAtomicJournalEditWithExecutor(
      scope,
      {
        entryId,
        mutationPrefix: input.mutationPrefix,
        mutationReceiptId: input.mutationReceiptId,
        expectedRevision,
        title: input.title,
        entryDate: input.entryDate,
        document: input.document,
        coverMediaAssetId: input.coverMediaAssetId,
        finalMediaAssetIds: input.finalMediaAssetIds,
        focalPoints: input.focalPoints,
        receiptSetDigest: input.handoff?.receiptSetDigest ?? null,
      },
      trx,
    );
    if (replay) return replay;

    const existing = await readAtomicJournalEditBaseline(scope, entryId, trx);
    const currentRevision = journalRevisionNumber(
      existing.entry.journal_revision,
    );
    if (currentRevision !== expectedRevision) {
      throw new JournalAggregateConflictError(currentRevision);
    }
    const mediaPlan = validateAtomicJournalEditMediaPlan({
      currentMedia: existing.media,
      finalMediaAssetIds: input.finalMediaAssetIds,
      retainedMediaAssetIds: input.retainedMediaAssetIds,
      removedMediaAssetIds: input.removedMediaAssetIds,
      claimedMedia: input.handoff?.publicMedia ?? [],
      focalPoints: input.focalPoints,
    });
    if (
      (mediaPlan.replacements.length > 0 || mediaPlan.additions.length > 0) &&
      !input.handoff
    ) {
      throw new Error("atomic_media_claim_mismatch");
    }

    const nextRevision = currentRevision + 1;
    const updated = await trx
      .updateTable("journal_entries")
      .set({
        title,
        body: content.body,
        content_document: journalDocumentAsJson(content.document),
        content_schema_version: content.contentSchemaVersion,
        journal_revision: nextRevision,
        entry_date: entryDate,
        updated_at: new Date(),
      })
      .where("id", "=", entryId)
      .where("owner_user_id", "=", scope.userId)
      .where("journal_revision", "=", String(expectedRevision))
      .where("visibility", "=", "public")
      .where("lifecycle_state", "=", "active")
      .where("public_slug", "is not", null)
      .where("published_at", "is not", null)
      .where("public_gone_at", "is", null)
      .returningAll()
      .executeTakeFirst();
    if (!updated) {
      const latest = await readAtomicJournalEditBaseline(scope, entryId, trx);
      throw new JournalAggregateConflictError(
        journalRevisionNumber(latest.entry.journal_revision),
      );
    }

    for (const replacement of mediaPlan.replacements) {
      await buildEnqueueMediaDerivativeRevokeJobQuery(trx, {
        bucket: "public_derivative",
        objectKey: replacement.priorPublicPath,
        reason: "orphan",
        journalEntryId: entryId,
      }).execute();
      const replaced = await buildReplaceClaimedEphemeralMediaQuery(trx, {
        ownerUserId: scope.userId,
        journalEntryId: entryId,
        priorGeneration: replacement.priorGeneration,
        priorPublicPath: replacement.priorPublicPath,
        media: replacement,
      }).executeTakeFirst();
      if (!replaced) throw new Error("atomic_media_claim_mismatch");
    }
    for (const addition of mediaPlan.additions) {
      const inserted = await buildInsertClaimedEphemeralEditMediaQuery(trx, {
        ownerUserId: scope.userId,
        journalEntryId: entryId,
        media: addition,
      }).executeTakeFirst();
      if (!inserted) throw new Error("atomic_media_claim_mismatch");
    }

    await claimOrderedInlineMediaForEntry(trx, scope, {
      journalEntryId: entryId,
      orderedMediaAssetIds: content.mediaAssetIds,
      preserveDetachedMediaAssetIds:
        input.coverMediaAssetId &&
        !content.mediaAssetIds.includes(input.coverMediaAssetId)
          ? [input.coverMediaAssetId]
          : [],
    });
    await claimJournalEntryCover(trx, scope, {
      journalEntryId: entryId,
      cover: input.coverMediaAssetId
        ? content.mediaAssetIds.includes(input.coverMediaAssetId)
          ? {
              mode: "explicit_inline",
              mediaAssetId: input.coverMediaAssetId,
            }
          : { mode: "separate", mediaAssetId: input.coverMediaAssetId }
        : { mode: "none" },
      orderedInlineMediaAssetIds: content.mediaAssetIds,
    });
    for (const focalPoint of input.focalPoints) {
      const focalUpdated = await trx
        .updateTable("media_assets")
        .set({
          focal_x: focalPoint.x,
          focal_y: focalPoint.y,
          updated_at: new Date(),
        })
        .where("id", "=", focalPoint.mediaAssetId)
        .where("owner_user_id", "=", scope.userId)
        .where("journal_entry_id", "=", entryId)
        .where("derivative_key", "is not", null)
        .where("revoked_at", "is", null)
        .returning("id")
        .executeTakeFirst();
      if (!focalUpdated) throw new Error("atomic_media_focal_mismatch");
    }

    await writeJournalMutationReceipt(trx, {
      ownerUserId: scope.userId,
      journalEntryId: entryId,
      clientMutationId: input.mutationReceiptId,
      baseRevision: expectedRevision,
      resultRevision: nextRevision,
      mutationKind: "edit",
    });
    await recordPublicProjectionIntent(trx, {
      entityId: entryId,
      ownerUserId: scope.userId,
      desiredState: "present",
      reason: "edit",
      privacyReducing: isPublicTextReducingEdit(
        { title: existing.entry.title, body: existing.entry.body },
        { title, body: content.body },
      ),
    });
    await enqueueLearningAttributionIntent(trx, scope);
    if (input.handoff) {
      await buildEnqueueMediaStagingFinalizeJobQuery(trx, {
        publishId: entryId,
        stagingSessionId: input.handoff.stagingSessionId,
        receiptSetDigest: input.handoff.receiptSetDigest,
      }).execute();
    }

    const committed = await readCommittedAtomicJournalEditWithExecutor(
      scope,
      {
        entryId,
        mutationPrefix: input.mutationPrefix,
        mutationReceiptId: input.mutationReceiptId,
        expectedRevision,
        title: input.title,
        entryDate: input.entryDate,
        document: input.document,
        coverMediaAssetId: input.coverMediaAssetId,
        finalMediaAssetIds: input.finalMediaAssetIds,
        focalPoints: input.focalPoints,
        receiptSetDigest: input.handoff?.receiptSetDigest ?? null,
      },
      trx,
    );
    if (!committed) return invalidAtomicReplay();

    const priorCoverSource = inferCoverSourceFromEntryState({
      document: existing.document,
      explicitCoverMediaAssetId: existing.entry.cover_media_asset_id,
    });
    const nextCoverSource = inferCoverSourceFromEntryState({
      document: content.document,
      explicitCoverMediaAssetId: input.coverMediaAssetId,
    });
    return {
      ...committed,
      isReplay: false,
      learning: {
        priorBlockOrderHash: blockOrderHashFromDocument(existing.document),
        nextBlockOrderHash: blockOrderHashFromDocument(content.document),
        priorCoverSource,
        nextCoverSource,
        document: content.document,
      },
    };
  });
}

/**
 * Durable owner-scoped replay boundary for a publication whose staging lease
 * may already be expired or whose provider control plane is unavailable. The
 * persisted client mutation binds the complete normalized request digest;
 * every media row is independently required to be in its final public shape.
 */
export async function readCommittedAtomicJournalCreate(
  scope: RequestScope,
  input: {
    publishId: string;
    clientMutationId: string;
    orderedMediaAssetIds: readonly string[];
    coverMediaAssetId: string | null;
  },
): Promise<CommittedAtomicJournalCreateReadback | null> {
  const entry = await findJournalEntryById(scope, input.publishId);
  if (!entry) return null;
  if (
    entry.client_mutation_id !== input.clientMutationId ||
    entry.visibility !== "public" ||
    entry.lifecycle_state !== "active" ||
    !entry.public_slug ||
    !entry.published_at ||
    entry.public_gone_at !== null ||
    entry.cover_media_asset_id !== input.coverMediaAssetId
  ) {
    throw new Error("idempotency_mismatch");
  }

  const orderedIds = [...input.orderedMediaAssetIds];
  const expectedIds = [...orderedIds];
  if (
    input.coverMediaAssetId &&
    !expectedIds.includes(input.coverMediaAssetId)
  ) {
    expectedIds.push(input.coverMediaAssetId);
  }
  if (new Set(expectedIds).size !== expectedIds.length) {
    throw new Error("idempotency_mismatch");
  }
  const rows = await db
    .selectFrom("media_assets")
    .select([
      "id",
      "derivative_key",
      "upload_generation",
      "revoked_at",
      "usage_role",
      "document_position",
    ])
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "=", entry.id)
    .execute();
  const rowById = new Map(rows.map((row) => [row.id, row]));
  if (
    rows.length !== expectedIds.length ||
    expectedIds.some((id) => !rowById.has(id)) ||
    rows.some((row) => {
      const inlineIndex = orderedIds.indexOf(row.id);
      const expectedRole = inlineIndex >= 0 ? "inline" : "cover_only";
      const expectedPosition = inlineIndex >= 0 ? inlineIndex + 1 : null;
      return (
        row.derivative_key !==
          `derivatives/${row.id}/${Number(row.upload_generation)}.webp` ||
        row.revoked_at !== null ||
        row.usage_role !== expectedRole ||
        row.document_position !== expectedPosition
      );
    })
  ) {
    throw new Error("idempotency_mismatch");
  }

  const finalizeJobs = await db
    .selectFrom("job_queue")
    .select(["idempotency_key", "payload"])
    .where("queue_name", "=", "media_lifecycle")
    .where("idempotency_key", "like", `media_staging_finalize:${entry.id}:%`)
    .execute();
  const finalizeHandoff =
    expectedIds.length === 0
      ? finalizeJobs.length === 0
        ? null
        : invalidAtomicReplay()
      : finalizeJobs.length === 1
        ? parseAtomicFinalizeHandoff(finalizeJobs[0]!, entry.id)
        : invalidAtomicReplay();

  return {
    entry,
    publicMedia: expectedIds.map((mediaAssetId) => ({
      mediaAssetId,
      publicPath: rowById.get(mediaAssetId)!.derivative_key!,
    })),
    finalizeHandoff,
  };
}

function parseAtomicFinalizeHandoff(
  job: { idempotency_key: string | null; payload: unknown },
  publishId: string,
) {
  const payload = job.payload;
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).sort().join("\0") !==
      ["kind", "publishId", "receiptSetDigest", "stagingSessionId"]
        .sort()
        .join("\0")
  ) {
    return invalidAtomicReplay();
  }
  const value = payload as Record<string, unknown>;
  if (
    value.kind !== "media_staging_finalize" ||
    value.publishId !== publishId ||
    typeof value.stagingSessionId !== "string" ||
    !UUID_PATTERN.test(value.stagingSessionId) ||
    typeof value.receiptSetDigest !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.receiptSetDigest) ||
    job.idempotency_key !==
      `media_staging_finalize:${publishId}:${value.receiptSetDigest}`
  ) {
    return invalidAtomicReplay();
  }
  return {
    stagingSessionId: value.stagingSessionId,
    receiptSetDigest: value.receiptSetDigest,
  };
}

function invalidAtomicReplay(): never {
  throw new Error("idempotency_mismatch");
}

function atomicEditUnavailable(): never {
  throw new Error("atomic_edit_unavailable");
}

function journalEntryDateMatches(value: Date | string, expected: string) {
  return (
    journalEntryDateInputValue(value) === expected ||
    (value instanceof Date && value.toISOString().slice(0, 10) === expected)
  );
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  if (
    new Set(left).size !== left.length ||
    new Set(right).size !== right.length ||
    left.length !== right.length
  ) {
    return false;
  }
  const expected = new Set(right);
  return left.every((item) => expected.has(item));
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function focalPointsMatch(
  media: readonly AtomicJournalEditMediaBaseline[],
  focalPoints: readonly AtomicJournalEditFocalPoint[],
) {
  if (media.length !== focalPoints.length) return false;
  const focalById = new Map(
    focalPoints.map((item) => [item.mediaAssetId, item]),
  );
  if (focalById.size !== focalPoints.length) return false;
  return media.every((item) => {
    const focal = focalById.get(item.mediaAssetId);
    return (
      focal !== undefined && item.focalX === focal.x && item.focalY === focal.y
    );
  });
}

export async function createFirstPlantEntry(
  scope: RequestScope,
  input: CreateFirstPlantEntryInput,
): Promise<FirstPlantEntryResult> {
  const normalized = normalizeCreateFirstPlantEntryInput(input);
  const existing = await findExistingJournalEntryForCreate(scope, normalized);

  if (existing) {
    return readExistingFirstPlantEntryResult(
      db,
      scope,
      existing,
      normalized.orderedMediaAssetIds.length > 0,
    );
  }

  return db.transaction().execute(async (trx) => {
    await prepareAtomicCreateTransaction(trx, scope);
    await buildJournalMutationAdvisoryLockQuery(
      scope,
      atomicCreateLockKey(normalized),
    ).execute(trx);
    const existingAfterLock = await findExistingJournalEntryForCreate(
      scope,
      normalized,
      trx,
    );
    if (existingAfterLock) {
      return readExistingFirstPlantEntryResult(
        trx,
        scope,
        existingAfterLock,
        normalized.orderedMediaAssetIds.length > 0,
      );
    }

    const space = normalized.spaceId
      ? await buildOwnedSpaceForFirstEntryQuery(
          trx,
          scope,
          normalized.spaceId,
        ).executeTakeFirst()
      : await trx
          .insertInto("spaces")
          .values({
            ...(normalized.internalDeterministicIds
              ? { id: normalized.internalDeterministicIds.spaceId }
              : {}),
            owner_user_id: scope.userId,
            display_name: normalized.spaceName,
            location_visibility: normalized.locationVisibility,
            coarse_region_code: normalized.coarseRegionCode,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

    if (!space) {
      throw new Error("Selected space was not found.");
    }

    const selectedCatalogItem = normalized.catalogItemId
      ? await findSelectableCatalogItem(trx, normalized.catalogItemId)
      : null;

    if (normalized.catalogItemId && !selectedCatalogItem) {
      throw new Error("Selected catalog item was not found.");
    }

    const userAddedCatalogItem =
      !selectedCatalogItem && normalized.userAddedCatalogName
        ? await createUserAddedCatalogCandidate(trx, scope, {
            displayName: normalized.userAddedCatalogName,
            objectKind: normalized.objectKind,
          })
        : null;

    const plantObject = await trx
      .insertInto("plant_objects")
      .values({
        ...(normalized.internalDeterministicIds
          ? { id: normalized.internalDeterministicIds.plantObjectId }
          : {}),
        owner_user_id: scope.userId,
        space_id: space.id,
        display_name: normalized.plantName,
        object_kind: resolvePlantObjectKind(
          normalized.objectKind,
          selectedCatalogItem?.catalogKind,
          selectedCatalogItem?.source,
        ),
        catalog_item_id:
          selectedCatalogItem?.id ?? userAddedCatalogItem?.id ?? null,
        variety_text:
          selectedCatalogItem?.canonicalName ??
          userAddedCatalogItem?.displayName ??
          null,
        variety_state: selectedCatalogItem
          ? "selected"
          : userAddedCatalogItem
            ? "user_added"
            : "unknown",
        location_visibility: space.location_visibility,
        coarse_region_code: space.coarse_region_code,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const entry = await insertJournalEntry(trx, {
      ...(normalized.internalDeterministicIds
        ? { id: normalized.internalDeterministicIds.entryId }
        : {}),
      ...(await atomicJournalEntryValues(trx, scope, normalized)),
      owner_user_id: scope.userId,
      space_id: space.id,
      plant_object_id: plantObject.id,
      title: normalized.title,
      body: normalized.body,
      content_document: journalDocumentAsJson(normalized.contentDocument),
      content_schema_version: normalized.contentSchemaVersion,
      journal_revision: 1,
      entry_scope: "object",
      entry_date: normalized.entryDate,
      client_mutation_id: normalized.clientMutationId,
    });

    if (entry) {
      await insertAtomicPublicationMedia(trx, scope, entry.id, normalized);
      const mediaAttached = await claimOrderedInlineMediaForEntry(trx, scope, {
        journalEntryId: entry.id,
        orderedMediaAssetIds: normalized.orderedMediaAssetIds,
      });
      await claimJournalEntryCover(trx, scope, {
        journalEntryId: entry.id,
        cover: normalized.cover,
        orderedInlineMediaAssetIds: normalized.orderedMediaAssetIds,
      });
      await writeJournalMutationReceipt(trx, {
        ownerUserId: scope.userId,
        journalEntryId: entry.id,
        clientMutationId: normalized.clientMutationId,
        baseRevision: 0,
        resultRevision: 1,
        mutationKind: "create",
      });
      await persistJournalEntryMentions(trx, scope, {
        journalEntryId: entry.id,
        ownerUserId: scope.userId,
        spaceId: space.id,
        subjectPlantObjectId: plantObject.id,
        clientMutationId: normalized.clientMutationId,
        mentionSelections: normalized.mentionSelections,
      });
      await persistJournalEntryTopicSignals(trx, scope, {
        journalEntryId: entry.id,
        explicitTagLabels: normalized.topicTags,
      });
      await enqueueLearningAttributionIntent(trx, scope);
      await recordAtomicPublicationEffects(trx, scope, entry.id, normalized);

      return {
        space: {
          id: space.id,
          display_name: space.display_name,
          location_visibility: space.location_visibility,
          coarse_region_code: space.coarse_region_code,
        },
        plantObject: {
          id: plantObject.id,
          display_name: plantObject.display_name,
          object_kind: plantObject.object_kind as PlantObjectKind,
          catalog_item_id: plantObject.catalog_item_id,
          catalog_kind: selectedCatalogItem?.catalogKind ?? null,
          catalog_canonical_name: selectedCatalogItem?.canonicalName ?? null,
          catalog_public_slug: selectedCatalogItem?.publicSlug ?? null,
          variety_text: plantObject.variety_text,
          variety_state: plantObject.variety_state as VarietyState,
          location_visibility: plantObject.location_visibility,
          coarse_region_code: plantObject.coarse_region_code,
          source_credit: null,
        },
        entry,
        isNewEntry: true,
        mediaAttached,
        priorObjectEntryCount: 0,
      };
    }

    const existingAfterConflict = await findExistingJournalEntryForCreate(
      scope,
      normalized,
      trx,
    );

    if (!existingAfterConflict) {
      throw new Error(
        "Journal entry idempotency conflict could not be resolved.",
      );
    }

    if (
      existingAfterConflict.entry_scope !== "object" ||
      !existingAfterConflict.plant_object_id
    ) {
      throw new Error(
        "Client mutation id already belongs to another journal entry.",
      );
    }

    await assertAtomicPublicationReplayComplete(
      trx,
      scope,
      existingAfterConflict,
      normalized,
    );
    const mediaAttached = normalized.orderedMediaAssetIds.length > 0;

    const page = await getPlantObjectPage(
      scope,
      existingAfterConflict.plant_object_id,
      trx,
    );

    if (!page) {
      throw new Error("Existing journal entry is outside the request scope.");
    }

    return {
      space: page.space,
      plantObject: page.plantObject,
      entry: existingAfterConflict,
      isNewEntry: false,
      mediaAttached,
      priorObjectEntryCount: Math.max(page.entries.length - 1, 0),
    };
  });
}

async function readExistingFirstPlantEntryResult(
  executor: QueryExecutor,
  scope: RequestScope,
  existing: JournalEntry,
  mediaAttached: boolean,
): Promise<FirstPlantEntryResult> {
  if (existing.entry_scope !== "object" || !existing.plant_object_id) {
    throw new Error(
      "Client mutation id already belongs to another journal entry.",
    );
  }

  const page = await getPlantObjectPage(
    scope,
    existing.plant_object_id,
    executor,
  );
  if (!page) {
    throw new Error("Existing journal entry is outside the request scope.");
  }

  return {
    space: page.space,
    plantObject: page.plantObject,
    entry: existing,
    isNewEntry: false,
    mediaAttached,
    priorObjectEntryCount: Math.max(page.entries.length - 1, 0),
  };
}

export async function listMyPlantObjects(
  scope: RequestScope,
  limit = 10,
  offset = 0,
): Promise<PlantObjectSummary[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_RECENT_ITEMS);
  const boundedOffset = Math.max(0, Math.trunc(offset));

  const rows = await buildMyPlantObjectsQuery(
    db,
    scope,
    boundedLimit,
    boundedOffset,
  ).execute();
  if (rows.length === 0) return [];

  const objectIds = rows.map((row) => row.id);
  const [entrySummaries, coverRows] = await Promise.all([
    buildMyPlantObjectEntrySummariesQuery(db, scope, objectIds).execute(),
    buildMyPlantObjectCoverMediaQuery(db, scope, objectIds).execute(),
  ]);
  const entrySummaryByObjectId = new Map(
    entrySummaries.map((summary) => [summary.plantObjectId, summary]),
  );
  const coverByObjectId = new Map(
    coverRows.map((cover) => [cover.plantObjectId, cover]),
  );

  return rows.map((row) => {
    const entrySummary = entrySummaryByObjectId.get(row.id);
    const cover = coverByObjectId.get(row.id);

    return {
      ...row,
      objectKind: row.objectKind as PlantObjectKind,
      catalogKind: row.catalogKind as CatalogKind | null,
      varietyState: row.varietyState as VarietyState,
      entryCount: normalizeCount(entrySummary?.entryCount),
      publicEntryCount: normalizeCount(entrySummary?.publicEntryCount),
      archivedEntryCount: normalizeCount(entrySummary?.archivedEntryCount),
      latestEntryDate: entrySummary?.latestEntryDate ?? null,
      coverMedia: cover
        ? {
            publicUrl: getPublicDerivativeUrl(cover.derivativeKey),
            altText: cover.altText ?? `${row.displayName} journal photo`,
            focalX: Number(cover.focalX ?? 0.5),
            focalY: Number(cover.focalY ?? 0.5),
            intrinsicWidth: cover.intrinsicWidth ?? null,
            intrinsicHeight: cover.intrinsicHeight ?? null,
          }
        : null,
    };
  });
}

export function buildMyPlantObjectsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit: number,
  offset = 0,
) {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_RECENT_ITEMS);
  const boundedOffset = Math.max(0, Math.trunc(offset));

  return executor
    .selectFrom("plant_objects")
    .innerJoin("spaces", "spaces.id", "plant_objects.space_id")
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "plant_objects.id as id",
      "plant_objects.display_name as displayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.catalog_item_id as catalogItemId",
      "catalog_items.catalog_kind as catalogKind",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.created_at as createdAt",
      "spaces.display_name as spaceDisplayName",
    ])
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("spaces.owner_user_id", "=", scope.userId)
    .orderBy("plant_objects.created_at", "desc")
    .limit(boundedLimit)
    .offset(boundedOffset);
}

export function buildMyPlantObjectEntrySummariesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectIds: readonly string[],
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
        ),
    )
    .select(({ fn }) => [
      "journal_entries.plant_object_id as plantObjectId",
      fn.count<number>("journal_entries.id").as("entryCount"),
      sql<number>`count(*) filter (
        where ${sql.ref("journal_entries.visibility")} = 'public'
          and ${sql.ref("journal_entries.lifecycle_state")} = 'active'
      )::int`.as("publicEntryCount"),
      sql<number>`count(*) filter (
        where ${sql.ref("journal_entries.lifecycle_state")} = 'archived'
      )::int`.as("archivedEntryCount"),
      fn.max<Date | string>("journal_entries.entry_date").as("latestEntryDate"),
    ])
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.plant_object_id", "in", [...plantObjectIds])
    .groupBy("journal_entries.plant_object_id")
    .$narrowType<{ plantObjectId: string }>();
}

export function buildMyPlantObjectCoverMediaQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectIds: readonly string[],
) {
  return executor
    .selectFrom("media_assets")
    .innerJoin("journal_entries", (join) =>
      join
        .onRef("journal_entries.id", "=", "media_assets.journal_entry_id")
        .onRef(
          "media_assets.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
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
    .select([
      "journal_entries.plant_object_id as plantObjectId",
      "media_assets.derivative_key as derivativeKey",
      "media_assets.alt_text as altText",
      "media_assets.focal_x as focalX",
      "media_assets.focal_y as focalY",
      "media_assets.intrinsic_width as intrinsicWidth",
      "media_assets.intrinsic_height as intrinsicHeight",
    ])
    .distinctOn("journal_entries.plant_object_id")
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("journal_entries.plant_object_id", "in", [...plantObjectIds])
    .where("journal_entries.lifecycle_state", "=", "active")
    .where(publicMediaEligibilityPredicate())
    .where((eb) =>
      eb.or([
        eb(
          "media_assets.id",
          "=",
          eb.ref("journal_entries.cover_media_asset_id"),
        ),
        eb("media_assets.usage_role", "=", "inline"),
      ]),
    )
    .orderBy("journal_entries.plant_object_id", "asc")
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy(
      sql`case
        when ${sql.ref("media_assets.id")} = ${sql.ref("journal_entries.cover_media_asset_id")}
          then 0
        else 1
      end`,
      "asc",
    )
    .orderBy("media_assets.document_position", "asc")
    .orderBy("media_assets.id", "asc")
    .$narrowType<{ plantObjectId: string; derivativeKey: string }>();
}

export async function listMySpaceJournalTimelines(
  scope: RequestScope,
): Promise<SpaceJournalTimeline[]> {
  const spaces = await db
    .selectFrom("spaces")
    .select([
      "id",
      "display_name",
      "location_visibility",
      "coarse_region_code",
      "created_at",
    ])
    .where("owner_user_id", "=", scope.userId)
    .orderBy("created_at", "desc")
    .execute();

  if (spaces.length === 0) return [];

  const spaceIds = spaces.map((space) => space.id);
  const [objects, entries] = await Promise.all([
    buildSpaceTimelineObjectsQuery(db, scope, spaceIds).execute(),
    buildSpaceTimelineEntriesQuery(db, scope, spaceIds).execute(),
  ]);
  const mediaByEntryId = await getProcessedMediaByEntryId(
    db,
    scope,
    entries.map((entry) => entry.id),
  );
  const mentionsByEntryId = await getMentionedObjectsByEntryId(
    db,
    scope,
    entries.map((entry) => entry.id),
  );
  const objectsBySpaceId = new Map<string, SpaceTimelineObjectSummary[]>();
  const entriesBySpaceId = new Map<string, JournalEntryReadback[]>();

  for (const object of objects) {
    const list = objectsBySpaceId.get(object.spaceId) ?? [];
    list.push({
      id: object.id,
      displayName: object.displayName,
      objectKind: object.objectKind as PlantObjectKind,
      catalogKind: object.catalogKind as CatalogKind | null,
      varietyText: object.varietyText,
      varietyState: object.varietyState as VarietyState,
    });
    objectsBySpaceId.set(object.spaceId, list);
  }

  for (const entry of entries) {
    const list = entriesBySpaceId.get(entry.space_id) ?? [];
    list.push({
      ...entry,
      media: mediaByEntryId.get(entry.id) ?? null,
      mentionedObjects: mentionsByEntryId.get(entry.id) ?? [],
      timelineRelation: "space_timeline",
    });
    entriesBySpaceId.set(entry.space_id, list);
  }

  return spaces.map((space) => ({
    space: {
      id: space.id,
      display_name: space.display_name,
      location_visibility: space.location_visibility,
      coarse_region_code: space.coarse_region_code,
    },
    objects: objectsBySpaceId.get(space.id) ?? [],
    entries: entriesBySpaceId.get(space.id) ?? [],
  }));
}

export async function getMySpaceJournalTimeline(
  scope: RequestScope,
  spaceId: string,
  options: { objectLimit?: number; entryLimit?: number } = {},
): Promise<SpaceJournalTimeline | null> {
  const space = await buildSpaceByIdQuery(
    db,
    scope,
    spaceId,
  ).executeTakeFirst();
  if (!space) return null;

  const objectLimit = Math.min(
    Math.max(Math.trunc(options.objectLimit ?? 20), 1),
    MAX_RECENT_ITEMS,
  );
  const entryLimit = Math.min(
    Math.max(Math.trunc(options.entryLimit ?? 5), 1),
    MAX_RECENT_ITEMS,
  );
  const [objects, entries] = await Promise.all([
    buildSpaceTimelineObjectsQuery(db, scope, [space.id])
      .limit(objectLimit)
      .execute(),
    buildSpaceTimelineEntriesQuery(db, scope, [space.id])
      .limit(entryLimit)
      .execute(),
  ]);
  const mediaByEntryId = await getProcessedMediaByEntryId(
    db,
    scope,
    entries.map((entry) => entry.id),
  );
  const mentionsByEntryId = await getMentionedObjectsByEntryId(
    db,
    scope,
    entries.map((entry) => entry.id),
  );

  return {
    space,
    objects: objects.map((object) => ({
      id: object.id,
      displayName: object.displayName,
      objectKind: object.objectKind as PlantObjectKind,
      catalogKind: object.catalogKind as CatalogKind | null,
      varietyText: object.varietyText,
      varietyState: object.varietyState as VarietyState,
    })),
    entries: entries.map((entry) => ({
      ...entry,
      media: mediaByEntryId.get(entry.id) ?? null,
      mentionedObjects: mentionsByEntryId.get(entry.id) ?? [],
      timelineRelation: "space_timeline",
    })),
  };
}

export async function getPlantObjectPage(
  scope: RequestScope,
  objectId: string,
  executor: QueryExecutor = db,
): Promise<PlantObjectPage | null> {
  const objectRow = await buildPlantObjectPageObjectQuery(
    executor,
    scope,
    objectId,
  ).executeTakeFirst();

  if (!objectRow) return null;

  const entryRows = await buildObjectTimelineEntriesQuery(
    executor,
    scope,
    objectId,
  ).execute();
  const entryIds = entryRows.map((entry) => entry.id);
  const [
    mediaByEntryId,
    mentionsByEntryId,
    galleryMedia,
    sourceCredit,
    priorPublicationDisclosure,
  ] = await Promise.all([
    getProcessedMediaByEntryId(executor, scope, entryIds),
    getMentionedObjectsByEntryId(executor, scope, entryIds),
    readProcessedObjectMediaGallery(executor, scope, entryIds),
    objectRow.catalogItemId
      ? readPlantObjectCatalogSourceCredit(executor, objectRow.catalogItemId)
      : Promise.resolve(null),
    buildPriorPublicationDisclosureQuery(executor, scope).executeTakeFirst(),
  ]);

  return {
    space: {
      id: objectRow.spaceId,
      display_name: objectRow.spaceDisplayName,
      location_visibility: objectRow.spaceLocationVisibility,
      coarse_region_code: objectRow.spaceCoarseRegionCode,
    },
    plantObject: {
      id: objectRow.objectId,
      display_name: objectRow.objectDisplayName,
      object_kind: objectRow.objectKind as PlantObjectKind,
      catalog_item_id: objectRow.catalogItemId,
      catalog_kind: objectRow.catalogKind as CatalogKind | null,
      catalog_canonical_name: objectRow.catalogCanonicalName,
      catalog_public_slug: objectRow.catalogPublicSlug,
      variety_text: objectRow.varietyText,
      variety_state: objectRow.varietyState as VarietyState,
      location_visibility: objectRow.objectLocationVisibility,
      coarse_region_code: objectRow.objectCoarseRegionCode,
      source_credit: sourceCredit,
    },
    hasPriorPublicationDisclosure: Boolean(priorPublicationDisclosure),
    entries: entryRows.map(({ timelineRelation, ...entry }) => ({
      ...entry,
      media: mediaByEntryId.get(entry.id) ?? null,
      mentionedObjects: mentionsByEntryId.get(entry.id) ?? [],
      timelineRelation,
    })),
    gallery_media: galleryMedia,
  };
}

async function readPlantObjectCatalogSourceCredit(
  executor: QueryExecutor,
  catalogItemId: string,
): Promise<PlantObjectCatalogSourceCredit | null> {
  const row = await buildPlantObjectCatalogSourceCreditQuery(
    executor,
    catalogItemId,
  ).executeTakeFirst();

  if (!row) return null;

  return {
    sourceSlug: row.sourceSlug,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    attributionText: row.attributionText,
  };
}

export async function createPlantObjectJournalEntry(
  scope: RequestScope,
  input: CreatePlantObjectJournalEntryInput,
): Promise<PlantObjectJournalEntryResult> {
  const normalized = normalizeCreatePlantObjectJournalEntryInput(input);
  const existing = await findExistingJournalEntryForCreate(scope, normalized);

  if (existing) {
    if (
      existing.entry_scope !== "object" ||
      existing.plant_object_id !== normalized.plantObjectId
    ) {
      throw new Error(
        "Client mutation id already belongs to another plant object.",
      );
    }

    const mediaAttached = normalized.orderedMediaAssetIds.length > 0;
    const page = await getPlantObjectPage(scope, existing.plant_object_id);
    if (!page)
      throw new Error("Existing journal entry is outside the request scope.");

    return {
      space: page.space,
      plantObject: page.plantObject,
      entry: existing,
      isNewEntry: false,
      mediaAttached,
      priorObjectEntryCount: Math.max(page.entries.length - 1, 0),
    };
  }

  return db.transaction().execute(async (trx) => {
    await prepareAtomicCreateTransaction(trx, scope);
    await buildJournalMutationAdvisoryLockQuery(
      scope,
      atomicCreateLockKey(normalized),
    ).execute(trx);
    const existingAfterLock = await findExistingJournalEntryForCreate(
      scope,
      normalized,
      trx,
    );
    if (existingAfterLock) {
      if (
        existingAfterLock.entry_scope !== "object" ||
        existingAfterLock.plant_object_id !== normalized.plantObjectId
      ) {
        throw new Error(
          "Client mutation id already belongs to another plant object.",
        );
      }

      const mediaAttached = normalized.orderedMediaAssetIds.length > 0;
      const page = await getPlantObjectPage(
        scope,
        existingAfterLock.plant_object_id,
        trx,
      );
      if (!page) {
        throw new Error("Existing journal entry is outside the request scope.");
      }

      return {
        space: page.space,
        plantObject: page.plantObject,
        entry: existingAfterLock,
        isNewEntry: false,
        mediaAttached,
        priorObjectEntryCount: Math.max(page.entries.length - 1, 0),
      };
    }

    const target = await buildPlantObjectPageObjectQuery(
      trx,
      scope,
      normalized.plantObjectId,
    ).executeTakeFirst();

    if (!target) {
      throw new Error("Plant object was not found in this garden.");
    }

    const priorObjectEntryCount = await countJournalEntriesForObject(
      trx,
      scope,
      normalized.plantObjectId,
    );
    const entry = await insertJournalEntry(trx, {
      ...(normalized.internalDeterministicIds
        ? { id: normalized.internalDeterministicIds.entryId }
        : {}),
      ...(await atomicJournalEntryValues(trx, scope, normalized)),
      owner_user_id: scope.userId,
      space_id: target.spaceId,
      plant_object_id: target.objectId,
      title: normalized.title,
      body: normalized.body,
      content_document: journalDocumentAsJson(normalized.contentDocument),
      content_schema_version: normalized.contentSchemaVersion,
      journal_revision: 1,
      entry_scope: "object",
      entry_date: normalized.entryDate,
      client_mutation_id: normalized.clientMutationId,
    });

    if (entry) {
      await insertAtomicPublicationMedia(trx, scope, entry.id, normalized);
      const mediaAttached = await claimOrderedInlineMediaForEntry(trx, scope, {
        journalEntryId: entry.id,
        orderedMediaAssetIds: normalized.orderedMediaAssetIds,
      });
      await claimJournalEntryCover(trx, scope, {
        journalEntryId: entry.id,
        cover: normalized.cover,
        orderedInlineMediaAssetIds: normalized.orderedMediaAssetIds,
      });
      await writeJournalMutationReceipt(trx, {
        ownerUserId: scope.userId,
        journalEntryId: entry.id,
        clientMutationId: normalized.clientMutationId,
        baseRevision: 0,
        resultRevision: 1,
        mutationKind: "create",
      });
      await persistJournalEntryMentions(trx, scope, {
        journalEntryId: entry.id,
        ownerUserId: scope.userId,
        spaceId: target.spaceId,
        subjectPlantObjectId: target.objectId,
        clientMutationId: normalized.clientMutationId,
        mentionSelections: normalized.mentionSelections,
      });
      await persistJournalEntryTopicSignals(trx, scope, {
        journalEntryId: entry.id,
        explicitTagLabels: normalized.topicTags,
      });
      await enqueueLearningAttributionIntent(trx, scope);
      await recordAtomicPublicationEffects(trx, scope, entry.id, normalized);

      return {
        space: {
          id: target.spaceId,
          display_name: target.spaceDisplayName,
          location_visibility: target.spaceLocationVisibility,
          coarse_region_code: target.spaceCoarseRegionCode,
        },
        plantObject: {
          id: target.objectId,
          display_name: target.objectDisplayName,
          object_kind: target.objectKind as PlantObjectKind,
          catalog_item_id: target.catalogItemId,
          catalog_kind: target.catalogKind as CatalogKind | null,
          catalog_canonical_name: target.catalogCanonicalName,
          catalog_public_slug: target.catalogPublicSlug,
          variety_text: target.varietyText,
          variety_state: target.varietyState as VarietyState,
          location_visibility: target.objectLocationVisibility,
          coarse_region_code: target.objectCoarseRegionCode,
          source_credit: null,
        },
        entry,
        isNewEntry: true,
        mediaAttached,
        priorObjectEntryCount,
      };
    }

    const existingAfterConflict = await findExistingJournalEntryForCreate(
      scope,
      normalized,
      trx,
    );

    if (!existingAfterConflict) {
      throw new Error(
        "Journal entry idempotency conflict could not be resolved.",
      );
    }

    if (
      existingAfterConflict.entry_scope !== "object" ||
      existingAfterConflict.plant_object_id !== normalized.plantObjectId
    ) {
      throw new Error(
        "Client mutation id already belongs to another plant object.",
      );
    }

    const mediaAttached = normalized.orderedMediaAssetIds.length > 0;

    return {
      space: {
        id: target.spaceId,
        display_name: target.spaceDisplayName,
        location_visibility: target.spaceLocationVisibility,
        coarse_region_code: target.spaceCoarseRegionCode,
      },
      plantObject: {
        id: target.objectId,
        display_name: target.objectDisplayName,
        object_kind: target.objectKind as PlantObjectKind,
        catalog_item_id: target.catalogItemId,
        catalog_kind: target.catalogKind as CatalogKind | null,
        catalog_canonical_name: target.catalogCanonicalName,
        catalog_public_slug: target.catalogPublicSlug,
        variety_text: target.varietyText,
        variety_state: target.varietyState as VarietyState,
        location_visibility: target.objectLocationVisibility,
        coarse_region_code: target.objectCoarseRegionCode,
        source_credit: null,
      },
      entry: existingAfterConflict,
      isNewEntry: false,
      mediaAttached,
      priorObjectEntryCount,
    };
  });
}

export async function createSpaceJournalEntry(
  scope: RequestScope,
  input: CreateSpaceJournalEntryInput,
): Promise<SpaceJournalEntryResult> {
  const normalized = normalizeCreateSpaceJournalEntryInput(input);
  const existing = await findExistingJournalEntryForCreate(scope, normalized);

  if (existing) {
    if (
      existing.entry_scope !== "space" ||
      existing.space_id !== normalized.spaceId
    ) {
      throw new Error(
        "Client mutation id already belongs to another journal entry.",
      );
    }

    const mentionedObjects = await readMentionedObjectsForEntry(
      db,
      scope,
      existing.id,
    );
    const mediaAttached = normalized.orderedMediaAssetIds.length > 0;
    return {
      space: await requireSpaceInScope(db, scope, existing.space_id),
      entry: existing,
      mentionedObjects,
      isNewEntry: false,
      mediaAttached,
    };
  }

  return db.transaction().execute(async (trx) => {
    await prepareAtomicCreateTransaction(trx, scope);
    await buildJournalMutationAdvisoryLockQuery(
      scope,
      atomicCreateLockKey(normalized),
    ).execute(trx);
    const existingAfterLock = await findExistingJournalEntryForCreate(
      scope,
      normalized,
      trx,
    );
    if (existingAfterLock) {
      if (
        existingAfterLock.entry_scope !== "space" ||
        existingAfterLock.space_id !== normalized.spaceId
      ) {
        throw new Error(
          "Client mutation id already belongs to another journal entry.",
        );
      }

      const existingMentions = await readMentionedObjectsForEntry(
        trx,
        scope,
        existingAfterLock.id,
      );
      const mediaAttached = normalized.orderedMediaAssetIds.length > 0;
      return {
        space: await requireSpaceInScope(
          trx,
          scope,
          existingAfterLock.space_id,
        ),
        entry: existingAfterLock,
        mentionedObjects: existingMentions,
        isNewEntry: false,
        mediaAttached,
      };
    }

    const space = await requireSpaceInScope(trx, scope, normalized.spaceId);
    const mentionedObjects = await readMentionableObjectsInSpace(trx, scope, {
      spaceId: normalized.spaceId,
      plantObjectIds: normalized.mentionedPlantObjectIds,
    });

    if (mentionedObjects.length !== normalized.mentionedPlantObjectIds.length) {
      throw new Error("Mentioned objects must belong to this space.");
    }

    const entry = await insertJournalEntry(trx, {
      ...(normalized.internalDeterministicIds
        ? { id: normalized.internalDeterministicIds.entryId }
        : {}),
      ...(await atomicJournalEntryValues(trx, scope, normalized)),
      owner_user_id: scope.userId,
      space_id: space.id,
      plant_object_id: null,
      title: normalized.title,
      body: normalized.body,
      content_document: journalDocumentAsJson(normalized.contentDocument),
      content_schema_version: normalized.contentSchemaVersion,
      journal_revision: 1,
      entry_scope: "space",
      entry_date: normalized.entryDate,
      client_mutation_id: normalized.clientMutationId,
    });

    if (entry) {
      await insertAtomicPublicationMedia(trx, scope, entry.id, normalized);
      const mediaAttached = await claimOrderedInlineMediaForEntry(trx, scope, {
        journalEntryId: entry.id,
        orderedMediaAssetIds: normalized.orderedMediaAssetIds,
      });
      await claimJournalEntryCover(trx, scope, {
        journalEntryId: entry.id,
        cover: normalized.cover,
        orderedInlineMediaAssetIds: normalized.orderedMediaAssetIds,
      });
      await writeJournalMutationReceipt(trx, {
        ownerUserId: scope.userId,
        journalEntryId: entry.id,
        clientMutationId: normalized.clientMutationId,
        baseRevision: 0,
        resultRevision: 1,
        mutationKind: "create",
      });
      await insertJournalEntryObjectMentions(trx, {
        ownerUserId: scope.userId,
        spaceId: space.id,
        journalEntryId: entry.id,
        plantObjectIds: normalized.mentionedPlantObjectIds,
      });
      await persistJournalEntryTopicSignals(trx, scope, {
        journalEntryId: entry.id,
        explicitTagLabels: normalized.topicTags,
      });
      await enqueueLearningAttributionIntent(trx, scope);
      await recordAtomicPublicationEffects(trx, scope, entry.id, normalized);

      return {
        space,
        entry,
        mentionedObjects,
        isNewEntry: true,
        mediaAttached,
      };
    }

    const existingAfterConflict = await findExistingJournalEntryForCreate(
      scope,
      normalized,
      trx,
    );

    if (
      !existingAfterConflict ||
      existingAfterConflict.entry_scope !== "space" ||
      existingAfterConflict.space_id !== normalized.spaceId
    ) {
      throw new Error(
        "Journal entry idempotency conflict could not be resolved.",
      );
    }

    const existingMentions = await readMentionedObjectsForEntry(
      trx,
      scope,
      existingAfterConflict.id,
    );
    const mediaAttached = normalized.orderedMediaAssetIds.length > 0;

    return {
      space,
      entry: existingAfterConflict,
      mentionedObjects: existingMentions,
      isNewEntry: false,
      mediaAttached,
    };
  });
}

export async function resolvePlantObjectCatalog(
  scope: RequestScope,
  input: ResolvePlantObjectCatalogInput,
  options: ResolvePlantObjectCatalogOptions = {},
): Promise<PlantObjectCatalogResolutionResult> {
  const normalized = normalizeResolvePlantObjectCatalogInput(input);

  return db.transaction().execute(async (trx) => {
    const target = await buildPlantObjectPageObjectQuery(
      trx,
      scope,
      normalized.plantObjectId,
    ).executeTakeFirst();

    if (!target) {
      throw new Error("Plant object was not found in this garden.");
    }

    if (!isResolvableVarietyState(target.varietyState)) {
      throw new Error("Only unknown or user-added objects can be resolved.");
    }

    const selectedCatalogItem = await findSelectableCatalogItem(
      trx,
      normalized.catalogItemId,
    );

    if (!selectedCatalogItem) {
      throw new Error("Selected catalog item was not found.");
    }

    const resolved = await buildResolvePlantObjectCatalogQuery(trx, scope, {
      plantObjectId: target.objectId,
      catalogItemId: selectedCatalogItem.id,
      objectKind: resolvePlantObjectKind(
        target.objectKind,
        selectedCatalogItem.catalogKind,
        selectedCatalogItem.source,
      ),
      varietyText: selectedCatalogItem.canonicalName,
      now: new Date(),
    }).executeTakeFirstOrThrow();
    await options.afterResolve?.({
      transaction: trx,
      plantObjectId: resolved.id,
      catalogItemId: selectedCatalogItem.id,
    });
    await refreshJournalEntryTopicSignalsForPlantObject(trx, scope, {
      plantObjectId: resolved.id,
    });
    // OVE-242: resolving a catalog identity reclassifies the object's public
    // entries, so their projections are re-emitted from the same transaction
    // rather than left to a post-commit revalidate.
    await recordPublicProjectionIntentsForPlantObject(trx, {
      plantObjectId: resolved.id,
      ownerUserId: scope.userId,
      reason: "catalog_identity",
    });

    const entryCount = await countJournalEntriesForObject(
      trx,
      scope,
      resolved.id,
    );
    const publicSlugs = await buildPublicEntrySlugsForObjectQuery(
      trx,
      scope,
      resolved.id,
    ).execute();

    return {
      space: {
        id: target.spaceId,
        display_name: target.spaceDisplayName,
        location_visibility: target.spaceLocationVisibility,
        coarse_region_code: target.spaceCoarseRegionCode,
      },
      plantObject: {
        id: resolved.id,
        display_name: resolved.display_name,
        object_kind: resolved.object_kind as PlantObjectKind,
        catalog_item_id: resolved.catalog_item_id,
        catalog_kind: selectedCatalogItem.catalogKind,
        catalog_canonical_name: selectedCatalogItem.canonicalName,
        catalog_public_slug: selectedCatalogItem.publicSlug,
        variety_text: resolved.variety_text,
        variety_state: resolved.variety_state as VarietyState,
        location_visibility: resolved.location_visibility,
        coarse_region_code: resolved.coarse_region_code,
        source_credit: null,
      },
      entryCount,
      publicEntryPaths: publicSlugs.flatMap((row) =>
        row.publicSlug ? [publicJournalEntryPath(row.publicSlug)] : [],
      ),
    };
  });
}

export async function updatePlantObjectLocation(
  scope: RequestScope,
  input: UpdatePlantObjectLocationInput,
): Promise<PlantObjectLocationUpdateResult> {
  const normalized = normalizeUpdatePlantObjectLocationInput(input);
  // OVE-242: hiding a location, or moving to another coarse region, rewrites
  // the public region of every public entry on this object. The canonical
  // update and those projection intents commit together, so the old region can
  // never survive in the index behind a successful UI response.
  const updated = await db.transaction().execute(async (trx) => {
    const row = await buildUpdatePlantObjectLocationQuery(
      trx,
      scope,
      normalized,
    ).executeTakeFirst();

    if (!row) return null;

    await recordPublicProjectionIntentsForPlantObject(trx, {
      plantObjectId: row.id,
      ownerUserId: scope.userId,
      reason: "location_change",
    });

    return row;
  });

  if (!updated) {
    throw new Error("Plant object was not found in this garden.");
  }

  const page = await getPlantObjectPage(scope, updated.id);
  if (!page) {
    throw new Error("Plant object was not found in this garden.");
  }

  const publicSlugs = await buildPublicEntrySlugsForObjectQuery(
    db,
    scope,
    updated.id,
  ).execute();

  return {
    space: page.space,
    plantObject: page.plantObject,
    publicEntryPaths: publicSlugs.flatMap((row) =>
      row.publicSlug ? [publicJournalEntryPath(row.publicSlug)] : [],
    ),
  };
}

export async function listMyRecentJournalEntries(
  scope: RequestScope,
  limit = 10,
): Promise<JournalEntry[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_RECENT_ITEMS);

  return db
    .selectFrom("journal_entries")
    .selectAll()
    .where("owner_user_id", "=", scope.userId)
    .orderBy("created_at", "desc")
    .limit(boundedLimit)
    .execute();
}

/**
 * OVE-242. True when the new public text does not still contain the previously
 * published text. Removing a sentence, a name or a landmark is the transition
 * that must reach the index first, so it is classified conservatively: any
 * change that is not a pure addition counts as reducing.
 */
export function isPublicTextReducingEdit(
  prior: { title: string; body: string },
  next: { title: string; body: string },
): boolean {
  const priorTitle = prior.title.trim();
  const priorBody = prior.body.trim();
  return (
    !next.title.trim().includes(priorTitle) ||
    !next.body.trim().includes(priorBody)
  );
}

export async function getPublicJournalEntryPage(
  publicSlug: string,
  executor: QueryExecutor = db,
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): Promise<PublicJournalEntryPage | null> {
  const lookup = await getPublicJournalEntryLookup(
    publicSlug,
    executor,
    locale,
  );
  return lookup.status === "active" ? lookup.page : null;
}

export async function getPublicJournalEntryLifecycleLookup(
  publicSlug: string,
  executor: QueryExecutor = db,
): Promise<PublicJournalEntryLifecycleLookup> {
  const slug = normalizePublicSlug(publicSlug);
  if (!slug) return { status: "not_found" };

  const row = (await buildPublicJournalEntryLifecycleQuery(
    executor,
    slug,
  ).executeTakeFirst()) as PublicJournalEntryLifecycleRow | undefined;
  if (!row?.publicSlug) return { status: "not_found" };

  if (row.publicGoneAt !== null && row.lifecycleState === "archived") {
    return { status: "gone", publicSlug: row.publicSlug };
  }

  const hasValidContext =
    row.entryScope === "space" ||
    (row.entryScope === "object" &&
      row.plantObjectId !== null &&
      row.joinedPlantObjectId !== null);

  return row.visibility === "public" &&
    row.lifecycleState === "active" &&
    row.publicGoneAt === null &&
    hasValidContext
    ? { status: "active" }
    : { status: "not_found" };
}

export async function getPublicJournalEntryLookup(
  publicSlug: string,
  executor: QueryExecutor = db,
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): Promise<PublicJournalEntryLookup> {
  const slug = normalizePublicSlug(publicSlug);
  if (!slug) return { status: "not_found" };

  const row = await buildPublicJournalEntryLookupQuery(
    executor,
    slug,
  ).executeTakeFirst();
  if (!row?.publicSlug) return { status: "not_found" };

  if (isGonePublicEntry(row)) {
    return {
      status: "gone",
      entry: {
        publicSlug: row.publicSlug,
        publicGoneAt: row.publicGoneAt,
        publicNoindex: row.publicNoindex,
      },
    };
  }

  if (
    row.visibility !== "public" ||
    row.lifecycleState !== "active" ||
    row.publicGoneAt !== null
  ) {
    return { status: "not_found" };
  }

  if (
    row.entryScope === "object" &&
    (!row.plantObjectId ||
      !row.objectDisplayName ||
      !row.objectKind ||
      !row.varietyState ||
      !row.objectLocationVisibility)
  ) {
    return { status: "not_found" };
  }

  const adjacentInput: Omit<AdjacentPublicJournalEntryQueryInput, "direction"> =
    {
      entryScope: row.entryScope as EntryScope,
      plantObjectId: row.plantObjectId,
      spaceId: row.spaceId,
      currentEntryId: row.entryId,
      currentEntryDate: row.entryDate,
      currentCreatedAt: row.entryCreatedAt,
    };
  const [
    mediaRows,
    topicRows,
    relatedRows,
    newerRow,
    olderRow,
    mentionedRows,
    mentionedProfileRows,
  ] = await Promise.all([
    buildPublicProcessedMediaForEntryQuery(executor, row.entryId).execute(),
    buildPublicJournalEntryTopicsQuery(executor, row.entryId).execute(),
    row.entryScope === "object" && row.plantObjectId
      ? buildRelatedPublicJournalEntriesQuery(
          executor,
          row.plantObjectId,
          row.entryId,
        ).execute()
      : Promise.resolve([]),
    buildAdjacentPublicJournalEntryQuery(executor, {
      ...adjacentInput,
      direction: "newer",
    }).executeTakeFirst(),
    buildAdjacentPublicJournalEntryQuery(executor, {
      ...adjacentInput,
      direction: "older",
    }).executeTakeFirst(),
    row.entryScope === "space"
      ? buildPublicMentionedObjectsForEntryQuery(
          executor,
          row.entryId,
        ).execute()
      : Promise.resolve([]),
    buildPublicJournalEntryPersonMentionsQuery(executor, row.entryId).execute(),
  ]);

  return {
    status: "active",
    page: serializePublicJournalEntryPage({
      root: row as PublicJournalEntryRootRow,
      mediaRows: mediaRows as PublicJournalEntryMediaRow[],
      topicRows: topicRows as PublicJournalEntryTopicRow[],
      relatedRows: relatedRows as PublicJournalEntryRelatedRow[],
      newerRow: (newerRow as PublicJournalEntryRelatedRow | undefined) ?? null,
      olderRow: (olderRow as PublicJournalEntryRelatedRow | undefined) ?? null,
      mentionedRows: mentionedRows as PublicJournalEntryMentionedObjectRow[],
      mentionedProfileRows:
        mentionedProfileRows as PublicJournalEntryMentionedProfileRow[],
      locale,
    }),
  };
}

export function serializePublicJournalEntryPage(input: {
  root: PublicJournalEntryRootRow;
  mediaRows: PublicJournalEntryMediaRow[];
  topicRows: PublicJournalEntryTopicRow[];
  relatedRows: PublicJournalEntryRelatedRow[];
  newerRow: PublicJournalEntryRelatedRow | null;
  olderRow: PublicJournalEntryRelatedRow | null;
  mentionedRows: PublicJournalEntryMentionedObjectRow[];
  mentionedProfileRows?: PublicJournalEntryMentionedProfileRow[];
  locale?: PublicLocale;
}): PublicJournalEntryPage {
  const locale = input.locale ?? DEFAULT_PUBLIC_LOCALE;
  const root = input.root;
  const space: PublicJournalEntrySafeSpace = {
    displayName: root.spaceDisplayName,
    locationVisibility: root.spaceLocationVisibility as LocationVisibility,
    coarseRegionCode: root.spaceCoarseRegionCode,
  };
  const context: PublicJournalEntryContext =
    root.entryScope === "object" &&
    root.plantObjectId &&
    root.objectDisplayName &&
    root.objectKind &&
    root.varietyState &&
    root.objectLocationVisibility
      ? {
          kind: "object",
          space,
          object: {
            plantObjectId: root.plantObjectId,
            displayName: root.objectDisplayName,
            objectKind: root.objectKind as PlantObjectKind,
            catalogKind: root.catalogKind as CatalogKind | null,
            catalogCanonicalName: root.catalogCanonicalName,
            catalogPublicSlug: root.catalogPublicSlug,
            publicPath: publicLineageObjectPath(root.plantObjectId),
            varietyText: root.varietyText,
            varietyState: root.varietyState as VarietyState,
            locationVisibility:
              root.objectLocationVisibility as LocationVisibility,
            coarseRegionCode: root.objectCoarseRegionCode,
          },
        }
      : {
          kind: "space",
          space,
          mentionedObjects: input.mentionedRows.map((row) => ({
            plantObjectId: row.plantObjectId,
            displayName: row.displayName,
            objectKind: row.objectKind as PlantObjectKind,
            catalogCanonicalName: row.catalogCanonicalName,
            catalogPublicSlug: row.catalogPublicSlug,
            publicPath: publicLineageObjectPath(row.plantObjectId),
            varietyText: row.varietyText,
            varietyState: row.varietyState as VarietyState,
          })),
        };
  const coarseRegionUnavailable = [
    [root.spaceLocationVisibility, root.spaceCoarseRegionCode],
    [root.objectLocationVisibility, root.objectCoarseRegionCode],
  ].some(
    ([visibility, code]) =>
      visibility === "region" && !normalizeCoarseRegionCode(code),
  );

  return {
    entry: {
      id: root.entryId,
      title: root.title,
      body: root.body,
      contentDocument: root.contentDocument ?? null,
      contentSchemaVersion: root.contentSchemaVersion ?? null,
      entryDate: root.entryDate,
      createdAt: root.entryCreatedAt,
      entryScope: root.entryScope as EntryScope,
      publicSlug: root.publicSlug ?? "",
      publicPath: localizedPublicJournalEvidencePath(
        locale,
        root.publicSlug ?? "",
      ),
      publicNoindex: root.publicNoindex,
      publishedAt: root.publishedAt,
    },
    context,
    author: serializePublicJournalEntryAuthor(
      {
        handle: root.authorHandle,
        displayName: root.authorDisplayName,
        avatarUrl: root.authorAvatarUrl,
      },
      locale,
    ),
    topics: input.topicRows.map((row) => ({
      slug: row.slug,
      label: row.label,
      publicPath: localizedPath(locale, publicTopicPath(row.slug)),
    })),
    relatedEntries: serializeRelatedPublicJournalEntries(
      input.relatedRows,
      locale,
    ),
    adjacentEntries: {
      newer: serializeRelatedPublicJournalEntry(input.newerRow, locale),
      older: serializeRelatedPublicJournalEntry(input.olderRow, locale),
    },
    media: input.mediaRows.map((row) => ({
      id: row.id,
      publicUrl: getPublicDerivativeUrl(row.derivativeKey),
      altText: row.altText,
      caption: row.caption,
      focalX: Number("focalX" in row && row.focalX != null ? row.focalX : 0.5),
      focalY: Number("focalY" in row && row.focalY != null ? row.focalY : 0.5),
      intrinsicWidth:
        "intrinsicWidth" in row ? (row.intrinsicWidth as number | null) : null,
      intrinsicHeight:
        "intrinsicHeight" in row
          ? (row.intrinsicHeight as number | null)
          : null,
    })),
    mentionedProfiles: (input.mentionedProfileRows ?? []).map((profile) => ({
      handle: profile.handle,
      mention: `@${profile.handle}`,
      displayName: profile.displayName ?? `@${profile.handle}`,
      profilePath: publicProfilePath(locale, profile.handle),
    })),
    qualityClass: coarseRegionUnavailable ? "partial" : "verified",
  };
}

function serializePublicJournalEntryAuthor(
  input: {
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  },
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): PublicJournalEntryPage["author"] {
  if (!input.handle) return null;

  return {
    handle: input.handle,
    mention: `@${input.handle}`,
    displayName: input.displayName ?? `@${input.handle}`,
    avatarUrl: input.avatarUrl,
    profilePath: publicProfilePath(locale, input.handle),
  };
}

function serializeRelatedPublicJournalEntries(
  rows: Array<{
    entryId: string;
    title: string;
    body: string;
    entryDate: Date | string;
    publicSlug: string;
  }>,
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
): PublicJournalEntryRelatedEntry[] {
  return rows.map((row) => serializeRelatedPublicJournalEntry(row, locale)!);
}

function serializeRelatedPublicJournalEntry(
  row: PublicJournalEntryRelatedRow | null,
  locale: PublicLocale,
): PublicJournalEntryRelatedEntry | null {
  if (!row) return null;

  return {
    id: row.entryId,
    title: row.title,
    bodyPreview: publicJournalEntryBodyPreview(row.body),
    entryDate: row.entryDate,
    publicSlug: row.publicSlug,
    publicPath: localizedPublicJournalEvidencePath(locale, row.publicSlug),
  };
}

function publicJournalEntryBodyPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 150) return normalized;

  return `${normalized.slice(0, 147).trimEnd()}...`;
}

function normalizeRelatedPublicJournalEntryLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_RELATED_PUBLIC_JOURNAL_ENTRIES;
  return Math.min(
    Math.max(Math.trunc(limit), 1),
    MAX_RELATED_PUBLIC_JOURNAL_ENTRIES,
  );
}

export async function archiveJournalEntry(
  scope: RequestScope,
  input: ArchiveJournalEntryInput,
): Promise<ArchiveJournalEntryResult> {
  const entryId = normalizeRequiredText(input.entryId, "Entry id", 200);
  const existing = await findJournalEntryById(scope, entryId);

  if (!existing) {
    throw new Error("Journal entry was not found in this garden.");
  }

  if (existing.lifecycle_state === "archived") {
    return {
      entry: existing,
      publicUrl: existing.public_slug
        ? publicJournalEntryPath(existing.public_slug)
        : null,
      publicGone: existing.public_gone_at !== null,
    };
  }

  const now = new Date();
  const hadPublicUrl =
    existing.visibility === "public" && existing.public_slug !== null;

  const archived = await db.transaction().execute(async (trx) => {
    const row = await buildArchiveJournalEntryQuery(trx, scope, {
      entryId,
      now,
      publicGoneAt: hadPublicUrl ? now : null,
    }).executeTakeFirstOrThrow();

    await enqueueArchiveDerivativeRevokes(trx, {
      journalEntryId: entryId,
      ownerUserId: scope.userId,
    });

    // OVE-242: archive commits the removal intent atomically. Previously the
    // unindex job was scheduled by the action after this transaction, so a
    // failure there left archived content searchable with nothing recording it.
    if (existing.public_slug !== null) {
      await recordPublicProjectionIntent(trx, {
        entityId: row.id,
        ownerUserId: scope.userId,
        desiredState: "absent",
        reason: "archive",
      });
    }

    return row;
  });

  return {
    entry: archived,
    publicUrl: archived.public_slug
      ? publicJournalEntryPath(archived.public_slug)
      : null,
    publicGone: archived.public_gone_at !== null,
  };
}

export function buildFindExistingEntryByClientMutationQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  clientMutationId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .selectAll("journal_entries")
    .where("owner_user_id", "=", scope.userId)
    .where("client_mutation_id", "=", clientMutationId);
}

export function buildJournalMutationAdvisoryLockQuery(
  scope: RequestScope,
  clientMutationId: string,
) {
  const lockKey = `${scope.userId.length}:${scope.userId}:${clientMutationId}`;
  return sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

export function buildFindJournalEntryByIdQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .selectAll("journal_entries")
    .where("id", "=", entryId)
    .where("owner_user_id", "=", scope.userId);
}

export function buildObjectJournalEntryCountQuery(
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
    .select(({ fn }) => fn.countAll<number>().as("entryCount"))
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
    );
}

export function buildInsertJournalEntryQuery(
  executor: QueryExecutor,
  row: NewJournalEntryRow,
) {
  return executor
    .insertInto("journal_entries")
    .values(row)
    .onConflict((oc) =>
      oc.columns(["owner_user_id", "client_mutation_id"]).doNothing(),
    )
    .returningAll();
}

export function buildPriorPublicationDisclosureQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("journal_entries")
    .select("id")
    .where("owner_user_id", "=", scope.userId)
    .where("first_publication_disclosed_at", "is not", null)
    .limit(1);
}

export async function hasPriorPublicationDisclosure(
  scope: RequestScope,
): Promise<boolean> {
  return Boolean(
    await buildPriorPublicationDisclosureQuery(db, scope).executeTakeFirst(),
  );
}

export function buildArchiveJournalEntryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    entryId: string;
    now: Date;
    publicGoneAt: Date | null;
  },
) {
  return executor
    .updateTable("journal_entries")
    .set({
      lifecycle_state: "archived",
      visibility: "public",
      public_noindex: true,
      archived_at: input.now,
      public_gone_at: input.publicGoneAt ?? undefined,
      updated_at: input.now,
    })
    .where("id", "=", input.entryId)
    .where("owner_user_id", "=", scope.userId)
    .where("lifecycle_state", "=", "active")
    .returningAll();
}

export function buildResolvePlantObjectCatalogQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    plantObjectId: string;
    catalogItemId: string;
    objectKind: PlantObjectKind;
    varietyText: string;
    now: Date;
  },
) {
  return executor
    .updateTable("plant_objects")
    .set({
      catalog_item_id: input.catalogItemId,
      object_kind: input.objectKind,
      variety_text: input.varietyText,
      variety_state: "selected",
      updated_at: input.now,
    })
    .where("id", "=", input.plantObjectId)
    .where("owner_user_id", "=", scope.userId)
    .where("variety_state", "in", ["unknown", "user_added"])
    .returningAll();
}

export function buildUpdatePlantObjectLocationQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    plantObjectId: string;
    locationVisibility: LocationVisibility;
    coarseRegionCode: string | null;
    now: Date;
  },
) {
  return executor
    .updateTable("plant_objects")
    .set({
      location_visibility: input.locationVisibility,
      coarse_region_code: input.coarseRegionCode,
      updated_at: input.now,
    })
    .where("id", "=", input.plantObjectId)
    .where("owner_user_id", "=", scope.userId)
    .returningAll();
}

export function buildPublicEntrySlugsForObjectQuery(
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
    .select("public_slug as publicSlug")
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
    .where("visibility", "=", "public")
    .where("lifecycle_state", "=", "active")
    .where("public_gone_at", "is", null)
    .where("public_slug", "is not", null)
    .where(publicLaunchSurfacePredicates());
}

export function buildPlantObjectPageObjectQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  objectId: string,
) {
  return executor
    .selectFrom("plant_objects")
    .innerJoin("spaces", "spaces.id", "plant_objects.space_id")
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "plant_objects.id as objectId",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.catalog_item_id as catalogItemId",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.location_visibility as objectLocationVisibility",
      "plant_objects.coarse_region_code as objectCoarseRegionCode",
      "spaces.id as spaceId",
      "spaces.display_name as spaceDisplayName",
      "spaces.location_visibility as spaceLocationVisibility",
      "spaces.coarse_region_code as spaceCoarseRegionCode",
    ])
    .where("plant_objects.id", "=", objectId)
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("spaces.owner_user_id", "=", scope.userId);
}

export function buildSpaceByIdQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  spaceId: string,
) {
  return executor
    .selectFrom("spaces")
    .select(["id", "display_name", "location_visibility", "coarse_region_code"])
    .where("id", "=", spaceId)
    .where("owner_user_id", "=", scope.userId);
}

export function buildOwnedSpaceForFirstEntryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  spaceId: string,
) {
  return buildSpaceByIdQuery(executor, scope, spaceId);
}

export function buildSpaceTimelineObjectsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  spaceIds: readonly string[],
) {
  return executor
    .selectFrom("plant_objects")
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
        .on("catalog_items.created_by_user_id", "is", null),
    )
    .select([
      "plant_objects.id as id",
      "plant_objects.space_id as spaceId",
      "plant_objects.display_name as displayName",
      "plant_objects.object_kind as objectKind",
      "catalog_items.catalog_kind as catalogKind",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
    ])
    .where("plant_objects.owner_user_id", "=", scope.userId)
    .where("plant_objects.space_id", "in", [...spaceIds])
    .orderBy("plant_objects.created_at", "desc");
}

export function buildSpaceTimelineEntriesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  spaceIds: readonly string[],
) {
  return executor
    .selectFrom("journal_entries")
    .selectAll("journal_entries")
    .where("journal_entries.owner_user_id", "=", scope.userId)
    .where("journal_entries.entry_scope", "=", "space")
    .where("journal_entries.space_id", "in", [...spaceIds])
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc");
}

export function buildObjectTimelineEntriesQuery(
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
    .selectAll("journal_entries")
    .select(() =>
      sql<JournalEntryTimelineRelation>`case
        when ${sql.ref("journal_entries.entry_scope")} = 'space'
          then 'mentioned_space'
        else 'direct_object'
      end`.as("timelineRelation"),
    )
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
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc");
}

export function buildMentionableObjectsInSpaceQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    spaceId: string;
    plantObjectIds: readonly string[];
  },
) {
  return executor
    .selectFrom("plant_objects")
    .select([
      "id",
      "display_name as displayName",
      "space_id as spaceId",
      "owner_user_id as ownerUserId",
    ])
    .where("owner_user_id", "=", scope.userId)
    .where("space_id", "=", input.spaceId)
    .where("id", "in", [...input.plantObjectIds])
    .orderBy("display_name", "asc");
}

export function buildMentionedObjectsForEntriesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: readonly string[],
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
    .select([
      "journal_entry_object_mentions.journal_entry_id as journalEntryId",
      "plant_objects.id as plantObjectId",
      "plant_objects.display_name as displayName",
    ])
    .where("journal_entry_object_mentions.owner_user_id", "=", scope.userId)
    .where("journal_entry_object_mentions.journal_entry_id", "in", [
      ...entryIds,
    ])
    .orderBy("plant_objects.display_name", "asc");
}

export function buildInsertJournalEntryObjectMentionsQuery(
  executor: QueryExecutor,
  input: {
    ownerUserId: string;
    spaceId: string;
    journalEntryId: string;
    plantObjectIds: readonly string[];
  },
) {
  return executor
    .insertInto("journal_entry_object_mentions")
    .values(
      input.plantObjectIds.map((plantObjectId) => ({
        owner_user_id: input.ownerUserId,
        space_id: input.spaceId,
        journal_entry_id: input.journalEntryId,
        plant_object_id: plantObjectId,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["journal_entry_id", "plant_object_id"]).doNothing(),
    )
    .returningAll();
}

export function buildPlantObjectCatalogSourceCreditQuery(
  executor: QueryExecutor,
  catalogItemId: string,
) {
  return executor
    .selectFrom("catalog_source_links")
    .innerJoin(
      "catalog_source_records",
      "catalog_source_records.id",
      "catalog_source_links.source_record_id",
    )
    .innerJoin(
      "catalog_source_snapshots",
      "catalog_source_snapshots.id",
      "catalog_source_records.source_snapshot_id",
    )
    .select([
      "catalog_source_links.source_slug as sourceSlug",
      "catalog_source_snapshots.source_name as sourceName",
      "catalog_source_snapshots.source_url as sourceUrl",
      "catalog_source_snapshots.attribution_text as attributionText",
    ])
    .where("catalog_source_links.catalog_item_id", "=", catalogItemId)
    .where("catalog_source_links.projection_kind", "=", "canonical_item")
    .where("catalog_source_records.projection_status", "=", "projected")
    .where("catalog_source_snapshots.attribution_required", "=", true)
    .orderBy("catalog_source_snapshots.verified_at", "desc")
    .orderBy("catalog_source_snapshots.source_name", "asc")
    .limit(1);
}

export function buildPublicJournalEntryPageQuery(
  executor: QueryExecutor,
  publicSlug: string,
) {
  return buildPublicJournalEntryLookupQuery(executor, publicSlug)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null);
}

export function buildPublicJournalEntryLifecycleQuery(
  executor: QueryExecutor,
  publicSlug: string,
) {
  return executor
    .selectFrom("journal_entries")
    .innerJoin("spaces", (join) =>
      join
        .onRef("spaces.id", "=", "journal_entries.space_id")
        .onRef("spaces.owner_user_id", "=", "journal_entries.owner_user_id"),
    )
    .leftJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .select([
      "journal_entries.entry_scope as entryScope",
      "journal_entries.visibility as visibility",
      "journal_entries.lifecycle_state as lifecycleState",
      "journal_entries.public_slug as publicSlug",
      "journal_entries.public_gone_at as publicGoneAt",
      "journal_entries.plant_object_id as plantObjectId",
      "plant_objects.id as joinedPlantObjectId",
    ])
    .where("journal_entries.public_slug", "=", publicSlug)
    .where(publicLaunchSurfacePredicates());
}

export function buildPublicJournalEntryLookupQuery(
  executor: QueryExecutor,
  publicSlug: string,
) {
  return executor
    .selectFrom("journal_entries")
    .leftJoin("plant_objects", (join) =>
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
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
        .on("catalog_items.created_by_user_id", "is", null)
        .on("catalog_items.public_slug", "is not", null),
    )
    .leftJoin("user_handle_registry", (join) =>
      join
        .onRef(
          "user_handle_registry.user_id",
          "=",
          "journal_entries.owner_user_id",
        )
        .on("user_handle_registry.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles", (join) =>
      join
        .onRef(
          "user_public_profiles.user_id",
          "=",
          "user_handle_registry.user_id",
        )
        .onRef(
          "user_public_profiles.normalized_handle",
          "=",
          "user_handle_registry.normalized_handle",
        )
        .on("user_public_profiles.profile_visibility", "=", "public")
        .on("user_public_profiles.profile_lifecycle_state", "=", "active")
        .on("user_public_profiles.removed_at", "is", null),
    )
    .select([
      "journal_entries.id as entryId",
      "journal_entries.title as title",
      "journal_entries.body as body",
      "journal_entries.content_document as contentDocument",
      "journal_entries.content_schema_version as contentSchemaVersion",
      "journal_entries.entry_date as entryDate",
      "journal_entries.created_at as entryCreatedAt",
      "journal_entries.entry_scope as entryScope",
      "journal_entries.visibility as visibility",
      "journal_entries.lifecycle_state as lifecycleState",
      "journal_entries.public_slug as publicSlug",
      "journal_entries.public_noindex as publicNoindex",
      "journal_entries.published_at as publishedAt",
      "journal_entries.public_gone_at as publicGoneAt",
      "spaces.id as spaceId",
      "spaces.display_name as spaceDisplayName",
      "spaces.location_visibility as spaceLocationVisibility",
      "spaces.coarse_region_code as spaceCoarseRegionCode",
      "plant_objects.id as plantObjectId",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.catalog_item_id as catalogItemId",
      "catalog_items.catalog_kind as catalogKind",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "plant_objects.location_visibility as objectLocationVisibility",
      "plant_objects.coarse_region_code as objectCoarseRegionCode",
      "user_public_profiles.handle as authorHandle",
      "user_public_profiles.display_name as authorDisplayName",
      "user_public_profiles.avatar_url as authorAvatarUrl",
    ])
    .where("journal_entries.public_slug", "=", publicSlug)
    .where(publicLaunchSurfacePredicates());
}

export function buildRelatedPublicJournalEntriesQuery(
  executor: QueryExecutor,
  plantObjectId: string,
  currentEntryId: string,
  limit = MAX_RELATED_PUBLIC_JOURNAL_ENTRIES,
) {
  return executor
    .selectFrom("journal_entries")
    .select([
      "journal_entries.id as entryId",
      "journal_entries.title as title",
      "journal_entries.body as body",
      "journal_entries.entry_date as entryDate",
      "journal_entries.public_slug as publicSlug",
    ])
    .where("journal_entries.plant_object_id", "=", plantObjectId)
    .where("journal_entries.id", "!=", currentEntryId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where(publicLaunchSurfacePredicates())
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(normalizeRelatedPublicJournalEntryLimit(limit))
    .$narrowType<{ publicSlug: string }>();
}

export function buildPublicJournalEntryTopicsQuery(
  executor: QueryExecutor,
  entryId: string,
  limit = MAX_PUBLIC_JOURNAL_TOPICS,
) {
  return executor
    .selectFrom("journal_entry_topic_signals")
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "journal_entry_topic_signals.journal_entry_id",
    )
    .innerJoin(
      "journal_topics",
      "journal_topics.id",
      "journal_entry_topic_signals.topic_id",
    )
    .select(["journal_topics.slug as slug", "journal_topics.label as label"])
    .where("journal_entries.id", "=", entryId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where(publicLaunchSurfacePredicates())
    .where("journal_entry_topic_signals.review_state", "=", "accepted")
    .where(
      "journal_entry_topic_signals.public_membership_state",
      "=",
      "eligible",
    )
    .where("journal_topics.trust_state", "=", "curated")
    .orderBy("journal_topics.label", "asc")
    .orderBy("journal_topics.slug", "asc")
    .limit(normalizePublicJournalTopicLimit(limit));
}

export interface AdjacentPublicJournalEntryQueryInput {
  entryScope: EntryScope;
  plantObjectId: string | null;
  spaceId: string;
  currentEntryId: string;
  currentEntryDate: Date | string;
  currentCreatedAt: Date | string;
  direction: "newer" | "older";
}

export function buildAdjacentPublicJournalEntryQuery(
  executor: QueryExecutor,
  input: AdjacentPublicJournalEntryQueryInput,
) {
  const currentEntryDate = sql<Date>`${input.currentEntryDate}`;
  const currentCreatedAt = sql<Date>`${input.currentCreatedAt}`;
  let query = executor
    .selectFrom("journal_entries")
    .select([
      "journal_entries.id as entryId",
      "journal_entries.title as title",
      "journal_entries.body as body",
      "journal_entries.entry_date as entryDate",
      "journal_entries.public_slug as publicSlug",
    ])
    .where("journal_entries.id", "!=", input.currentEntryId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where(publicLaunchSurfacePredicates());

  query =
    input.entryScope === "object" && input.plantObjectId
      ? query.where("journal_entries.plant_object_id", "=", input.plantObjectId)
      : query
          .where("journal_entries.entry_scope", "=", "space")
          .where("journal_entries.space_id", "=", input.spaceId);

  query = query.where((eb) => {
    const dateOperator = input.direction === "newer" ? ">" : "<";
    const createdOperator = input.direction === "newer" ? ">" : "<";
    const idOperator = input.direction === "newer" ? "<" : ">";

    return eb.or([
      eb("journal_entries.entry_date", dateOperator, currentEntryDate),
      eb.and([
        eb("journal_entries.entry_date", "=", currentEntryDate),
        eb("journal_entries.created_at", createdOperator, currentCreatedAt),
      ]),
      eb.and([
        eb("journal_entries.entry_date", "=", currentEntryDate),
        eb("journal_entries.created_at", "=", currentCreatedAt),
        eb("journal_entries.id", idOperator, input.currentEntryId),
      ]),
    ]);
  });

  return (
    input.direction === "newer"
      ? query
          .orderBy("journal_entries.entry_date", "asc")
          .orderBy("journal_entries.created_at", "asc")
          .orderBy("journal_entries.id", "desc")
      : query
          .orderBy("journal_entries.entry_date", "desc")
          .orderBy("journal_entries.created_at", "desc")
          .orderBy("journal_entries.id", "asc")
  )
    .limit(1)
    .$narrowType<{ publicSlug: string }>();
}

export function buildPublicMentionedObjectsForEntryQuery(
  executor: QueryExecutor,
  entryId: string,
  limit = MAX_PUBLIC_JOURNAL_MENTIONED_OBJECTS,
) {
  return executor
    .selectFrom("journal_entry_object_mentions")
    .innerJoin("journal_entries", (join) =>
      join
        .onRef(
          "journal_entries.id",
          "=",
          "journal_entry_object_mentions.journal_entry_id",
        )
        .onRef(
          "journal_entries.owner_user_id",
          "=",
          "journal_entry_object_mentions.owner_user_id",
        ),
    )
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
        .on("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
        .on("catalog_items.created_by_user_id", "is", null)
        .on("catalog_items.public_slug", "is not", null),
    )
    .select([
      "plant_objects.id as plantObjectId",
      "plant_objects.display_name as displayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.public_slug as catalogPublicSlug",
    ])
    .where("journal_entries.id", "=", entryId)
    .where("journal_entries.entry_scope", "=", "space")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where(publicLaunchSurfacePredicates())
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("journal_entries as object_public_entries")
          .select("object_public_entries.id")
          .whereRef(
            "object_public_entries.plant_object_id",
            "=",
            "plant_objects.id",
          )
          .whereRef(
            "object_public_entries.owner_user_id",
            "=",
            "plant_objects.owner_user_id",
          )
          .where("object_public_entries.entry_scope", "=", "object")
          .where("object_public_entries.visibility", "=", "public")
          .where("object_public_entries.lifecycle_state", "=", "active")
          .where("object_public_entries.public_gone_at", "is", null)
          .where("object_public_entries.public_slug", "is not", null)
          .where(
            publicLaunchSurfacePredicates(
              sql.ref<string | null>("object_public_entries.content_class"),
            ),
          ),
      ),
    )
    .orderBy("plant_objects.display_name", "asc")
    .orderBy("plant_objects.id", "asc")
    .limit(normalizePublicJournalMentionedObjectLimit(limit));
}

/**
 * Resolves confirmed person mentions from their stable internal user target.
 * The journal body remains immutable historical UGC; public identity is a
 * separate projection so a rename changes this readback without rewriting the
 * stored entry text or retaining the former handle as identity data.
 */
export function buildPublicJournalEntryPersonMentionsQuery(
  executor: QueryExecutor,
  entryId: string,
  limit = MAX_PUBLIC_JOURNAL_MENTIONED_PROFILES,
) {
  return executor
    .selectFrom("journal_entries")
    .innerJoin("lineage_provenance_edges as person_mentions", (join) =>
      join
        .onRef(
          "person_mentions.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        )
        .onRef(
          "person_mentions.subject_plant_object_id",
          "=",
          "journal_entries.plant_object_id",
        )
        .on(
          sql<boolean>`
            ${sql.ref("person_mentions.client_mutation_id")}
              ~ ':mention:public_handle:[a-f0-9]{16}$'
            and ${sql.ref("person_mentions.client_mutation_id")} = left(
              ${sql.ref("journal_entries.client_mutation_id")}
                || ':mention:public_handle:'
                || right(${sql.ref("person_mentions.client_mutation_id")}, 16),
              160
            )
          `,
        ),
    )
    .innerJoin("user_handle_registry as mentioned_handles", (join) =>
      join
        .onRef(
          "mentioned_handles.user_id",
          "=",
          "person_mentions.source_owner_user_id",
        )
        .on("mentioned_handles.lifecycle_state", "=", "current"),
    )
    .innerJoin("user_public_profiles as mentioned_profiles", (join) =>
      join
        .onRef("mentioned_profiles.user_id", "=", "mentioned_handles.user_id")
        .onRef(
          "mentioned_profiles.normalized_handle",
          "=",
          "mentioned_handles.normalized_handle",
        )
        .on("mentioned_profiles.handle_registry_state", "=", "current")
        .on("mentioned_profiles.profile_visibility", "=", "public")
        .on("mentioned_profiles.profile_lifecycle_state", "=", "active")
        .on("mentioned_profiles.removed_at", "is", null),
    )
    .select([
      "mentioned_profiles.handle as handle",
      "mentioned_profiles.display_name as displayName",
    ])
    .where("journal_entries.id", "=", entryId)
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where(publicLaunchSurfacePredicates())
    .where("person_mentions.source_kind", "=", "source_reference")
    .where("person_mentions.source_reference_kind", "=", "person")
    .where("person_mentions.source_plant_object_id", "is", null)
    .where("person_mentions.source_owner_user_id", "is not", null)
    .whereRef(
      "person_mentions.owner_user_id",
      "!=",
      "person_mentions.source_owner_user_id",
    )
    .where("person_mentions.consent_state", "=", "confirmed")
    .where(
      "person_mentions.visibility_policy",
      "=",
      "owner_only_until_confirmed",
    )
    .where("person_mentions.erasure_state", "=", "active")
    .where(noActivePublicPersonMentionBlockPredicate())
    .orderBy("person_mentions.created_at", "asc")
    .orderBy("person_mentions.id", "asc")
    .limit(normalizePublicJournalMentionedProfileLimit(limit));
}

function noActivePublicPersonMentionBlockPredicate() {
  return sql<boolean>`not exists (
    select 1
    from profile_blocks
    where profile_blocks.block_state = 'active'
      and (
        (
          profile_blocks.blocker_user_id = ${sql.ref(
            "person_mentions.owner_user_id",
          )}
          and profile_blocks.blocked_user_id = ${sql.ref(
            "person_mentions.source_owner_user_id",
          )}
        )
        or (
          profile_blocks.blocker_user_id = ${sql.ref(
            "person_mentions.source_owner_user_id",
          )}
          and profile_blocks.blocked_user_id = ${sql.ref(
            "person_mentions.owner_user_id",
          )}
        )
      )
  )`;
}

function normalizePublicJournalTopicLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_PUBLIC_JOURNAL_TOPICS;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PUBLIC_JOURNAL_TOPICS);
}

function normalizePublicJournalMentionedObjectLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_PUBLIC_JOURNAL_MENTIONED_OBJECTS;
  return Math.min(
    Math.max(Math.trunc(limit), 1),
    MAX_PUBLIC_JOURNAL_MENTIONED_OBJECTS,
  );
}

function normalizePublicJournalMentionedProfileLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_PUBLIC_JOURNAL_MENTIONED_PROFILES;
  return Math.min(
    Math.max(Math.trunc(limit), 1),
    MAX_PUBLIC_JOURNAL_MENTIONED_PROFILES,
  );
}

export function buildProcessedMediaForEntriesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: readonly string[],
) {
  return executor
    .selectFrom("media_assets")
    .select([
      "id",
      "journal_entry_id as journalEntryId",
      "derivative_key as derivativeKey",
      "focal_x as focalX",
      "focal_y as focalY",
      "intrinsic_width as intrinsicWidth",
      "intrinsic_height as intrinsicHeight",
    ])
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "in", entryIds)
    .where(publicMediaEligibilityPredicate());
}

export function buildProcessedObjectMediaGalleryQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: readonly string[],
  limit = MAX_OBJECT_GALLERY_MEDIA,
) {
  return executor
    .selectFrom("media_assets")
    .select([
      "id",
      "derivative_key as derivativeKey",
      "focal_x as focalX",
      "focal_y as focalY",
      "intrinsic_width as intrinsicWidth",
      "intrinsic_height as intrinsicHeight",
    ])
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "in", entryIds)
    .where(publicMediaEligibilityPredicate())
    .where("usage_role", "=", "inline")
    .orderBy("document_position", "asc")
    .orderBy("id", "asc")
    .limit(normalizeObjectGalleryLimit(limit))
    .$narrowType<{ derivativeKey: string }>();
}

export function buildPublicProcessedMediaForEntryQuery(
  executor: QueryExecutor,
  entryId: string,
  limit = MAX_PUBLIC_JOURNAL_MEDIA,
) {
  return executor
    .selectFrom("media_assets")
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "media_assets.journal_entry_id",
    )
    .select([
      "media_assets.id as id",
      "media_assets.derivative_key as derivativeKey",
      "media_assets.alt_text as altText",
      "media_assets.caption as caption",
      "media_assets.focal_x as focalX",
      "media_assets.focal_y as focalY",
      "media_assets.intrinsic_width as intrinsicWidth",
      "media_assets.intrinsic_height as intrinsicHeight",
    ])
    .whereRef(
      "media_assets.owner_user_id",
      "=",
      "journal_entries.owner_user_id",
    )
    .where("journal_entries.id", "=", entryId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where(publicLaunchSurfacePredicates())
    .where(publicMediaEligibilityPredicate())
    .where("media_assets.usage_role", "=", "inline")
    .orderBy("media_assets.document_position", "asc")
    .orderBy("media_assets.id", "asc")
    .limit(normalizePublicJournalMediaLimit(limit));
}

function normalizePublicJournalMediaLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_PUBLIC_JOURNAL_MEDIA;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PUBLIC_JOURNAL_MEDIA);
}

async function insertJournalEntry(
  executor: QueryExecutor,
  row: NewJournalEntryRow,
): Promise<JournalEntry | undefined> {
  return buildInsertJournalEntryQuery(executor, row).executeTakeFirst();
}

type NormalizedAtomicCreate = {
  clientMutationId: string;
  title: string;
  orderedMediaAssetIds: readonly string[];
  atomicPublication: AtomicCreatePublicationInput;
};

async function findExistingJournalEntryForCreate(
  scope: RequestScope,
  input: NormalizedAtomicCreate,
  executor: QueryExecutor = db,
): Promise<JournalEntry | undefined> {
  const atomic = input.atomicPublication;
  assertAtomicClientMutation(input.clientMutationId, atomic);
  const existing = await findJournalEntryById(
    scope,
    atomic.publishId,
    executor,
  );
  if (!existing) return undefined;
  await assertAtomicPublicationReplayComplete(executor, scope, existing, input);
  return existing;
}

function atomicCreateLockKey(input: NormalizedAtomicCreate) {
  return input.atomicPublication.publishId;
}

async function prepareAtomicCreateTransaction(
  executor: Transaction<Database>,
  scope: RequestScope,
) {
  await sql`set local statement_timeout = '3000ms'`.execute(executor);
  await sql`set local lock_timeout = '2750ms'`.execute(executor);
  await sql`select pg_advisory_xact_lock(hashtextextended(${`atomic-create-owner:${scope.userId}`}, 0))`.execute(
    executor,
  );
}

async function atomicJournalEntryValues(
  executor: QueryExecutor,
  scope: RequestScope,
  input: NormalizedAtomicCreate,
): Promise<Partial<NewJournalEntryRow>> {
  const atomic = input.atomicPublication;
  assertAtomicClientMutation(input.clientMutationId, atomic);
  const priorDisclosure = await buildPriorPublicationDisclosureQuery(
    executor,
    scope,
  ).executeTakeFirst();
  const disclosureLogged = !priorDisclosure;
  if (disclosureLogged && !atomic.disclosureAccepted) {
    throw new Error("First-publication disclosure must be accepted.");
  }
  const now = new Date();
  return {
    id: atomic.publishId,
    visibility: "public",
    lifecycle_state: "active",
    public_slug: createAtomicPublicSlug(input.title, atomic.publishId),
    public_noindex: true,
    published_at: now,
    first_publication_disclosure_version: disclosureLogged
      ? FIRST_PUBLICATION_DISCLOSURE_VERSION
      : null,
    first_publication_disclosed_at: disclosureLogged ? now : null,
  };
}

async function insertAtomicPublicationMedia(
  executor: QueryExecutor,
  scope: RequestScope,
  journalEntryId: string,
  input: NormalizedAtomicCreate,
) {
  const atomic = input.atomicPublication;
  if (!atomic.handoff) return;
  await insertClaimedEphemeralMediaForEntry(executor, {
    ownerUserId: scope.userId,
    journalEntryId,
    media: atomic.handoff.publicMedia,
    orderedInlineMediaAssetIds: input.orderedMediaAssetIds,
    coverMediaAssetId: atomic.coverMediaAssetId,
  });
}

async function recordAtomicPublicationEffects(
  executor: QueryExecutor,
  scope: RequestScope,
  journalEntryId: string,
  input: NormalizedAtomicCreate,
) {
  const atomic = input.atomicPublication;
  await recordPublicProjectionIntent(executor, {
    entityId: journalEntryId,
    ownerUserId: scope.userId,
    desiredState: "present",
    reason: "publish",
  });
  if (atomic.handoff) {
    await buildEnqueueMediaStagingFinalizeJobQuery(executor, {
      publishId: atomic.publishId,
      stagingSessionId: atomic.handoff.stagingSessionId,
      receiptSetDigest: atomic.handoff.receiptSetDigest,
    }).execute();
  }
}

async function assertAtomicPublicationReplayComplete(
  executor: QueryExecutor,
  scope: RequestScope,
  entry: JournalEntry,
  input: NormalizedAtomicCreate,
) {
  const atomic = input.atomicPublication;
  if (
    entry.id !== atomic.publishId ||
    entry.client_mutation_id !== atomicClientMutationId(atomic) ||
    entry.visibility !== "public" ||
    entry.lifecycle_state !== "active" ||
    !entry.public_slug ||
    !entry.published_at ||
    entry.cover_media_asset_id !== atomic.coverMediaAssetId
  ) {
    throw new Error("idempotency_mismatch");
  }
  const expected = atomic.handoff?.publicMedia ?? [];
  const rows = await executor
    .selectFrom("media_assets")
    .select([
      "id",
      "upload_generation",
      "declared_size_bytes",
      "intrinsic_width",
      "intrinsic_height",
      "derivative_key",
      "revoked_at",
    ])
    .where("owner_user_id", "=", scope.userId)
    .where("journal_entry_id", "=", entry.id)
    .orderBy("id", "asc")
    .execute();
  const sortedExpected = [...expected].sort((left, right) =>
    left.mediaAssetId.localeCompare(right.mediaAssetId),
  );
  if (
    rows.length !== sortedExpected.length ||
    rows.some((row, index) => {
      const media = sortedExpected[index]!;
      return (
        row.id !== media.mediaAssetId ||
        Number(row.upload_generation) !== media.generation ||
        Number(row.declared_size_bytes) !== media.sizeBytes ||
        row.intrinsic_width !== media.width ||
        row.intrinsic_height !== media.height ||
        row.derivative_key !== media.publicPath ||
        row.revoked_at !== null
      );
    })
  ) {
    throw new Error("idempotency_mismatch");
  }
}

function assertAtomicClientMutation(
  clientMutationId: string,
  atomic: AtomicCreatePublicationInput,
) {
  if (clientMutationId !== atomicClientMutationId(atomic)) {
    throw new Error("idempotency_mismatch");
  }
}

export function atomicClientMutationId(
  atomic: Pick<AtomicCreatePublicationInput, "publishId" | "requestDigest">,
) {
  return `atomic:${atomic.publishId}:${atomic.requestDigest}`;
}

function createAtomicPublicSlug(title: string, publishId: string) {
  const suffix = publishId.replaceAll("-", "").slice(0, 12);
  const base = title
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, Math.max(1, MAX_PUBLIC_SLUG_LENGTH - suffix.length - 1));
  return `${base || "entry"}-${suffix}`;
}

async function findJournalEntryById(
  scope: RequestScope,
  entryId: string,
  executor: QueryExecutor = db,
): Promise<JournalEntry | undefined> {
  return buildFindJournalEntryByIdQuery(
    executor,
    scope,
    entryId,
  ).executeTakeFirst();
}

async function countJournalEntriesForObject(
  executor: QueryExecutor,
  scope: RequestScope,
  plantObjectId: string,
): Promise<number> {
  const row = await buildObjectJournalEntryCountQuery(
    executor,
    scope,
    plantObjectId,
  ).executeTakeFirst();

  return Number(row?.entryCount ?? 0);
}

async function requireSpaceInScope(
  executor: QueryExecutor,
  scope: RequestScope,
  spaceId: string,
) {
  const space = await buildSpaceByIdQuery(
    executor,
    scope,
    spaceId,
  ).executeTakeFirst();

  if (!space) {
    throw new Error("Space was not found in this garden.");
  }

  return space;
}

async function readMentionableObjectsInSpace(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    spaceId: string;
    plantObjectIds: readonly string[];
  },
): Promise<MentionedPlantObjectReadback[]> {
  const rows = await buildMentionableObjectsInSpaceQuery(
    executor,
    scope,
    input,
  ).execute();
  const rowById = new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        displayName: row.displayName,
      },
    ]),
  );

  return input.plantObjectIds.flatMap((id) => {
    const object = rowById.get(id);
    return object ? [object] : [];
  });
}

async function insertJournalEntryObjectMentions(
  executor: QueryExecutor,
  input: {
    ownerUserId: string;
    spaceId: string;
    journalEntryId: string;
    plantObjectIds: readonly string[];
  },
) {
  if (input.plantObjectIds.length === 0) return [];
  return buildInsertJournalEntryObjectMentionsQuery(executor, input).execute();
}

async function readMentionedObjectsForEntry(
  executor: QueryExecutor,
  scope: RequestScope,
  entryId: string,
): Promise<MentionedPlantObjectReadback[]> {
  const mentionedByEntryId = await getMentionedObjectsByEntryId(
    executor,
    scope,
    [entryId],
  );
  return mentionedByEntryId.get(entryId) ?? [];
}

async function getMentionedObjectsByEntryId(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: string[],
) {
  const mentionedByEntryId = new Map<string, MentionedPlantObjectReadback[]>();
  if (entryIds.length === 0) return mentionedByEntryId;

  const rows = await buildMentionedObjectsForEntriesQuery(
    executor,
    scope,
    entryIds,
  ).execute();

  for (const row of rows) {
    const list = mentionedByEntryId.get(row.journalEntryId) ?? [];
    list.push({
      id: row.plantObjectId,
      displayName: row.displayName,
    });
    mentionedByEntryId.set(row.journalEntryId, list);
  }

  return mentionedByEntryId;
}

function normalizeCreateFirstPlantEntryInput(
  input: CreateFirstPlantEntryInput,
) {
  const catalogItemId = normalizeOptionalText(
    input.catalogItemId,
    "Catalog item id",
    200,
  );
  const userAddedCatalogName = normalizeOptionalText(
    input.userAddedCatalogName,
    "Missing catalog name",
    MAX_NAME_LENGTH,
  );
  if (catalogItemId && userAddedCatalogName) {
    throw new Error("Choose either a catalog match or a missing catalog name.");
  }

  const spaceId = normalizeOptionalText(input.spaceId, "Space id", 200);
  const spaceName = normalizeOptionalText(
    input.spaceName,
    "Space name",
    MAX_NAME_LENGTH,
  );
  if (!spaceId && !spaceName) {
    throw new Error("Choose an existing space or name a new space.");
  }

  const content = resolveJournalContentForWrite({
    contentDocument: input.contentDocument,
    requireStructured: true,
  });
  const orderedMediaAssetIds = content.mediaAssetIds;

  const cover = normalizeJournalCoverClaimInput(input.cover);
  return {
    spaceId,
    spaceName: spaceName ?? "",
    plantName: normalizeRequiredText(
      input.plantName,
      "Plant name",
      MAX_NAME_LENGTH,
    ),
    objectKind: normalizePlantObjectKind(input.objectKind),
    catalogItemId,
    userAddedCatalogName,
    varietyText: null,
    varietyState: (catalogItemId
      ? "selected"
      : userAddedCatalogName
        ? "user_added"
        : "unknown") satisfies VarietyState,
    title: normalizeJournalEntryTitle(input.title),
    body: content.body,
    contentDocument: content.document,
    contentSchemaVersion: content.contentSchemaVersion,
    orderedMediaAssetIds,
    entryDate: normalizeEntryDate(input.entryDate),
    ...normalizeLocationSelection({
      locationVisibility: input.locationVisibility,
      coarseRegionCode: input.coarseRegionCode,
    }),
    clientMutationId: normalizeRequiredText(
      input.clientMutationId,
      "Client mutation id",
      200,
    ),
    cover,
    mentionSelections: input.mentionSelections ?? [],
    topicTags: input.topicTags ?? [],
    internalDeterministicIds: input.internalDeterministicIds ?? null,
    atomicPublication: normalizeAtomicCreatePublication(
      input.atomicPublication,
      orderedMediaAssetIds,
      cover,
    ),
  };
}

function normalizeCreatePlantObjectJournalEntryInput(
  input: CreatePlantObjectJournalEntryInput,
) {
  const content = resolveJournalContentForWrite({
    contentDocument: input.contentDocument,
    requireStructured: true,
  });
  const orderedMediaAssetIds = content.mediaAssetIds;

  const cover = normalizeJournalCoverClaimInput(input.cover);
  return {
    plantObjectId: normalizeRequiredText(
      input.plantObjectId,
      "Plant object id",
      200,
    ),
    title: normalizeJournalEntryTitle(input.title),
    body: content.body,
    contentDocument: content.document,
    contentSchemaVersion: content.contentSchemaVersion,
    orderedMediaAssetIds,
    entryDate: normalizeEntryDate(input.entryDate),
    clientMutationId: normalizeRequiredText(
      input.clientMutationId,
      "Client mutation id",
      200,
    ),
    cover,
    mentionSelections: input.mentionSelections ?? [],
    topicTags: input.topicTags ?? [],
    internalDeterministicIds: input.internalDeterministicIds ?? null,
    atomicPublication: normalizeAtomicCreatePublication(
      input.atomicPublication,
      orderedMediaAssetIds,
      cover,
    ),
  };
}

function normalizeCreateSpaceJournalEntryInput(
  input: CreateSpaceJournalEntryInput,
) {
  const spaceId = normalizeRequiredText(input.spaceId, "Space id", 200);
  const mentionedPlantObjectIds = Array.from(
    new Set(
      input.mentionedPlantObjectIds.map((id) =>
        normalizeRequiredText(id, "Mentioned object id", 200),
      ),
    ),
  );

  if (mentionedPlantObjectIds.length === 0) {
    throw new Error("Choose at least one object from this space.");
  }

  const content = resolveJournalContentForWrite({
    contentDocument: input.contentDocument,
    requireStructured: true,
  });
  const orderedMediaAssetIds = content.mediaAssetIds;

  const cover = normalizeJournalCoverClaimInput(input.cover);
  return {
    spaceId,
    mentionedPlantObjectIds,
    title: normalizeJournalEntryTitle(input.title),
    body: content.body,
    contentDocument: content.document,
    contentSchemaVersion: content.contentSchemaVersion,
    orderedMediaAssetIds,
    entryDate: normalizeEntryDate(input.entryDate),
    clientMutationId: normalizeRequiredText(
      input.clientMutationId,
      "Client mutation id",
      200,
    ),
    cover,
    topicTags: input.topicTags ?? [],
    internalDeterministicIds: input.internalDeterministicIds ?? null,
    atomicPublication: normalizeAtomicCreatePublication(
      input.atomicPublication,
      orderedMediaAssetIds,
      cover,
    ),
  };
}

function normalizeAtomicCreatePublication(
  input: AtomicCreatePublicationInput,
  orderedInlineMediaAssetIds: readonly string[],
  cover: JournalCoverClaimInput,
): AtomicCreatePublicationInput {
  if (
    !UUID_PATTERN.test(input.publishId) ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.requestDigest)
  ) {
    throw new Error("atomic_publication_invalid");
  }
  const coverMediaAssetId =
    cover.mode === "explicit_inline" ||
    cover.mode === "separate" ||
    cover.mode === "keep_as_cover"
      ? cover.mediaAssetId
      : null;
  if (coverMediaAssetId !== input.coverMediaAssetId) {
    throw new Error("atomic_cover_mismatch");
  }
  const expected = new Set(orderedInlineMediaAssetIds);
  if (coverMediaAssetId) expected.add(coverMediaAssetId);
  if (expected.size === 0) {
    if (input.handoff !== null) throw new Error("atomic_media_set_mismatch");
  } else {
    if (
      !input.handoff ||
      !UUID_PATTERN.test(input.handoff.stagingSessionId) ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.handoff.receiptSetDigest) ||
      input.handoff.publicMedia.length !== expected.size ||
      input.handoff.publicMedia.some(
        (media) => !expected.has(media.mediaAssetId),
      )
    ) {
      throw new Error("atomic_media_set_mismatch");
    }
  }
  return input;
}

function normalizeJournalCoverClaimInput(
  cover: JournalCoverClaimInput | null | undefined,
): JournalCoverClaimInput {
  if (!cover) return { mode: "automatic" };
  switch (cover.mode) {
    case "automatic":
    case "none":
      return { mode: cover.mode };
    case "explicit_inline":
    case "separate":
    case "keep_as_cover": {
      const mediaAssetId = normalizeRequiredText(
        cover.mediaAssetId,
        "Cover media asset id",
        200,
      );
      return { mode: cover.mode, mediaAssetId };
    }
    default: {
      const _exhaustive: never = cover;
      return _exhaustive;
    }
  }
}

function normalizeUpdatePlantObjectLocationInput(
  input: UpdatePlantObjectLocationInput,
) {
  return {
    plantObjectId: normalizeRequiredText(
      input.plantObjectId,
      "Plant object id",
      200,
    ),
    ...normalizeLocationSelection({
      locationVisibility: input.locationVisibility,
      coarseRegionCode: input.coarseRegionCode,
    }),
    now: new Date(),
  };
}

function normalizeLocationSelection(input: {
  locationVisibility?: string | null;
  coarseRegionCode?: string | null;
}) {
  const locationVisibility = normalizeLocationVisibility(
    input.locationVisibility,
  );
  const coarseRegionCode = normalizeCoarseRegionCode(input.coarseRegionCode);

  if (locationVisibility === "region" && !coarseRegionCode) {
    throw new Error("Choose a supported coarse region or hide location.");
  }

  return {
    locationVisibility,
    coarseRegionCode: locationVisibility === "region" ? coarseRegionCode : null,
  };
}

function normalizeLocationVisibility(
  value: string | null | undefined,
): LocationVisibility {
  const normalized = value?.trim() ?? "";
  if (!normalized) return DEFAULT_LOCATION_VISIBILITY;
  if (normalized === "region" || normalized === "hidden") return normalized;
  throw new Error("Location visibility must be region or hidden.");
}

function resolvePlantObjectKind(
  requestedObjectKind: PlantObjectKind | string,
  catalogKind: string | null | undefined,
  source: string | null | undefined,
): PlantObjectKind {
  return resolveObjectKindForCatalogSelection(
    requestedObjectKind,
    catalogKind,
    source,
  );
}

function normalizeResolvePlantObjectCatalogInput(
  input: ResolvePlantObjectCatalogInput,
) {
  return {
    plantObjectId: normalizeRequiredText(
      input.plantObjectId,
      "Plant object id",
      200,
    ),
    catalogItemId: normalizeRequiredText(
      input.catalogItemId,
      "Catalog item id",
      200,
    ),
  };
}

/**
 * Entry titles are publishable and indexable, so the precise-location
 * firewall (OVE-234) runs before the value can reach any insert or update.
 */
function normalizeJournalEntryTitle(value: string) {
  const title = normalizeRequiredText(value, "Entry title", MAX_TITLE_LENGTH);
  assertNoPreciseLocationText(title, "journal_title");
  return title;
}

function normalizeRequiredText(
  value: string,
  label: string,
  maxLength: number,
) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less.`);
  }
  return normalized;
}

function normalizeOptionalText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less.`);
  }
  return normalized;
}

function normalizeEntryDate(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Entry date must use YYYY-MM-DD format.");
  }
  return normalized;
}

function normalizeCount(value: number | string | bigint | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

/**
 * OVE-227: the slug rule is owned by `@/lib/garden/public-journal-slug` so the
 * write path and the public search parity gate cannot drift apart.
 */
function normalizePublicSlug(value: string) {
  return normalizePublicJournalSlug(value);
}

function isResolvableVarietyState(
  value: string,
): value is "unknown" | "user_added" {
  return value === "unknown" || value === "user_added";
}

function isGonePublicEntry(row: {
  publicSlug: string | null;
  publicGoneAt: Date | string | null;
  lifecycleState: EntryLifecycleState | string;
  publicNoindex: boolean;
}): row is {
  publicSlug: string;
  publicGoneAt: Date | string;
  lifecycleState: "archived";
  publicNoindex: boolean;
} {
  return (
    row.publicSlug !== null &&
    row.publicGoneAt !== null &&
    row.lifecycleState === "archived"
  );
}

async function getProcessedMediaByEntryId(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: string[],
) {
  const mediaByEntryId = new Map<string, EntryMediaReadback>();
  if (entryIds.length === 0) return mediaByEntryId;

  const mediaRows = await buildProcessedMediaForEntriesQuery(
    executor,
    scope,
    entryIds,
  ).execute();

  for (const media of mediaRows) {
    if (!media.journalEntryId || !media.derivativeKey) continue;
    if (mediaByEntryId.has(media.journalEntryId)) continue;
    mediaByEntryId.set(media.journalEntryId, {
      id: media.id,
      derivativeKey: media.derivativeKey,
      publicUrl: getPublicDerivativeUrl(media.derivativeKey),
      focalX: Number(media.focalX ?? 0.5),
      focalY: Number(media.focalY ?? 0.5),
      intrinsicWidth: media.intrinsicWidth ?? null,
      intrinsicHeight: media.intrinsicHeight ?? null,
    });
  }

  return mediaByEntryId;
}

async function readProcessedObjectMediaGallery(
  executor: QueryExecutor,
  scope: RequestScope,
  entryIds: string[],
): Promise<EntryMediaReadback[]> {
  if (entryIds.length === 0) return [];
  const rows = await buildProcessedObjectMediaGalleryQuery(
    executor,
    scope,
    entryIds,
  ).execute();

  return rows.map((row) => ({
    id: row.id,
    derivativeKey: row.derivativeKey,
    publicUrl: getPublicDerivativeUrl(row.derivativeKey),
    focalX: Number(row.focalX ?? 0.5),
    focalY: Number(row.focalY ?? 0.5),
    intrinsicWidth: row.intrinsicWidth ?? null,
    intrinsicHeight: row.intrinsicHeight ?? null,
  }));
}

function normalizeObjectGalleryLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_OBJECT_GALLERY_MEDIA;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_OBJECT_GALLERY_MEDIA);
}

function journalDocumentAsJson(document: unknown): Json {
  return JSON.parse(JSON.stringify(document)) as Json;
}

function inferCoverSourceFromEntryState(input: {
  document: JournalDocumentV1;
  explicitCoverMediaAssetId: string | null;
}): JournalCoverSource {
  if (input.explicitCoverMediaAssetId) {
    return "explicit_inline";
  }
  if (listJournalDocumentImageMediaIds(input.document).length > 0) {
    return "automatic_inline";
  }
  return "none";
}
