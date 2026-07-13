import { createHash } from "node:crypto";

import {
  buildAuthIntentResumeHref,
  normalizeAuthIntentDraft,
  type AuthIntentAction,
  type AuthIntentTarget,
} from "@/lib/auth/auth-intent-contract";

export const VISUAL_FIXTURE_MANIFEST_VERSION = "ove187-v7";
export const VISUAL_FIXTURE_NAMESPACE =
  `visual-fixtures/${VISUAL_FIXTURE_MANIFEST_VERSION}` as const;

export type VisualFixtureLocale = "uk" | "bg" | "ru";
export type VisualFixtureObjectKind = "plant" | "animal" | "bee_colony";
export type VisualFixtureCatalogKind = "plant_variety" | "species" | "breed";
export type VisualFixtureCatalogStatus =
  | "seeded"
  | "confirmed"
  | "provisional"
  | "merged"
  | "rejected";
export type VisualFixtureCatalogLocale = VisualFixtureLocale | "en" | "la";
export type VisualFixtureVarietyState =
  | "selected"
  | "unknown"
  | "user_added"
  | "free_text";
export type VisualFixtureVisibility = "private" | "public";
export type VisualFixtureLifecycleState = "active" | "archived";
export type VisualFixtureMediaAspect =
  | "square"
  | "landscape_4_3"
  | "portrait_3_4"
  | "wide_16_9";
export type VisualFixtureScenarioKind =
  | "fixture-index"
  | "public-feed-empty"
  | "public-feed-typical"
  | "public-feed-dense"
  | "public-feed-loading"
  | "public-feed-error"
  | "public-feed-pagination"
  | "public-feed-exhausted"
  | "public-feed-context-empty"
  | "public-catalog-empty"
  | "public-catalog-zero-results"
  | "public-catalog-sparse"
  | "public-catalog-page-size-minus-one"
  | "public-catalog-page-size"
  | "public-catalog-page-size-plus-one"
  | "public-catalog-pagination"
  | "public-catalog-combined-filters"
  | "public-catalog-search-alias"
  | "public-catalog-unavailable"
  | "public-catalog-loading"
  | "public-catalog-error"
  | "public-catalog-variety"
  | "public-catalog-species"
  | "public-catalog-breed"
  | "public-journal-directory-default"
  | "public-journal-directory-page-size-minus-one"
  | "public-journal-directory-page-size"
  | "public-journal-directory-page-size-plus-one"
  | "public-journal-directory-pagination"
  | "public-journal-directory-combined-filters"
  | "public-journal-directory-zero-results"
  | "public-journal-directory-corrected-query"
  | "public-journal-directory-loading"
  | "public-journal-directory-error"
  | "public-journal-directory-exhausted"
  | "public-knowledge-hub-default"
  | "public-knowledge-hub-filtered"
  | "public-knowledge-hub-zero-results"
  | "public-knowledge-hub-loading"
  | "public-knowledge-hub-error"
  | "public-knowledge-guide-dense"
  | "public-knowledge-guide-empty"
  | "public-knowledge-answer-long"
  | "public-knowledge-answer-unavailable"
  | "public-knowledge-topic-zero"
  | "public-knowledge-topic-one"
  | "public-knowledge-topic-dense"
  | "public-journal-active"
  | "public-journal-gone"
  | "public-journal-missing"
  | "public-object-empty"
  | "public-object-typical"
  | "public-object-dense"
  | "public-object-long-name"
  | "public-object-animal"
  | "public-object-bee-colony"
  | "public-object-provisional"
  | "public-object-unknown"
  | "public-object-mixed-history"
  | "public-object-gone"
  | "public-object-missing"
  | "owner-object-empty"
  | "owner-object-dense"
  | "owner-object-animal"
  | "owner-object-archived"
  | "public-profile-empty"
  | "public-profile-typical"
  | "public-profile-dense"
  | "public-profile-long"
  | "public-profile-private"
  | "public-profile-removed"
  | "public-profile-blocked"
  | "owner-profile-preview"
  | "owner-workspace-guest"
  | "owner-workspace-empty"
  | "owner-workspace-sparse"
  | "owner-workspace-typical"
  | "owner-workspace-dense"
  | "owner-workspace-offline"
  | "owner-workspace-loading"
  | "owner-workspace-partial-error"
  | "owner-workspace-error"
  | "social-comments"
  | "social-followed-feed"
  | "social-notifications"
  | "social-bookmarks"
  | "social-wishlist"
  | "media-gallery";
export type VisualFixtureStateKind =
  | "empty-space"
  | "empty-object"
  | "today-journal"
  | "owner-only-journal"
  | "archived-journal"
  | "maximum-copy"
  | "no-media-journal"
  | "one-media-journal"
  | "media-gallery"
  | "feed-empty"
  | "feed-typical"
  | "feed-dense"
  | "feed-loading"
  | "feed-error"
  | "feed-pagination"
  | "feed-exhausted"
  | "feed-context-empty";

export interface VisualFixtureActor {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  locale: VisualFixtureLocale;
  role: "gardener" | "apartment_keeper" | "animal_keeper" | "beekeeper";
  createdAt: string;
}

export interface VisualFixtureProfile {
  userId: string;
  handle: string;
  displayName: string | null;
  avatarMediaAssetId: string | null;
  bio: string | null;
  languages: readonly ("uk" | "bg" | "ru" | "en")[];
  locationVisibility: "hidden" | "region";
  coarseRegionCode: string | null;
  profileVisibility: "public" | "private";
  profileLifecycleState: "active" | "removed";
  relationshipVisibility: "counts" | "hidden";
  removedAt: string | null;
  createdAt: string;
}

export interface VisualFixtureProfileFollow {
  id: string;
  followerUserId: string;
  targetUserId: string;
  state: "active" | "removed";
  createdAt: string;
}

export interface VisualFixtureProfileBlock {
  id: string;
  blockerUserId: string;
  blockedUserId: string;
  state: "active" | "removed";
  createdAt: string;
}

export interface VisualFixtureProfileReport {
  id: string;
  reporterUserId: string;
  targetUserId: string;
  reason: "spam" | "harassment" | "privacy" | "impersonation" | "other";
  state: "submitted" | "reviewed" | "dismissed" | "actioned";
  createdAt: string;
}

export interface VisualFixtureSpace {
  id: string;
  ownerUserId: string;
  displayName: string;
  locationVisibility: "hidden" | "region";
  coarseRegionCode: string | null;
  createdAt: string;
}

export interface VisualFixtureObject {
  id: string;
  ownerUserId: string;
  spaceId: string;
  displayName: string;
  objectKind: VisualFixtureObjectKind;
  catalogItemId: string | null;
  varietyText: string | null;
  varietyState: VisualFixtureVarietyState;
  locationVisibility: "hidden" | "region";
  coarseRegionCode: string | null;
  createdAt: string;
}

export interface VisualFixtureCatalogItem {
  id: string;
  canonicalName: string;
  normalizedName: string;
  publicSlug: string;
  catalogKind: VisualFixtureCatalogKind;
  status: VisualFixtureCatalogStatus;
  source: "visual_fixture";
  sourceId: string;
  locale: VisualFixtureCatalogLocale;
  createdAt: string;
}

export interface VisualFixtureCatalogName {
  id: string;
  catalogItemId: string;
  displayName: string;
  normalizedName: string;
  locale: VisualFixtureCatalogLocale;
  isPrimary: boolean;
  createdAt: string;
}

export interface VisualFixtureEntry {
  id: string;
  ownerUserId: string;
  spaceId: string;
  entryScope: "object" | "space";
  objectId: string | null;
  locale: VisualFixtureLocale;
  title: string;
  body: string;
  entryDate: string;
  visibility: VisualFixtureVisibility;
  lifecycleState: VisualFixtureLifecycleState;
  publicSlug: string | null;
  publicNoindex: true;
  publishedAt: string | null;
  archivedAt: string | null;
  publicGoneAt: string | null;
  firstPublicationDisclosureVersion: string | null;
  firstPublicationDisclosedAt: string | null;
  clientMutationId: string;
  createdAt: string;
}

export interface VisualFixtureMedia {
  id: string;
  ownerUserId: string;
  entryId: string;
  fileName: string;
  localPath: string;
  quarantineKey: string;
  derivativeKey: string;
  contentType: "image/png";
  aspect: VisualFixtureMediaAspect;
  width: number;
  height: number;
  sha256: string;
  altText: string;
  caption: string | null;
  createdAt: string;
}

export interface VisualFixtureObjectMention {
  ownerUserId: string;
  spaceId: string;
  journalEntryId: string;
  objectId: string;
  createdAt: string;
}

export interface VisualFixtureTopic {
  id: string;
  slug: string;
  label: string;
  trustState: "curated";
  createdAt: string;
}

export interface VisualFixtureTopicSignal {
  journalEntryId: string;
  topicId: string;
  signalSource: "operator_curated";
  reviewState: "accepted";
  publicMembershipState: "eligible";
  createdAt: string;
}

export interface VisualFixtureFeedCursorAnchor {
  id: string;
  publishedAt: string;
}

export interface VisualFixtureFeedEvidence {
  pageSize: 8;
  typicalTopicSlug: string;
  denseTopicSlug: string;
  emptyTopicSlug: string;
  galleryEntryId: string;
  pageTwoCursor: VisualFixtureFeedCursorAnchor;
  exhaustedCursor: VisualFixtureFeedCursorAnchor;
}

export interface VisualFixtureJournalDirectoryQueryEvidence {
  id: string;
  label: string;
  path: string;
  expectedCount: number;
  expectedOrderedEntryIds: readonly string[];
  expectedOrderedPublicSlugs: readonly string[];
}

export interface VisualFixtureJournalDirectoryEvidence {
  pageSize: 8;
  authoredLocales: readonly VisualFixtureLocale[];
  safeRegionCodes: readonly string[];
  hiddenRegionEntryCount: number;
  queries: readonly VisualFixtureJournalDirectoryQueryEvidence[];
}

export interface VisualFixtureKnowledgeEvidenceRule {
  topicSlugs: readonly string[];
  catalogSlugs: readonly string[];
  expectedCount: number;
  expectedEntryIds: readonly string[];
  expectedObjectIds: readonly string[];
}

export interface VisualFixtureKnowledgeEditorial {
  author: "OverGarden visual fixture";
  source: "Synthetic OVE-177 visual fixture. Not expert guidance.";
  updatedDate: string;
  synthetic: true;
}

export interface VisualFixtureKnowledgeGuideTranslation {
  title: string;
  description: string;
  outcome: string;
  steps: readonly { title: string; body: string }[];
}

export interface VisualFixtureKnowledgeAnswerTranslation {
  question: string;
  title: string;
  description: string;
  conciseAnswer: string;
  proofDetails: readonly string[];
  faqs: readonly { question: string; answer: string }[];
}

interface VisualFixtureKnowledgeContentBase {
  slug: string;
  path: string;
  objectKinds: readonly VisualFixtureObjectKind[];
  editorial: VisualFixtureKnowledgeEditorial;
  evidence: VisualFixtureKnowledgeEvidenceRule;
  mediaId: string | null;
}

export interface VisualFixtureKnowledgeGuide extends VisualFixtureKnowledgeContentBase {
  kind: "guide";
  task: string;
  translations: Record<
    VisualFixtureLocale,
    VisualFixtureKnowledgeGuideTranslation
  >;
}

export interface VisualFixtureKnowledgeAnswer extends VisualFixtureKnowledgeContentBase {
  kind: "answer";
  task: string;
  translations: Record<
    VisualFixtureLocale,
    VisualFixtureKnowledgeAnswerTranslation
  >;
}

export interface VisualFixtureKnowledgeTopicEvidence {
  slug: string;
  state: "zero" | "one" | "typical" | "dense";
  objectKinds: readonly VisualFixtureObjectKind[];
  expectedEntryIds: readonly string[];
  expectedObjectIds: readonly string[];
}

export interface VisualFixtureKnowledgeEvidence {
  guides: readonly VisualFixtureKnowledgeGuide[];
  answers: readonly VisualFixtureKnowledgeAnswer[];
  topics: readonly VisualFixtureKnowledgeTopicEvidence[];
}

export type VisualFixturePassportAccess = "guest-public" | "signed-in-owner";
export type VisualFixturePassportIdentityState =
  | "confirmed"
  | "provisional"
  | "unknown";
export type VisualFixturePassportMediaState = "none" | "cover" | "gallery";
export type VisualFixturePassportTimelineState =
  | "empty"
  | "one"
  | "typical"
  | "dense";

export interface VisualFixturePassportScenarioEvidence {
  id: string;
  access: VisualFixturePassportAccess;
  objectId: string;
  ownerActorId: string;
  path: string;
  expectedStatus: 200 | 404 | 410;
  objectKind: VisualFixtureObjectKind;
  identityState: VisualFixturePassportIdentityState;
  mediaState: VisualFixturePassportMediaState;
  timelineState: VisualFixturePassportTimelineState;
  expectedTimelineCount: number;
  expectedTimelineEntryIds: readonly string[];
  expectedMediaAspects: readonly VisualFixtureMediaAspect[];
  viewportTargets: readonly ["desktop", "mobile-320"];
}

export interface VisualFixturePassportEvidence {
  timelinePreviewSize: 5;
  maxPublicTimeline: 40;
  scenarios: readonly VisualFixturePassportScenarioEvidence[];
}

export type VisualFixtureJournalEntryAccess =
  | "guest"
  | "authenticated-reader"
  | "owner";
export type VisualFixtureJournalEntryContentLength =
  | "short"
  | "normal"
  | "long";
export type VisualFixtureJournalEntryMediaState =
  | "none"
  | "square"
  | "portrait"
  | "landscape"
  | "mixed-gallery";

export interface VisualFixtureJournalEntryScenarioEvidence {
  id: string;
  access: VisualFixtureJournalEntryAccess;
  sessionActorId: string | null;
  ownerActorId: string | null;
  entryId: string | null;
  publicSlug: string;
  path: string;
  expectedStatus: 200 | 404 | 410;
  contextKind: "object" | "space";
  objectKind: VisualFixtureObjectKind | null;
  contentLength: VisualFixtureJournalEntryContentLength;
  mediaState: VisualFixtureJournalEntryMediaState;
  expectedMediaCount: number;
  expectedMentionCount: number;
  expectedNewer: boolean;
  expectedOlder: boolean;
  viewportTargets: readonly ["desktop", "mobile-320"];
}

export interface VisualFixtureJournalEntryEvidence {
  maxPublicMedia: 6;
  scenarios: readonly VisualFixtureJournalEntryScenarioEvidence[];
}

export type VisualFixtureProfileAccess =
  | "guest"
  | "authenticated-non-owner"
  | "owner";
export type VisualFixtureProfileContentState =
  | "empty"
  | "typical"
  | "dense"
  | "long";

export interface VisualFixtureProfileScenarioEvidence {
  id: string;
  access: VisualFixtureProfileAccess;
  sessionActorId: string | null;
  profileActorId: string | null;
  handle: string;
  path: string;
  expectedStatus: 200 | 404;
  contentState: VisualFixtureProfileContentState;
  expectedPublicObjectCount: number;
  expectedPublicEntryCount: number;
  expectedObjectIds: readonly string[];
  expectedJournalEntryIds: readonly string[];
  expectedFollowerCount: number | null;
  expectedFollowingCount: number | null;
  expectedAvatar: boolean;
  viewportTargets: readonly ["desktop", "mobile-320"];
}

export interface VisualFixtureProfileEvidence {
  objectPreviewSize: 6;
  objectLimit: 12;
  journalPreviewSize: 8;
  journalLimit: 16;
  scenarios: readonly VisualFixtureProfileScenarioEvidence[];
}

export type VisualFixtureWorkspaceState =
  | "guest"
  | "empty"
  | "sparse"
  | "typical"
  | "dense"
  | "offline"
  | "loading"
  | "partial-error"
  | "error";

export type VisualFixtureWorkspaceFaultSection =
  | "inventory"
  | "spaces"
  | "recent"
  | "inbox"
  | "media";

export interface VisualFixtureWorkspaceScenarioEvidence {
  id: string;
  state: VisualFixtureWorkspaceState;
  ownerActorId: string | null;
  path: string;
  expectedSpaceCount: number;
  expectedObjectCount: number;
  expectedPlantCount: number;
  expectedAnimalCount: number;
  expectedBeeColonyCount: number;
  expectedRecentCount: number;
  expectedSpaceIds: readonly string[];
  expectedObjectIds: readonly string[];
  expectedRecentEntryIds: readonly string[];
  online: boolean;
  draftCount: number;
  queuedCount: number;
  failedCount: number;
  mediaProcessingCount: number;
  mediaFailedCount: number;
  faultSections: readonly VisualFixtureWorkspaceFaultSection[];
  viewportTargets: readonly ["desktop", "mobile-320"];
}

export interface VisualFixtureWorkspaceEvidence {
  inventoryPreviewSize: 8;
  spacePreviewSize: 4;
  recentLimit: 8;
  scenarios: readonly VisualFixtureWorkspaceScenarioEvidence[];
}

export type VisualFixtureCreationFlow = "first-entry" | "follow-up";
export type VisualFixtureCreationState =
  | "minimum"
  | "optional"
  | "provisional"
  | "unknown-long"
  | "media"
  | "draft"
  | "publish"
  | "backdated"
  | "privacy"
  | "offline"
  | "error"
  | "cancel"
  | "duplicate";

export interface VisualFixtureCreationScenarioEvidence {
  id: string;
  flow: VisualFixtureCreationFlow;
  state: VisualFixtureCreationState;
  label: string;
  ownerActorId: string;
  objectId: string | null;
  spaceId: string | null;
  spaceName: string;
  objectKind: VisualFixtureObjectKind;
  objectName: string;
  entryTitle: string;
  entryBody: string;
  entryDate: string;
  catalogQuery: string | null;
  userAddedCatalogName: string | null;
  locationVisibility: "hidden" | "region";
  coarseRegionCode: string | null;
  topicTagInput: string;
  mediaFileName: string | null;
  online: boolean;
  submitState: "idle" | "queued" | "syncing" | "synced" | "failed";
  message: string;
  detailsOpen: boolean;
  path: string;
  startPath: string;
  payloadClass: string;
  clientMutationId: string;
  preconditionEntryIds: readonly string[];
  expectedSpaceId: string;
  expectedObjectId: string;
  expectedEntryId: string;
  expectedMediaAssetIds: readonly string[];
  expectedServerWrite: boolean;
  expectedEntryVisibility: "private" | "public";
  postSavePath: string | null;
  resetOwnedSpaceIds: readonly string[];
  resetOwnedObjectIds: readonly string[];
  resetOwnedEntryIds: readonly string[];
  resetOwnedMediaAssetIds: readonly string[];
  dexieDraftKey: string | null;
  expectedStatus: 200;
  viewportTargets: readonly ["desktop", "mobile-320"];
}

export interface VisualFixtureCreationEvidence {
  scenarios: readonly VisualFixtureCreationScenarioEvidence[];
}

export interface VisualFixtureScenario {
  id: string;
  kind: VisualFixtureScenarioKind;
  label: string;
  path: string;
  expectedStatus: 200 | 404 | 410;
  expectedUiState?: "not_found";
  viewportTargets: readonly ("desktop" | "mobile-320")[];
}

export type VisualFixtureIntentState =
  | "guest"
  | "already_authenticated"
  | "cancel"
  | "expired"
  | "invalid"
  | "deleted_410"
  | "now_private"
  | "insufficient_permission"
  | "draft_retained";

export interface VisualFixtureIntentScenario {
  id: string;
  action: AuthIntentAction;
  label: string;
  state: VisualFixtureIntentState;
  returnTo: string;
  target?: AuthIntentTarget;
  startPath: string;
  resumePath: string;
  tokenMode: "valid" | "expired" | "invalid";
  draftKind?: "first_entry" | "follow_up_entry";
  expectedStatus: 200 | 404 | 410;
  viewportTargets: readonly ("desktop" | "mobile-320")[];
}

export interface VisualFixtureIntentEvidence {
  scenarios: readonly VisualFixtureIntentScenario[];
}

export interface VisualFixtureLineagePendingIdentity {
  id: string;
  createdByUserId: string;
  displayLabel: string;
  createdAt: string;
}

export interface VisualFixtureLineageEdge {
  id: string;
  ownerUserId: string;
  subjectObjectId: string;
  sourcePendingIdentityId: string;
  clientMutationId: string;
  createdAt: string;
}

export interface VisualFixtureLineageEvidence {
  pendingIdentities: readonly VisualFixtureLineagePendingIdentity[];
  edges: readonly VisualFixtureLineageEdge[];
  claimPendingIdentityId: string;
  claimEdgeId: string;
}

export type VisualFixtureSocialTargetKind =
  | "journal_entry"
  | "lineage_object"
  | "variety"
  | "topic";

export interface VisualFixtureEngagementComment {
  id: string;
  targetKind: VisualFixtureSocialTargetKind;
  targetRef: string;
  authorUserId: string;
  parentCommentId: string | null;
  clientMutationId: string;
  body: string;
  state: "active" | "deleted" | "reported" | "removed";
  createdAt: string;
}

export interface VisualFixtureEngagementBookmark {
  id: string;
  ownerUserId: string;
  targetKind: VisualFixtureSocialTargetKind;
  targetRef: string;
  state: "active" | "removed";
  createdAt: string;
}

export interface VisualFixtureEngagementFollow {
  id: string;
  followerUserId: string;
  targetKind: "lineage_object" | "topic";
  targetRef: string;
  state: "active" | "removed";
  createdAt: string;
}

export interface VisualFixtureEngagementCommentReport {
  id: string;
  reporterUserId: string;
  commentId: string;
  reason: "spam" | "harassment" | "privacy" | "misinformation" | "other";
  state: "submitted" | "reviewed" | "dismissed" | "actioned";
  createdAt: string;
}

export interface VisualFixtureNotificationReceipt {
  id: string;
  ownerUserId: string;
  eventKey: string;
  state: "unread" | "read" | "dismissed";
  readAt: string | null;
  createdAt: string;
}

export interface VisualFixtureNotificationPreference {
  ownerUserId: string;
  comments: boolean;
  replies: boolean;
  follows: boolean;
  mentions: boolean;
  claims: boolean;
  system: boolean;
  createdAt: string;
}

export interface VisualFixtureWishlistItem {
  id: string;
  ownerUserId: string;
  catalogItemId: string;
  sourceSurface: "catalog_item" | "public_variety";
  createdAt: string;
}

export type VisualFixtureSocialSurface =
  | "journal"
  | "feed"
  | "notifications"
  | "bookmarks"
  | "wishlist";

export interface VisualFixtureSocialScenario {
  id: string;
  surface: VisualFixtureSocialSurface;
  state:
    | "zero"
    | "one"
    | "page"
    | "page-plus-one"
    | "nested-long-moderated"
    | "closed"
    | "blocked"
    | "dense"
    | "grouped"
    | "individual"
    | "empty";
  actorId: string | null;
  path: string;
  targetKind: VisualFixtureSocialTargetKind | null;
  targetRef: string | null;
  expectedVisibleIds: readonly string[];
  expectedHiddenIds: readonly string[];
  expectedItemCount: number;
  expectedHasNextPage: boolean;
  expectedStatus: 200 | 410;
  viewportTargets: readonly ("desktop" | "mobile-320")[];
}

export interface VisualFixtureSocialTransition {
  action:
    | "comment"
    | "reply"
    | "follow"
    | "bookmark"
    | "delete"
    | "report"
    | "block"
    | "notification_receipt";
  actorId: string;
  targetId: string;
  from: string;
  to: string;
  finality: "reversible" | "actor-final" | "moderator-final";
}

export interface VisualFixtureSocialEvidence {
  commentPageSize: 8;
  feedPageSize: 12;
  notificationPageSize: 12;
  bookmarkPageSize: 12;
  actorRoles: {
    ordinaryReaderActorId: string;
    reporterActorId: string;
    reportedActorId: string;
    blockedActorId: string;
    moderatorSafeActorId: string;
    emptyCollectionActorId: string;
    denseCollectionActorId: string;
  };
  comments: readonly VisualFixtureEngagementComment[];
  bookmarks: readonly VisualFixtureEngagementBookmark[];
  follows: readonly VisualFixtureEngagementFollow[];
  commentReports: readonly VisualFixtureEngagementCommentReport[];
  notificationReceipts: readonly VisualFixtureNotificationReceipt[];
  notificationPreferences: readonly VisualFixtureNotificationPreference[];
  wishlistItems: readonly VisualFixtureWishlistItem[];
  scenarios: readonly VisualFixtureSocialScenario[];
  transitions: readonly VisualFixtureSocialTransition[];
}

export interface VisualFixtureStateCoverage {
  id: string;
  kind: VisualFixtureStateKind;
  label: string;
  detail: string;
  count: number;
  access: "public" | "owner";
  path: string | null;
}

export interface VisualFixtureManifest {
  version: typeof VISUAL_FIXTURE_MANIFEST_VERSION;
  namespace: typeof VISUAL_FIXTURE_NAMESPACE;
  actors: readonly VisualFixtureActor[];
  profiles: readonly VisualFixtureProfile[];
  profileFollows: readonly VisualFixtureProfileFollow[];
  profileBlocks: readonly VisualFixtureProfileBlock[];
  profileReports: readonly VisualFixtureProfileReport[];
  spaces: readonly VisualFixtureSpace[];
  catalogItems: readonly VisualFixtureCatalogItem[];
  catalogNames: readonly VisualFixtureCatalogName[];
  objects: readonly VisualFixtureObject[];
  entries: readonly VisualFixtureEntry[];
  objectMentions: readonly VisualFixtureObjectMention[];
  media: readonly VisualFixtureMedia[];
  topics: readonly VisualFixtureTopic[];
  topicSignals: readonly VisualFixtureTopicSignal[];
  feedEvidence: VisualFixtureFeedEvidence;
  journalDirectoryEvidence: VisualFixtureJournalDirectoryEvidence;
  knowledgeEvidence: VisualFixtureKnowledgeEvidence;
  passportEvidence: VisualFixturePassportEvidence;
  journalEntryEvidence: VisualFixtureJournalEntryEvidence;
  profileEvidence: VisualFixtureProfileEvidence;
  workspaceEvidence: VisualFixtureWorkspaceEvidence;
  creationEvidence: VisualFixtureCreationEvidence;
  lineageEvidence: VisualFixtureLineageEvidence;
  intentEvidence: VisualFixtureIntentEvidence;
  socialEvidence: VisualFixtureSocialEvidence;
  stateCoverage: readonly VisualFixtureStateCoverage[];
  scenarios: readonly VisualFixtureScenario[];
}

const CREATED_AT_BASE = "2026-01-05T09:00:00.000Z";
const CATALOG_IDS = {
  tomatoVariety: fixtureUuid(9, 1),
  cucumberVariety: fixtureUuid(9, 2),
  bgTomatoVariety: fixtureUuid(9, 3),
  rosemarySpecies: fixtureUuid(9, 4),
  monsteraSpecies: fixtureUuid(9, 5),
  calatheaSpecies: fixtureUuid(9, 6),
  lemonSpecies: fixtureUuid(9, 7),
  lavenderSpecies: fixtureUuid(9, 8),
  sunflowerSpecies: fixtureUuid(9, 9),
  strawberrySpecies: fixtureUuid(9, 10),
  localGoatBreed: fixtureUuid(9, 11),
  bulgarianGoatBreed: fixtureUuid(9, 12),
  rhodeIslandBreed: fixtureUuid(9, 13),
  longBantamBreed: fixtureUuid(9, 14),
  domesticShorthairBreed: fixtureUuid(9, 15),
  mixedDogBreed: fixtureUuid(9, 16),
  carpathianBeeBreed: fixtureUuid(9, 17),
  honeyBeeSpecies: fixtureUuid(9, 18),
  unavailableRabbitSpecies: fixtureUuid(9, 19),
} as const;

interface CatalogSeedSpec {
  id: string;
  canonicalName: string;
  publicSlug: string;
  catalogKind: VisualFixtureCatalogKind;
  locale: VisualFixtureCatalogLocale;
  status?: VisualFixtureCatalogStatus;
}

const catalogSeedSpecs: readonly CatalogSeedSpec[] = [
  catalogSeed(
    CATALOG_IDS.tomatoVariety,
    "Помідор чері",
    "visual-pomidor-cheri",
    "plant_variety",
    "uk",
  ),
  catalogSeed(
    CATALOG_IDS.cucumberVariety,
    "Огірок Ніжинський",
    "visual-nizhyn-cucumber",
    "plant_variety",
    "uk",
  ),
  catalogSeed(
    CATALOG_IDS.bgTomatoVariety,
    "Домат чери",
    "visual-domat-cheri",
    "plant_variety",
    "bg",
  ),
  catalogSeed(
    CATALOG_IDS.rosemarySpecies,
    "Rosmarinus officinalis",
    "visual-rosmarinus-officinalis",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.monsteraSpecies,
    "Monstera deliciosa",
    "visual-monstera-deliciosa",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.calatheaSpecies,
    "Goeppertia orbifolia",
    "visual-goeppertia-orbifolia",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.lemonSpecies,
    "Citrus limon",
    "visual-citrus-limon",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.lavenderSpecies,
    "Lavandula angustifolia",
    "visual-lavandula-angustifolia",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.sunflowerSpecies,
    "Helianthus annuus",
    "visual-helianthus-annuus",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.strawberrySpecies,
    "Fragaria x ananassa",
    "visual-fragaria-ananassa",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.localGoatBreed,
    "Українська місцева коза",
    "visual-ukrainian-local-goat",
    "breed",
    "uk",
  ),
  catalogSeed(
    CATALOG_IDS.bulgarianGoatBreed,
    "Българска бяла млечна коза",
    "visual-bulgarian-white-dairy-goat",
    "breed",
    "bg",
  ),
  catalogSeed(
    CATALOG_IDS.rhodeIslandBreed,
    "Rhode Island Red",
    "visual-rhode-island-red",
    "breed",
    "en",
  ),
  catalogSeed(
    CATALOG_IDS.longBantamBreed,
    "Бельгійська бородата бентамка д'Уккле, порцелянова кольорова лінія",
    "visual-belgian-bearded-bantam-porcelain-line",
    "breed",
    "uk",
  ),
  catalogSeed(
    CATALOG_IDS.domesticShorthairBreed,
    "Domestic Shorthair",
    "visual-domestic-shorthair",
    "breed",
    "en",
  ),
  catalogSeed(
    CATALOG_IDS.mixedDogBreed,
    "Mixed-breed dog",
    "visual-mixed-breed-dog",
    "breed",
    "en",
  ),
  catalogSeed(
    CATALOG_IDS.carpathianBeeBreed,
    "Карпатська бджола",
    "visual-karpatska-bdzhola",
    "breed",
    "uk",
  ),
  catalogSeed(
    CATALOG_IDS.honeyBeeSpecies,
    "Apis mellifera",
    "visual-apis-mellifera",
    "species",
    "la",
  ),
  catalogSeed(
    CATALOG_IDS.unavailableRabbitSpecies,
    "Oryctolagus cuniculus",
    "visual-oryctolagus-cuniculus-unavailable",
    "species",
    "la",
    "rejected",
  ),
];

const catalogItems: readonly VisualFixtureCatalogItem[] = catalogSeedSpecs.map(
  (spec, offset) => ({
    ...spec,
    normalizedName: normalizeCatalogName(spec.canonicalName),
    status: spec.status ?? "seeded",
    source: "visual_fixture",
    sourceId: `ove175-visual-${String(offset + 1).padStart(2, "0")}`,
    createdAt: timestampForIndex(500 + offset),
  }),
);

const catalogAliasSpecs: readonly Omit<
  VisualFixtureCatalogName,
  "id" | "normalizedName" | "isPrimary" | "createdAt"
>[] = [
  {
    catalogItemId: CATALOG_IDS.tomatoVariety,
    displayName: "Cherry tomato",
    locale: "en",
  },
  {
    catalogItemId: CATALOG_IDS.cucumberVariety,
    displayName: "Ніжинський огірок",
    locale: "uk",
  },
  {
    catalogItemId: CATALOG_IDS.bgTomatoVariety,
    displayName: "Чери домат",
    locale: "bg",
  },
  {
    catalogItemId: CATALOG_IDS.rosemarySpecies,
    displayName: "Розмарин лікарський",
    locale: "uk",
  },
  {
    catalogItemId: CATALOG_IDS.monsteraSpecies,
    displayName: "Монстера делициоза",
    locale: "bg",
  },
  {
    catalogItemId: CATALOG_IDS.calatheaSpecies,
    displayName: "Калатея орбіфолія",
    locale: "uk",
  },
  {
    catalogItemId: CATALOG_IDS.lavenderSpecies,
    displayName: "Теснолистна лавандула",
    locale: "bg",
  },
  {
    catalogItemId: CATALOG_IDS.carpathianBeeBreed,
    displayName: "Карпатская пчела",
    locale: "ru",
  },
  {
    catalogItemId: CATALOG_IDS.honeyBeeSpecies,
    displayName: "Медоносная пчела",
    locale: "ru",
  },
  {
    catalogItemId: CATALOG_IDS.unavailableRabbitSpecies,
    displayName: "Європейський кріль",
    locale: "uk",
  },
];

const catalogNames: readonly VisualFixtureCatalogName[] = [
  ...catalogItems.map((item, offset) => ({
    id: fixtureUuid(9, 101 + offset),
    catalogItemId: item.id,
    displayName: item.canonicalName,
    normalizedName: item.normalizedName,
    locale: item.locale,
    isPrimary: true,
    createdAt: timestampForIndex(550 + offset),
  })),
  ...catalogAliasSpecs.map((alias, offset) => ({
    ...alias,
    id: fixtureUuid(9, 201 + offset),
    normalizedName: normalizeCatalogName(alias.displayName),
    isPrimary: false,
    createdAt: timestampForIndex(600 + offset),
  })),
];

const actors: readonly VisualFixtureActor[] = [
  {
    id: fixtureUuid(1, 1),
    handle: "demo_olena",
    displayName: "Олена, теплична практикиня",
    email: "olena@visual-fixtures.invalid",
    locale: "uk",
    role: "gardener",
    createdAt: CREATED_AT_BASE,
  },
  {
    id: fixtureUuid(1, 2),
    handle: "demo_mariya",
    displayName: "Мария, градски растения",
    email: "mariya@visual-fixtures.invalid",
    locale: "bg",
    role: "apartment_keeper",
    createdAt: CREATED_AT_BASE,
  },
  {
    id: fixtureUuid(1, 3),
    handle: "demo_danylo",
    displayName: "Данило, догляд за тваринами",
    email: "danylo@visual-fixtures.invalid",
    locale: "uk",
    role: "animal_keeper",
    createdAt: CREATED_AT_BASE,
  },
  {
    id: fixtureUuid(1, 4),
    handle: "demo_nikolay",
    displayName: "Николай, пасека и наблюдения",
    email: "nikolay@visual-fixtures.invalid",
    locale: "ru",
    role: "beekeeper",
    createdAt: CREATED_AT_BASE,
  },
  {
    id: fixtureUuid(1, 5),
    handle: "demo_new_keeper",
    displayName: "Новий доглядач",
    email: "new-keeper@visual-fixtures.invalid",
    locale: "uk",
    role: "gardener",
    createdAt: CREATED_AT_BASE,
  },
  {
    id: fixtureUuid(1, 6),
    handle: "demo_private",
    displayName: "Приватний тестовий профіль",
    email: "private-profile@visual-fixtures.invalid",
    locale: "uk",
    role: "apartment_keeper",
    createdAt: CREATED_AT_BASE,
  },
  {
    id: fixtureUuid(1, 7),
    handle: "demo_removed",
    displayName: "Видалений тестовий профіль",
    email: "removed-profile@visual-fixtures.invalid",
    locale: "bg",
    role: "animal_keeper",
    createdAt: CREATED_AT_BASE,
  },
  {
    id: fixtureUuid(1, 8),
    handle: "visual_profile_with_long_namex",
    displayName: "Профіль із максимально довгими полями",
    email: "long-profile@visual-fixtures.invalid",
    locale: "ru",
    role: "beekeeper",
    createdAt: CREATED_AT_BASE,
  },
];

const profiles: readonly VisualFixtureProfile[] = [
  createProfile(actors[0], {
    avatarMediaAssetId: fixtureUuid(5, 1),
    bio: "Веду датований журнал теплиці, сезонних грядок і домашнього насіння. Публікую не лише успіхи, а й помилки, щоб наступний сезон спирався на перевірені спостереження.",
    languages: ["uk", "en"],
    locationVisibility: "region",
    coarseRegionCode: "UA-30",
  }),
  createProfile(actors[1], {
    avatarMediaAssetId: fixtureUuid(5, 6),
    bio: "Градски растения, малък балкон и наблюдения без идеализирани резултати.",
    languages: ["bg", "en"],
  }),
  createProfile(actors[2], {
    avatarMediaAssetId: fixtureUuid(5, 3),
    bio: "Щоденник відновлення, годівлі та спокійних змін у поведінці тварин.",
    languages: ["uk"],
  }),
  createProfile(actors[3], {
    avatarMediaAssetId: fixtureUuid(5, 4),
    bio: "Наблюдения за семьями, рамками и сезонными изменениями без раскрытия точного места пасеки.",
    languages: ["ru", "bg"],
    locationVisibility: "region",
    coarseRegionCode: "BG-23",
  }),
  createProfile(actors[4], {
    displayName: null,
    relationshipVisibility: "hidden",
  }),
  createProfile(actors[5], {
    bio: "Цей synthetic профіль доводить однаковий 404 без пояснення причини.",
    profileVisibility: "private",
  }),
  createProfile(actors[6], {
    bio: "Цей synthetic профіль не повинен рендеритися після lifecycle removal.",
    profileLifecycleState: "removed",
    removedAt: timestampForIndex(707),
  }),
  createProfile(actors[7], {
    displayName:
      "Дуже довге ім’я тестового доглядача для перевірки перенесення в усіх контейнерах".slice(
        0,
        80,
      ),
    bio: "Довгий синтетичний опис перевіряє перенесення рядків, висоту профілю, mobile layout і відсутність перекриття сусідніх блоків. "
      .repeat(8)
      .slice(0, 600),
    languages: ["uk", "bg", "ru", "en"],
    locationVisibility: "region",
    coarseRegionCode: "UA-32",
    relationshipVisibility: "hidden",
  }),
];

const profileFollows: readonly VisualFixtureProfileFollow[] = [
  createProfileFollow(1, actors[1], actors[0], "active"),
  createProfileFollow(2, actors[2], actors[0], "active"),
  createProfileFollow(3, actors[3], actors[0], "active"),
  createProfileFollow(4, actors[4], actors[0], "active"),
  createProfileFollow(5, actors[5], actors[0], "active"),
  createProfileFollow(6, actors[0], actors[1], "active"),
  createProfileFollow(7, actors[0], actors[2], "active"),
  createProfileFollow(8, actors[0], actors[5], "active"),
  createProfileFollow(9, actors[0], actors[3], "removed"),
];

const profileBlocks: readonly VisualFixtureProfileBlock[] = [
  {
    id: fixtureUuid(11, 1),
    blockerUserId: actors[1].id,
    blockedUserId: actors[0].id,
    state: "active",
    createdAt: timestampForIndex(711),
  },
];

const profileReports: readonly VisualFixtureProfileReport[] = [
  {
    id: fixtureUuid(12, 1),
    reporterUserId: actors[2].id,
    targetUserId: actors[0].id,
    reason: "privacy",
    state: "submitted",
    createdAt: timestampForIndex(712),
  },
];

const spaces: readonly VisualFixtureSpace[] = [
  createSpace(1, actors[1], "Балкон след зимната пауза", "hidden", null),
  createSpace(2, actors[0], "Теплиця і сезонні грядки", "region", "UA-30"),
  createSpace(
    3,
    actors[1],
    "Градска джунгла с дълго име за проверка на пренасянето",
    "region",
    "BG-22",
  ),
  createSpace(
    4,
    actors[2],
    "Подвір'я для тварин і відновлення",
    "hidden",
    null,
  ),
  createSpace(5, actors[3], "Пасека на склоне", "region", "BG-23"),
  createSpace(
    6,
    actors[0],
    "Порожній простір для наступного сезону",
    "hidden",
    null,
  ),
  createSpace(
    7,
    actors[0],
    "Сезонні грядки та довга назва для перевірки перенесення",
    "region",
    "UA-30",
  ),
  createSpace(8, actors[0], "Тихий куточок для тварин", "hidden", null),
  createSpace(
    9,
    actors[0],
    "Навчальна пасіка без точної адреси",
    "region",
    "UA-30",
  ),
  createSpace(10, actors[5], "Одна полиця", "hidden", null),
];

interface ObjectSeedSpec {
  displayName: string;
  objectKind: VisualFixtureObjectKind;
  spaceIndex: number;
  catalogItemId?: string;
  varietyText?: string;
  varietyState: VisualFixtureVarietyState;
}

const objectSeedSpecs: readonly ObjectSeedSpec[] = [
  {
    displayName: "Черрі біля південної стінки",
    objectKind: "plant",
    spaceIndex: 2,
    catalogItemId: CATALOG_IDS.tomatoVariety,
    varietyState: "selected",
  },
  {
    displayName: "Ніжинський огірок на шпалері",
    objectKind: "plant",
    spaceIndex: 2,
    catalogItemId: CATALOG_IDS.cucumberVariety,
    varietyState: "selected",
  },
  {
    displayName: "Базилік для щотижневого зрізання",
    objectKind: "plant",
    spaceIndex: 2,
    varietyText: "Генуезький ароматний",
    varietyState: "free_text",
  },
  {
    displayName: "Перець після холодної ночі",
    objectKind: "plant",
    spaceIndex: 2,
    varietyText: "Ранній червоний",
    varietyState: "user_added",
  },
  {
    displayName: "Салат у затіненому кутку",
    objectKind: "plant",
    spaceIndex: 8,
    varietyState: "unknown",
  },
  {
    displayName: "Розмарин у великому контейнері",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.rosemarySpecies,
    varietyText: "Rosmarinus officinalis",
    varietyState: "selected",
  },
  {
    displayName: "Домати за балконската решетка",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.bgTomatoVariety,
    varietyState: "selected",
  },
  {
    displayName: "Монстера до прозореца",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.monsteraSpecies,
    varietyText: "Monstera deliciosa",
    varietyState: "selected",
  },
  {
    displayName: "Калатея с чувствителни листа",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.calatheaSpecies,
    varietyText: "Goeppertia orbifolia",
    varietyState: "selected",
  },
  {
    displayName: "Лимон от семка",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.lemonSpecies,
    varietyText: "Citrus limon",
    varietyState: "selected",
  },
  {
    displayName: "Лавандула за опрашителите",
    objectKind: "plant",
    spaceIndex: 3,
    catalogItemId: CATALOG_IDS.lavenderSpecies,
    varietyText: "Lavandula angustifolia",
    varietyState: "selected",
  },
  {
    displayName: "Соняшник уздовж огорожі",
    objectKind: "plant",
    spaceIndex: 7,
    catalogItemId: CATALOG_IDS.sunflowerSpecies,
    varietyText: "Helianthus annuus",
    varietyState: "selected",
  },
  {
    displayName: "Полуниця після поділу куща",
    objectKind: "plant",
    spaceIndex: 7,
    catalogItemId: CATALOG_IDS.strawberrySpecies,
    varietyText: "Fragaria x ananassa",
    varietyState: "selected",
  },
  {
    displayName: "М'ята, яку стримує окремий горщик",
    objectKind: "plant",
    spaceIndex: 7,
    varietyState: "unknown",
  },
  {
    displayName: "Орхидея след смяна на субстрата",
    objectKind: "plant",
    spaceIndex: 3,
    varietyText: "Phalaenopsis hybrid",
    varietyState: "free_text",
  },
  {
    displayName: "Маслина на остъкления балкон",
    objectKind: "plant",
    spaceIndex: 10,
    varietyText: "Olea europaea, balcony seedling",
    varietyState: "free_text",
  },
  {
    displayName:
      "Довга назва експериментального томата для перевірки карток і перенесення рядків",
    objectKind: "plant",
    spaceIndex: 7,
    varietyText: "Насіння з домашнього обміну",
    varietyState: "user_added",
  },
  {
    displayName: "Молода яблуня без журналу",
    objectKind: "plant",
    spaceIndex: 2,
    varietyText: "Сорт ще не визначено",
    varietyState: "unknown",
  },
  {
    displayName: "Коза Зірка",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.localGoatBreed,
    varietyText: "Українська місцева коза",
    varietyState: "selected",
  },
  {
    displayName: "Коза Хмарка після переїзду",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.bulgarianGoatBreed,
    varietyText: "Българска бяла млечна коза",
    varietyState: "selected",
  },
  {
    displayName: "Курка Ряба з відновленим пір'ям",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.rhodeIslandBreed,
    varietyText: "Rhode Island Red",
    varietyState: "selected",
  },
  {
    displayName: "Півень Граф",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.longBantamBreed,
    varietyText:
      "Бельгійська бородата бентамка д'Уккле, порцелянова кольорова лінія",
    varietyState: "selected",
  },
  {
    displayName: "Кішка М'ята біля теплиці",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.domesticShorthairBreed,
    varietyText: "Domestic Shorthair",
    varietyState: "selected",
  },
  {
    displayName: "Пес Бруно після реабілітації",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.mixedDogBreed,
    varietyText: "Mixed-breed dog",
    varietyState: "selected",
  },
  {
    displayName: "Кролиця Лада",
    objectKind: "animal",
    spaceIndex: 4,
    catalogItemId: CATALOG_IDS.unavailableRabbitSpecies,
    varietyText: "Oryctolagus cuniculus",
    varietyState: "selected",
  },
  {
    displayName: "Їжак, що приходить до води",
    objectKind: "animal",
    spaceIndex: 8,
    varietyState: "unknown",
  },
  {
    displayName: "Семейство Север",
    objectKind: "bee_colony",
    spaceIndex: 5,
    catalogItemId: CATALOG_IDS.carpathianBeeBreed,
    varietyText: "Карпатська бджола",
    varietyState: "selected",
  },
  {
    displayName: "Семейство Липа",
    objectKind: "bee_colony",
    spaceIndex: 5,
    catalogItemId: CATALOG_IDS.honeyBeeSpecies,
    varietyText: "Apis mellifera",
    varietyState: "selected",
  },
  {
    displayName: "Отводок Июнь",
    objectKind: "bee_colony",
    spaceIndex: 5,
    varietyState: "unknown",
  },
  {
    displayName: "Нуклеус с молодой маткой",
    objectKind: "bee_colony",
    spaceIndex: 9,
    varietyText: "Матка 2026",
    varietyState: "user_added",
  },
];

const objects: readonly VisualFixtureObject[] = objectSeedSpecs.map(
  (spec, offset) => {
    const index = offset + 1;
    const space = spaces[spec.spaceIndex - 1];
    return {
      id: fixtureUuid(3, index),
      ownerUserId: space.ownerUserId,
      spaceId: space.id,
      displayName: spec.displayName,
      objectKind: spec.objectKind,
      catalogItemId: spec.catalogItemId ?? null,
      varietyText: spec.varietyText ?? null,
      varietyState: spec.varietyState,
      locationVisibility: space.locationVisibility,
      coarseRegionCode: space.coarseRegionCode,
      createdAt: timestampForIndex(index),
    };
  },
);

const lineagePendingIdentity: VisualFixtureLineagePendingIdentity = {
  id: fixtureUuid(7, 1),
  createdByUserId: objects[0].ownerUserId,
  displayLabel: "Олена зберегла насіння з першого врожаю",
  createdAt: timestampForIndex(91),
};
const lineageEdge: VisualFixtureLineageEdge = {
  id: fixtureUuid(8, 1),
  ownerUserId: objects[0].ownerUserId,
  subjectObjectId: objects[0].id,
  sourcePendingIdentityId: lineagePendingIdentity.id,
  clientMutationId: "visual-fixture-lineage-claim-1",
  createdAt: timestampForIndex(92),
};
const lineageEvidence: VisualFixtureLineageEvidence = {
  pendingIdentities: [lineagePendingIdentity],
  edges: [lineageEdge],
  claimPendingIdentityId: lineagePendingIdentity.id,
  claimEdgeId: lineageEdge.id,
};

const entryCountsByObject = [
  12,
  5,
  4,
  ...Array.from({ length: 14 }, (_, index) =>
    index === 10 ? 3 : index === 12 ? 1 : 2,
  ),
  0,
  ...Array.from({ length: 7 }, () => 3),
  ...Array.from({ length: 5 }, () => 2),
] as const;

const feedObjectRecencyOrder = [
  0, 18, 26, 6, 22, 27, 1, 23, 28, 7, 24, 29, 2, 19, 25, 3, 20, 4, 21, 5, 8, 9,
  10, 11, 12, 13, 14, 15, 16, 17,
] as const;

const feedRecencyRankByObjectOffset = new Map<number, number>(
  feedObjectRecencyOrder.map((objectOffset, rank) => [objectOffset, rank]),
);

const entries: readonly VisualFixtureEntry[] = buildEntries();
const workspaceEvidence: VisualFixtureWorkspaceEvidence =
  buildWorkspaceEvidence();
const visualLongCreationTitle =
  "Довгий заголовок перевіряє перенесення без зміни ширини форми на вузькому екрані, зберігаючи дію доступною та зрозумілою для всіх".slice(
    0,
    140,
  );
const visualLongCreationBody =
  "Сьогоднішнє спостереження описує стан живого об'єкта, помітну зміну, безпечний контекст і наступну дію без точної адреси чи координат. "
    .repeat(20)
    .slice(0, 2000);
const creationEvidence: VisualFixtureCreationEvidence = {
  scenarios: [
    creationScenario(1, {
      flow: "first-entry",
      state: "minimum",
      label: "First plant · minimum useful input",
      objectName: "Томат біля вікна",
      entryBody: "З'явився перший бутон.",
    }),
    creationScenario(2, {
      flow: "first-entry",
      state: "optional",
      label: "First animal · optional details open",
      objectKind: "animal",
      objectName: "Марта",
      entryBody: "Спокійно поїла після ранкової прогулянки.",
      topicTagInput: "поведінка, годування",
      detailsOpen: true,
    }),
    creationScenario(3, {
      flow: "first-entry",
      state: "provisional",
      label: "First bee colony · provisional catalog name",
      objectKind: "bee_colony",
      objectName: "Карпатська сім'я",
      entryBody: "Сім'я спокійна, розплід рівномірний.",
      catalogQuery: "Локальна карпатська лінія",
      userAddedCatalogName: "Локальна карпатська лінія",
      detailsOpen: true,
    }),
    creationScenario(4, {
      flow: "first-entry",
      state: "unknown-long",
      label: "First object · Unknown identity and maximum copy",
      objectName: "Невідомий саджанець із дуже довгою робочою назвою",
      entryTitle: visualLongCreationTitle,
      entryBody: visualLongCreationBody,
      detailsOpen: true,
    }),
    creationScenario(5, {
      flow: "first-entry",
      state: "media",
      label: "First object · optional photo selected",
      objectName: "Балконний розмарин",
      entryBody: "Нові пагони стали щільнішими.",
      mediaFileName: "rosemary-first-update.jpg",
    }),
    creationScenario(6, {
      flow: "first-entry",
      state: "draft",
      label: "First object · restored local draft",
      objectName: "Чернетка лимона",
      entryBody: "Листя відновило тургор після поливу.",
      message: "Draft restored on this device.",
    }),
    creationScenario(7, {
      flow: "first-entry",
      state: "privacy",
      label: "First object · region privacy",
      objectName: "Лаванда",
      entryBody: "Перші квіти відкрилися цього ранку.",
      locationVisibility: "region",
      coarseRegionCode: "UA-32",
      detailsOpen: true,
    }),
    creationScenario(8, {
      flow: "first-entry",
      state: "offline",
      label: "First object · offline queued",
      objectName: "Офлайн перець",
      entryBody: "Збережено під час роботи без мережі.",
      online: false,
      submitState: "queued",
      message: "Saved on this device. It will sync when you are online.",
    }),
    creationScenario(9, {
      flow: "first-entry",
      state: "error",
      label: "First object · recoverable media error",
      objectName: "Монстера після пересадки",
      entryBody: "Є новий листок, але фото потребує повторного вибору.",
      submitState: "failed",
      message:
        "Photo could not be prepared. Choose it again or save without it.",
    }),
    creationScenario(10, {
      flow: "first-entry",
      state: "cancel",
      label: "First object · cancel with draft retained",
      objectName: "Чернетка перед виходом",
      entryBody: "Незавершений запис лишається на цьому пристрої.",
      message: "Cancel returns to the garden and keeps this local draft.",
    }),
    creationScenario(11, {
      flow: "first-entry",
      state: "duplicate",
      label: "First object · duplicate retry readback",
      objectName: "Томат без дубліката",
      entryBody: "Повторна відправка повернула вже створений запис.",
      submitState: "synced",
      message: "Already saved. No duplicate object or entry was created.",
    }),
    creationScenario(12, {
      flow: "follow-up",
      state: "minimum",
      label: "Next update · minimum useful input",
      entryBody: "Сьогодні відкрилася нова квітка.",
    }),
    creationScenario(13, {
      flow: "follow-up",
      state: "media",
      label: "Next update · optional photo selected",
      entryBody: "Фото показує нову китицю плодів.",
      mediaFileName: "next-update-fruit.jpg",
    }),
    creationScenario(14, {
      flow: "follow-up",
      state: "draft",
      label: "Next update · restored local draft",
      entryBody: "Чернетка порівнює стан із попереднім тижнем.",
      message: "Draft restored on this device.",
    }),
    creationScenario(15, {
      flow: "follow-up",
      state: "publish",
      label: "Next update · private save before explicit publish",
      entryBody: "Запис готовий до окремого підтвердження публікації.",
      submitState: "synced",
      message:
        "Saved privately. Publishing remains a separate explicit action.",
    }),
    creationScenario(16, {
      flow: "follow-up",
      state: "backdated",
      label: "Next update · backdated observation",
      entryBody: "Відновлено спостереження з травневого огляду.",
      entryDate: "2026-05-12",
      detailsOpen: true,
    }),
    creationScenario(17, {
      flow: "follow-up",
      state: "privacy",
      label: "Next update · private by default",
      entryBody: "Особисте спостереження без публічного розкриття.",
      message: "Private by default. Publish only after reviewing the entry.",
    }),
    creationScenario(18, {
      flow: "follow-up",
      state: "offline",
      label: "Next update · offline queued",
      entryBody: "Наступний запис збережено без мережі.",
      online: false,
      submitState: "queued",
      message: "Saved on this device. It will sync when you are online.",
    }),
    creationScenario(19, {
      flow: "follow-up",
      state: "error",
      label: "Next update · recoverable save error",
      entryBody: "Текст лишився у формі після помилки відправлення.",
      submitState: "failed",
      message: "Save failed. The draft is still here and can be retried.",
    }),
    creationScenario(20, {
      flow: "follow-up",
      state: "duplicate",
      label: "Next update · duplicate retry readback",
      entryBody: "Повторна відправка не створила другий запис.",
      submitState: "synced",
      message: "Already saved. No duplicate journal entry was created.",
    }),
  ],
};
const spaceJournalEntry = entries.find((entry) => entry.entryScope === "space");
if (!spaceJournalEntry) {
  throw new Error("Visual fixture space journal entry is missing.");
}
const objectMentions: readonly VisualFixtureObjectMention[] = [
  objects[0],
  objects[1],
].map((object, index) => ({
  ownerUserId: spaceJournalEntry.ownerUserId,
  spaceId: spaceJournalEntry.spaceId,
  journalEntryId: spaceJournalEntry.id,
  objectId: object.id,
  createdAt: timestampForIndex(390 + index),
}));

interface MediaSeedSpec {
  fileName: string;
  objectIndex: number;
  publicEntryOffset?: number;
  aspect: VisualFixtureMediaAspect;
  width: number;
  height: number;
  sha256: string;
  altText: string;
  caption?: string;
}

const mediaSeedSpecs: readonly MediaSeedSpec[] = [
  {
    fileName: "tomato-fruit-square.png",
    objectIndex: 0,
    aspect: "square",
    width: 1254,
    height: 1254,
    sha256: "60866d360740532e5af6d19b8d537351e654fef449d59b67bf161ad8de27515c",
    altText: "Стиглі червоні томати на здоровому кущі в теплиці",
    caption: "Стан плодів під час ранкового огляду",
  },
  {
    fileName: "balcony-herbs-square.png",
    objectIndex: 2,
    aspect: "square",
    width: 1254,
    height: 1254,
    sha256: "37f63a9b43142e0d441da66958841f0b756ac0322e04ff80bf61778635ec6864",
    altText: "Гъсти подправки в отделни саксии на градски балкон",
  },
  {
    fileName: "rescue-cat-square.png",
    objectIndex: 22,
    aspect: "square",
    width: 1254,
    height: 1254,
    sha256: "410a03a396c6044a2bb61a8129a26e730d24251bd71431cfae4b30fa2d15e170",
    altText: "Спокійна кішка відпочиває біля дерев'яного ящика в саду",
  },
  {
    fileName: "bee-frame-square.png",
    objectIndex: 26,
    aspect: "square",
    width: 1254,
    height: 1254,
    sha256: "3e5379c0f41e9b11162b7aa40a13abc05c9d5025791560e2e6d504bd63142807",
    altText: "Пчёлы спокойно работают на рамке во время осмотра семьи",
  },
  {
    fileName: "greenhouse-cucumber-4x3.png",
    objectIndex: 0,
    aspect: "landscape_4_3",
    width: 1448,
    height: 1086,
    sha256: "b26bd268b89415e2ed455fc0d063a3eea5757c258770cb1fccb399c96aa71821",
    altText: "Огірки на вертикальній шпалері з ранковим м'яким світлом",
    caption: "Сусідня шпалера в тому самому просторі",
  },
  {
    fileName: "indoor-monstera-4x3.png",
    objectIndex: 7,
    aspect: "landscape_4_3",
    width: 1448,
    height: 1086,
    sha256: "b7d293a789dc0ddc5dd6b1c939b5d1c965bc4fee8583cce01682102e0ddff5d4",
    altText: "Монстера и други стайни растения до светъл прозорец",
  },
  {
    fileName: "goats-yard-4x3.png",
    objectIndex: 18,
    aspect: "landscape_4_3",
    width: 1448,
    height: 1086,
    sha256: "138d4eed8e154c0c5582dad018289419af401b6e7a9213afd3868ca94c3e0cfb",
    altText: "Дві доглянуті кози у чистому затіненому подвір'ї",
  },
  {
    fileName: "apiary-slope-4x3.png",
    objectIndex: 27,
    aspect: "landscape_4_3",
    width: 1448,
    height: 1086,
    sha256: "70f7a728ceeed2fe5f2f3e73a0800cdf8206bbf53529928d081601fb03d47140",
    altText: "Небольшая пасека на зелёном склоне без видимых людей",
  },
  {
    fileName: "pepper-plant-portrait.png",
    objectIndex: 3,
    aspect: "portrait_3_4",
    width: 1086,
    height: 1448,
    sha256: "04c5b85c3384de0f07188208d276b5bae2c2e5b520632528636dedf55a387919",
    altText: "Вертикальний кущ перцю з плодами після прохолодної ночі",
  },
  {
    fileName: "orchid-roots-portrait.png",
    objectIndex: 14,
    aspect: "portrait_3_4",
    width: 1086,
    height: 1448,
    sha256: "e4668366c2e81729d0c4e918f1cdc8da9eb28c8d86c07ead652b05f2725fa82a",
    altText: "Орхидея в прозрачна саксия с видими здрави корени",
  },
  {
    fileName: "rehabilitated-dog-portrait.png",
    objectIndex: 23,
    aspect: "portrait_3_4",
    width: 1086,
    height: 1448,
    sha256: "377f70b85d1c8f49e20ec38789637c30796dc93f1e2e5c18e2ad1e11779b13ff",
    altText: "Спокійний пес стоїть на траві під час відновлення",
  },
  {
    fileName: "young-queen-frame-portrait.png",
    objectIndex: 29,
    aspect: "portrait_3_4",
    width: 1086,
    height: 1448,
    sha256: "086e7eb0382ff88203edd078dbdfab70a23d054516c121c10a781a02e888466f",
    altText: "Вертикальная рамка с молодой маткой и рабочими пчёлами",
  },
  {
    fileName: "greenhouse-wide.png",
    objectIndex: 0,
    aspect: "wide_16_9",
    width: 1672,
    height: 941,
    sha256: "d060d1a32a8168ae8b38367693bbac94efeb1a936bd93afb18fa29ef93ce177b",
    altText: "Широкий огляд теплиці з різними культурами та чистими проходами",
    caption: "Загальний вигляд простору для порівняння наступного тижня",
  },
  {
    fileName: "urban-balcony-wide.png",
    objectIndex: 6,
    aspect: "wide_16_9",
    width: 1672,
    height: 941,
    sha256: "75768ed801c2244cb2c5c127bf1296311979013604d01fa9ca206dcd1e89c3d2",
    altText: "Широк градски балкон с растения и място за ежедневна грижа",
  },
  {
    fileName: "animal-yard-wide.png",
    objectIndex: 20,
    aspect: "wide_16_9",
    width: 1672,
    height: 941,
    sha256: "1feb57cb8534583c963799a2ad73149cf9b194517e33b7bc6e4a7360fdc4df1d",
    altText: "Широке подвір'я з козами, курми та окремими зонами догляду",
  },
  {
    fileName: "hive-entrances-wide.png",
    objectIndex: 28,
    aspect: "wide_16_9",
    width: 1672,
    height: 941,
    sha256: "fdd2bc6b99118cee1b3f56ca8cfa955e771018378fc32bb0ad8c24462d60246f",
    altText: "Ряд ульев с активными входами в тёплый ясный день",
  },
];

const media: readonly VisualFixtureMedia[] = mediaSeedSpecs.map(
  (spec, offset) => {
    const index = offset + 1;
    const object = objects[spec.objectIndex];
    const matchingEntries = entries.filter(
      (entry) =>
        entry.objectId === object?.id &&
        entry.visibility === "public" &&
        entry.lifecycleState === "active" &&
        entry.publicGoneAt === null,
    );
    const entry = matchingEntries[spec.publicEntryOffset ?? 0];

    if (!object || !entry) {
      throw new Error(
        `Visual fixture media ${spec.fileName} does not have a matching public entry.`,
      );
    }

    return {
      id: fixtureUuid(5, index),
      ownerUserId: entry.ownerUserId,
      entryId: entry.id,
      fileName: spec.fileName,
      localPath: `test/visual-fixtures/media/${spec.fileName}`,
      quarantineKey: `${VISUAL_FIXTURE_NAMESPACE}/quarantine/${spec.fileName}`,
      derivativeKey: `${VISUAL_FIXTURE_NAMESPACE}/${spec.fileName}`,
      contentType: "image/png",
      aspect: spec.aspect,
      width: spec.width,
      height: spec.height,
      sha256: spec.sha256,
      altText: spec.altText,
      caption: spec.caption ?? null,
      createdAt: timestampForIndex(100 + index),
    };
  },
);

const topics: readonly VisualFixtureTopic[] = [
  {
    id: fixtureUuid(6, 1),
    slug: "seasonal-care",
    label: "Сезонний догляд",
    trustState: "curated",
    createdAt: timestampForIndex(401),
  },
  {
    id: fixtureUuid(6, 2),
    slug: "care-checks",
    label: "Регулярні спостереження",
    trustState: "curated",
    createdAt: timestampForIndex(402),
  },
  {
    id: fixtureUuid(6, 3),
    slug: "quiet-evidence",
    label: "Відновлення після стресу",
    trustState: "curated",
    createdAt: timestampForIndex(403),
  },
  {
    id: fixtureUuid(6, 4),
    slug: "watering-and-moisture",
    label: "Полив і вологість",
    trustState: "curated",
    createdAt: timestampForIndex(404),
  },
  {
    id: fixtureUuid(6, 5),
    slug: "stress-and-recovery",
    label: "Проблеми та відновлення",
    trustState: "curated",
    createdAt: timestampForIndex(405),
  },
  {
    id: fixtureUuid(6, 6),
    slug: "season-preparation",
    label: "Підготовка до сезону",
    trustState: "curated",
    createdAt: timestampForIndex(406),
  },
  {
    id: fixtureUuid(6, 7),
    slug: "single-observation",
    label: "Одне датоване спостереження",
    trustState: "curated",
    createdAt: timestampForIndex(407),
  },
];

const publicFeedEligibleEntries = entries.filter(
  (entry) =>
    entry.entryScope === "object" &&
    entry.visibility === "public" &&
    entry.lifecycleState === "active" &&
    entry.publicGoneAt === null &&
    entry.publishedAt !== null,
);
const publicFeedEntriesByKind = Object.groupBy(
  publicFeedEligibleEntries,
  (entry) =>
    objects.find((object) => object.id === entry.objectId)?.objectKind ??
    "plant",
);
const denseTopicEntries = [
  publicFeedEntriesByKind.plant?.[0],
  publicFeedEntriesByKind.animal?.[0],
  publicFeedEntriesByKind.bee_colony?.[0],
  publicFeedEntriesByKind.plant?.[1],
  publicFeedEntriesByKind.animal?.[1],
  publicFeedEntriesByKind.bee_colony?.[1],
  publicFeedEntriesByKind.plant?.[2],
  publicFeedEntriesByKind.animal?.[2],
  publicFeedEntriesByKind.bee_colony?.[2],
  publicFeedEntriesByKind.plant?.[3],
  publicFeedEntriesByKind.animal?.[3],
].filter((entry): entry is VisualFixtureEntry => Boolean(entry));
const typicalTopicEntries = [
  publicFeedEntriesByKind.plant?.[0],
  publicFeedEntriesByKind.animal?.[0],
  publicFeedEntriesByKind.bee_colony?.[0],
  publicFeedEntriesByKind.plant?.[1],
].filter((entry): entry is VisualFixtureEntry => Boolean(entry));
const singleObservationEntry = publicFeedEntriesByKind.plant?.[4];
if (!singleObservationEntry) {
  throw new Error("Visual fixture single-observation evidence is incomplete.");
}
const sortedPublicDirectoryEntries = [...publicFeedEligibleEntries].sort(
  compareFeedEntries,
);
const directoryMinusOneEntries = sortedPublicDirectoryEntries.slice(0, 7);
const directoryExactPageEntries = sortedPublicDirectoryEntries.slice(0, 8);
const directoryPlusOneEntries = sortedPublicDirectoryEntries.slice(0, 9);
const topicSignals: readonly VisualFixtureTopicSignal[] = [
  ...typicalTopicEntries.map((entry, index) =>
    createTopicSignal(entry, topics[0], 410 + index),
  ),
  ...denseTopicEntries.map((entry, index) =>
    createTopicSignal(entry, topics[1], 420 + index),
  ),
  ...directoryMinusOneEntries.map((entry, index) =>
    createTopicSignal(entry, topics[3], 440 + index),
  ),
  ...directoryExactPageEntries.map((entry, index) =>
    createTopicSignal(entry, topics[4], 450 + index),
  ),
  ...directoryPlusOneEntries.map((entry, index) =>
    createTopicSignal(entry, topics[5], 460 + index),
  ),
  createTopicSignal(singleObservationEntry, topics[6], 470),
];
const sortedDenseTopicEntries = [...denseTopicEntries].sort(compareFeedEntries);
const pageTwoAnchor = sortedDenseTopicEntries[7];
const exhaustedAnchor = sortedDenseTopicEntries.at(-2);

const mediaCountByEntry = new Map<string, number>();
for (const item of media) {
  mediaCountByEntry.set(
    item.entryId,
    (mediaCountByEntry.get(item.entryId) ?? 0) + 1,
  );
}
const mediaEntryIds = new Set(mediaCountByEntry.keys());
const galleryEntries = entries.filter(
  (entry) => (mediaCountByEntry.get(entry.id) ?? 0) === 3,
);

if (!pageTwoAnchor || !exhaustedAnchor || galleryEntries.length !== 1) {
  throw new Error("Visual fixture feed evidence is incomplete.");
}

const feedEvidence: VisualFixtureFeedEvidence = {
  pageSize: 8,
  typicalTopicSlug: topics[0].slug,
  denseTopicSlug: topics[1].slug,
  emptyTopicSlug: topics[2].slug,
  galleryEntryId: galleryEntries[0].id,
  pageTwoCursor: {
    id: pageTwoAnchor.id,
    publishedAt: pageTwoAnchor.publishedAt!,
  },
  exhaustedCursor: {
    id: exhaustedAnchor.id,
    publishedAt: exhaustedAnchor.publishedAt!,
  },
};

const journalDirectoryEvidence = buildJournalDirectoryEvidence();
const knowledgeEvidence = buildKnowledgeEvidence();
const passportEvidence = buildPassportEvidence();
const journalEntryEvidence = buildJournalEntryEvidence();
const profileEvidence = buildProfileEvidence();
const socialEvidence = buildSocialEvidence();

const emptySpaces = spaces.filter(
  (space) => !objects.some((object) => object.spaceId === space.id),
);
const emptyObjects = objects.filter(
  (object) => !entries.some((entry) => entry.objectId === object.id),
);
const todayEntries = entries.filter(
  (entry) => entry.entryDate === "2026-07-10",
);
const ownerOnlyEntries = entries.filter(
  (entry) => entry.visibility === "private",
);
const archivedEntries = entries.filter(
  (entry) => entry.lifecycleState === "archived",
);
const maximumCopyEntries = entries.filter(
  (entry) => entry.title.length === 140 || entry.body.length === 2000,
);
const noMediaEntries = entries.filter(
  (entry) =>
    entry.visibility === "public" &&
    entry.lifecycleState === "active" &&
    entry.publicGoneAt === null &&
    !mediaEntryIds.has(entry.id),
);
const oneMediaEntries = entries.filter(
  (entry) => (mediaCountByEntry.get(entry.id) ?? 0) === 1,
);

const stateCoverage: readonly VisualFixtureStateCoverage[] = [
  coverageState(
    "empty-space",
    "Empty space",
    "No living objects; owner workspace empty-state boundary.",
    emptySpaces.length,
    "owner",
    null,
  ),
  coverageState(
    "empty-object",
    "Empty object",
    "Living object without public journal history.",
    emptyObjects.length,
    "public",
    `/lineage/objects/${emptyObjects[0].id}`,
  ),
  coverageState(
    "today-journal",
    "Today's journal",
    "Deterministic current-day grouping anchor for this fixture version.",
    todayEntries.length,
    "public",
    `/journal/${todayEntries[0].publicSlug}`,
  ),
  coverageState(
    "owner-only-journal",
    "Owner-only journals",
    "Private records exist but have no public route or serialized preview.",
    ownerOnlyEntries.length,
    "owner",
    null,
  ),
  coverageState(
    "archived-journal",
    "Archived journals",
    "Archived records exercise owner history and public suppression.",
    archivedEntries.length,
    "owner",
    null,
  ),
  coverageState(
    "maximum-copy",
    "Maximum-length copy",
    "Exact 140-character title and 2,000-character body boundary.",
    maximumCopyEntries.length,
    "public",
    `/journal/${maximumCopyEntries[0].publicSlug}`,
  ),
  coverageState(
    "no-media-journal",
    "Public journal without media",
    "Real published route with text only.",
    noMediaEntries.length,
    "public",
    `/journal/${noMediaEntries[0].publicSlug}`,
  ),
  coverageState(
    "one-media-journal",
    "Public journal with one image",
    "Real published route backed by one stripped derivative.",
    oneMediaEntries.length,
    "public",
    `/journal/${oneMediaEntries[0].publicSlug}`,
  ),
  coverageState(
    "media-gallery",
    "Media gallery",
    "All deterministic aspect ratios in one inspectable collection.",
    media.length,
    "public",
    "/__visual-fixtures#media-gallery",
  ),
  coverageState(
    "feed-empty",
    "Empty public feed",
    "Curated trusted topic with zero eligible public journal entries.",
    1,
    "public",
    `/?topic=${feedEvidence.emptyTopicSlug}`,
  ),
  coverageState(
    "feed-typical",
    "Typical mixed public feed",
    "Four repository-backed plant, animal, and bee-colony updates.",
    typicalTopicEntries.length,
    "public",
    `/?topic=${feedEvidence.typicalTopicSlug}`,
  ),
  coverageState(
    "feed-dense",
    "Dense mixed public feed",
    "Page-size-plus-three eligible updates with real continuation.",
    denseTopicEntries.length,
    "public",
    `/?topic=${feedEvidence.denseTopicSlug}`,
  ),
  coverageState(
    "feed-loading",
    "Public feed loading",
    "Stable production loading composition under the fixture-only gate.",
    1,
    "public",
    "/?__visualFeed=loading",
  ),
  coverageState(
    "feed-error",
    "Recoverable public feed error",
    "Read-open route error with retry and knowledge continuation.",
    1,
    "public",
    "/?__visualFeed=error",
  ),
  coverageState(
    "feed-pagination",
    "Public feed second page",
    "Cursor-backed continuation using the same dense trusted topic.",
    denseTopicEntries.length - feedEvidence.pageSize,
    "public",
    "/?__visualFeed=page-2",
  ),
  coverageState(
    "feed-exhausted",
    "Exhausted public feed",
    "Final cursor window with no false continuation action.",
    1,
    "public",
    "/?__visualFeed=exhausted",
  ),
  coverageState(
    "feed-context-empty",
    "Empty feed context rail",
    "The feed remains useful when no trusted topic module is available.",
    1,
    "public",
    "/?__visualFeed=context-empty",
  ),
];

const activeEntry = entries.find(
  (entry) => entry.visibility === "public" && entry.lifecycleState === "active",
)!;
const goneEntry = entries.find((entry) => entry.publicGoneAt !== null)!;
const activeJournalPath = `/journal/${activeEntry.publicSlug}`;
const goneJournalPath = `/journal/${goneEntry.publicSlug}`;
const denseObjectPath = `/lineage/objects/${objects[0].id}`;

const intentEvidence: VisualFixtureIntentEvidence = {
  scenarios: [
    intentScenario(
      1,
      "comment",
      "Comment · guest start",
      "guest",
      activeJournalPath,
      {
        kind: "journal",
        ref: activeEntry.publicSlug!,
      },
    ),
    intentScenario(
      2,
      "bookmark",
      "Bookmark · guest start",
      "guest",
      activeJournalPath,
      { kind: "journal", ref: activeEntry.publicSlug! },
    ),
    intentScenario(
      3,
      "follow",
      "Follow · guest start",
      "guest",
      denseObjectPath,
      {
        kind: "object",
        ref: objects[0].id,
      },
    ),
    intentScenario(
      4,
      "claim",
      "Claim · guest start",
      "guest",
      "/garden/lineage/invitations/claim",
    ),
    intentScenario(
      5,
      "create_object",
      "Add object · guest start",
      "guest",
      "/garden",
    ),
    intentScenario(
      6,
      "create_entry",
      "Add journal entry · guest start",
      "guest",
      "/garden",
    ),
    {
      ...intentScenario(
        7,
        "save",
        "Save · retained first-entry draft",
        "draft_retained",
        "/garden?tab=drafts",
      ),
      draftKind: "first_entry",
    },
    intentScenario(
      8,
      "publish",
      "Publish · permission recheck",
      "insufficient_permission",
      `/garden/objects/${objects[0].id}`,
      { kind: "journal", ref: activeEntry.publicSlug! },
      "valid",
      404,
    ),
    intentScenario(
      9,
      "comment",
      "Comment · already authenticated",
      "already_authenticated",
      activeJournalPath,
      { kind: "journal", ref: activeEntry.publicSlug! },
    ),
    intentScenario(
      10,
      "comment",
      "Comment · cancel",
      "cancel",
      activeJournalPath,
      {
        kind: "journal",
        ref: activeEntry.publicSlug!,
      },
    ),
    intentScenario(
      11,
      "comment",
      "Comment · expired intent",
      "expired",
      activeJournalPath,
      { kind: "journal", ref: activeEntry.publicSlug! },
      "expired",
    ),
    intentScenario(
      12,
      "bookmark",
      "Bookmark · invalid intent",
      "invalid",
      activeJournalPath,
      { kind: "journal", ref: activeEntry.publicSlug! },
      "invalid",
    ),
    intentScenario(
      13,
      "comment",
      "Comment · deleted journal",
      "deleted_410",
      goneJournalPath,
      { kind: "journal", ref: goneEntry.publicSlug! },
      "valid",
      410,
    ),
    intentScenario(
      14,
      "comment",
      "Comment · now unavailable",
      "now_private",
      "/journal/visual-fixture-private-transition",
      { kind: "journal", ref: "visual-fixture-private-transition" },
      "valid",
      404,
    ),
    intentScenario(
      15,
      "follow",
      "Follow · insufficient permission",
      "insufficient_permission",
      denseObjectPath,
      { kind: "object", ref: objects[0].id },
    ),
    intentScenario(
      16,
      "bookmark",
      "Bookmark · preserved feed context",
      "guest",
      `/?topic=${feedEvidence.denseTopicSlug}&cursor=fixture-page-2&tab=journal&sort=newest`,
      { kind: "collection", ref: feedEvidence.denseTopicSlug },
    ),
    {
      ...intentScenario(
        17,
        "create_entry",
        "Add journal entry · retained draft",
        "draft_retained",
        "/garden?tab=drafts&entry=fixture-draft-17",
      ),
      draftKind: "first_entry",
    },
    intentScenario(
      18,
      "bookmark",
      "Bookmark · profile target",
      "guest",
      `/@${actors[0].handle}`,
      { kind: "profile", ref: actors[0].handle },
    ),
    {
      ...intentScenario(
        19,
        "save",
        "Save · follow-up draft permission changed",
        "draft_retained",
        `/garden/objects/${objects[0].id}`,
        { kind: "object", ref: objects[0].id },
        "valid",
        404,
      ),
      draftKind: "follow_up_entry",
    },
    intentScenario(
      20,
      "report",
      "Report profile · guest start",
      "guest",
      `/@${actors[0].handle}`,
      { kind: "profile", ref: actors[0].handle },
    ),
    intentScenario(
      21,
      "block",
      "Block profile · guest start",
      "guest",
      `/@${actors[0].handle}`,
      { kind: "profile", ref: actors[0].handle },
    ),
  ],
};

const scenarios: readonly VisualFixtureScenario[] = [
  scenario(
    "index",
    "fixture-index",
    "Fixture overview",
    "/__visual-fixtures",
    200,
  ),
  scenario(
    "feed-empty",
    "public-feed-empty",
    "Empty public feed",
    `/?topic=${feedEvidence.emptyTopicSlug}`,
    200,
  ),
  scenario(
    "feed-typical",
    "public-feed-typical",
    "Typical mixed public feed",
    `/?topic=${feedEvidence.typicalTopicSlug}`,
    200,
  ),
  scenario(
    "feed-dense",
    "public-feed-dense",
    "Dense mixed public feed",
    `/?topic=${feedEvidence.denseTopicSlug}`,
    200,
  ),
  scenario(
    "feed-loading",
    "public-feed-loading",
    "Public feed loading",
    "/?__visualFeed=loading",
    200,
  ),
  scenario(
    "feed-error",
    "public-feed-error",
    "Recoverable public feed error",
    "/?__visualFeed=error",
    200,
  ),
  scenario(
    "feed-page-2",
    "public-feed-pagination",
    "Public feed second page",
    "/?__visualFeed=page-2",
    200,
  ),
  scenario(
    "feed-exhausted",
    "public-feed-exhausted",
    "Exhausted public feed",
    "/?__visualFeed=exhausted",
    200,
  ),
  scenario(
    "feed-context-empty",
    "public-feed-context-empty",
    "Empty public feed context rail",
    "/?__visualFeed=context-empty",
    200,
  ),
  scenario(
    "catalog-empty",
    "public-catalog-empty",
    "Empty bee taxonomy category",
    "/objects?kind=bee_colony&identity=unavailable",
    200,
  ),
  scenario(
    "catalog-zero-results",
    "public-catalog-zero-results",
    "Catalog zero-result recovery",
    "/objects?q=visual-fixture-no-match",
    200,
  ),
  scenario(
    "catalog-sparse",
    "public-catalog-sparse",
    "Sparse bee breed catalog",
    "/ru/objects?kind=bee_colony&identity=breed",
    200,
  ),
  scenario(
    "catalog-page-size-minus-one",
    "public-catalog-page-size-minus-one",
    "Five provisional plant identities",
    "/objects?kind=plant&identity=provisional",
    200,
  ),
  scenario(
    "catalog-page-size",
    "public-catalog-page-size",
    "Six animal breed identities",
    "/objects?kind=animal&identity=breed",
    200,
  ),
  scenario(
    "catalog-page-size-plus-one",
    "public-catalog-page-size-plus-one",
    "Seven plant species with continuation",
    "/objects?kind=plant&identity=species",
    200,
  ),
  scenario(
    "catalog-pagination",
    "public-catalog-pagination",
    "Plant species second page",
    "/objects?kind=plant&identity=species&page=2",
    200,
  ),
  scenario(
    "catalog-combined-filters",
    "public-catalog-combined-filters",
    "Localized bee species search",
    "/bg/objects?kind=bee_colony&identity=species&q=Apis",
    200,
  ),
  scenario(
    "catalog-search-alias",
    "public-catalog-search-alias",
    "Catalog alias search",
    "/bg/objects?kind=plant&q=%D0%BB%D0%B0%D0%B2%D0%B0%D0%BD%D0%B4%D1%83%D0%BB%D0%B0",
    200,
  ),
  scenario(
    "catalog-unavailable",
    "public-catalog-unavailable",
    "Unavailable taxonomy remains explicit",
    "/objects?kind=animal&identity=unavailable",
    200,
  ),
  scenario(
    "catalog-loading",
    "public-catalog-loading",
    "Public catalog loading",
    "/bg/objects?__visualObjects=loading",
    200,
  ),
  scenario(
    "catalog-error",
    "public-catalog-error",
    "Recoverable public catalog error",
    "/ru/objects?__visualObjects=error",
    200,
  ),
  scenario(
    "catalog-variety",
    "public-catalog-variety",
    "Plant variety evidence",
    "/variety/visual-pomidor-cheri",
    200,
  ),
  scenario(
    "catalog-species",
    "public-catalog-species",
    "Plant species evidence",
    "/species/visual-rosmarinus-officinalis",
    200,
  ),
  scenario(
    "catalog-breed",
    "public-catalog-breed",
    "Bee breed evidence",
    "/breed/visual-karpatska-bdzhola",
    200,
  ),
  scenario(
    "journal-directory-default",
    "public-journal-directory-default",
    "Journal directory default browse",
    journalDirectoryEvidencePath("default"),
    200,
  ),
  scenario(
    "journal-directory-minus-one",
    "public-journal-directory-page-size-minus-one",
    "Journal directory with seven results",
    journalDirectoryEvidencePath("page-size-minus-one"),
    200,
  ),
  scenario(
    "journal-directory-exact-page",
    "public-journal-directory-page-size",
    "Journal directory with one exact page",
    journalDirectoryEvidencePath("page-size"),
    200,
  ),
  scenario(
    "journal-directory-plus-one",
    "public-journal-directory-page-size-plus-one",
    "Journal directory with real continuation",
    journalDirectoryEvidencePath("page-size-plus-one"),
    200,
  ),
  scenario(
    "journal-directory-page-two",
    "public-journal-directory-pagination",
    "Journal directory second page",
    journalDirectoryEvidencePath("page-two"),
    200,
  ),
  scenario(
    "journal-directory-combined",
    "public-journal-directory-combined-filters",
    "Bee journals by season and safe region",
    journalDirectoryEvidencePath("combined-safe-filters"),
    200,
  ),
  scenario(
    "journal-directory-zero",
    "public-journal-directory-zero-results",
    "Journal directory zero-result recovery",
    journalDirectoryEvidencePath("zero-results"),
    200,
  ),
  scenario(
    "journal-directory-corrected",
    "public-journal-directory-corrected-query",
    "Journal directory corrected query",
    journalDirectoryEvidencePath("corrected-query"),
    200,
  ),
  scenario(
    "journal-directory-loading",
    "public-journal-directory-loading",
    "Journal directory loading",
    "/bg/journals?__visualJournals=loading",
    200,
  ),
  scenario(
    "journal-directory-error",
    "public-journal-directory-error",
    "Recoverable journal directory error",
    "/ru/journals?__visualJournals=error",
    200,
  ),
  scenario(
    "journal-directory-exhausted",
    "public-journal-directory-exhausted",
    "Journal directory final page",
    journalDirectoryEvidencePath("exhausted"),
    200,
  ),
  scenario(
    "knowledge-hub-default",
    "public-knowledge-hub-default",
    "Knowledge hub with full synthetic corpus",
    "/knowledge?__visualKnowledge=corpus",
    200,
  ),
  scenario(
    "knowledge-hub-filtered",
    "public-knowledge-hub-filtered",
    "Filtered plant answers",
    "/bg/knowledge?type=answer&kind=plant&__visualKnowledge=corpus",
    200,
  ),
  scenario(
    "knowledge-hub-zero",
    "public-knowledge-hub-zero-results",
    "Knowledge zero-result recovery",
    "/ru/knowledge?q=visual-fixture-no-match&__visualKnowledge=corpus",
    200,
  ),
  scenario(
    "knowledge-hub-loading",
    "public-knowledge-hub-loading",
    "Knowledge loading composition",
    "/bg/knowledge?__visualKnowledge=loading",
    200,
  ),
  scenario(
    "knowledge-hub-error",
    "public-knowledge-hub-error",
    "Recoverable knowledge error",
    "/ru/knowledge?__visualKnowledge=error",
    200,
  ),
  scenario(
    "knowledge-guide-dense",
    "public-knowledge-guide-dense",
    "Guide with dense journal evidence",
    "/guides/visual-seasonal-observation?__visualKnowledge=corpus",
    200,
  ),
  scenario(
    "knowledge-guide-empty",
    "public-knowledge-guide-empty",
    "Guide with honest empty evidence",
    "/bg/guides/visual-honest-empty-evidence?__visualKnowledge=corpus",
    200,
  ),
  scenario(
    "knowledge-answer-long",
    "public-knowledge-answer-long",
    "Long Cyrillic answer with evidence",
    "/ru/answers/visual-long-recovery-answer?__visualKnowledge=corpus",
    200,
  ),
  scenario(
    "knowledge-answer-unavailable",
    "public-knowledge-answer-unavailable",
    "Unavailable synthetic answer",
    "/answers/visual-unavailable-answer?__visualKnowledge=unavailable",
    200,
    "not_found",
  ),
  scenario(
    "knowledge-topic-zero",
    "public-knowledge-topic-zero",
    "Curated topic without public evidence",
    "/topics/quiet-evidence?__visualKnowledge=corpus",
    200,
  ),
  scenario(
    "knowledge-topic-one",
    "public-knowledge-topic-one",
    "Curated topic with one observation",
    "/bg/topics/single-observation?__visualKnowledge=corpus",
    200,
  ),
  scenario(
    "knowledge-topic-dense",
    "public-knowledge-topic-dense",
    "Curated topic with dense mixed evidence",
    "/ru/topics/care-checks?__visualKnowledge=corpus",
    200,
  ),
  scenario(
    "journal-active",
    "public-journal-active",
    "Published journal with media",
    `/journal/${activeEntry.publicSlug}`,
    200,
  ),
  scenario(
    "journal-gone",
    "public-journal-gone",
    "Deleted public journal",
    `/journal/${goneEntry.publicSlug}`,
    410,
  ),
  scenario(
    "journal-missing",
    "public-journal-missing",
    "Unknown journal",
    "/journal/visual-fixtures-missing-entry",
    404,
  ),
  scenario(
    "object-empty",
    "public-object-empty",
    "Unpublished object passport",
    `/lineage/objects/${objects[17].id}`,
    404,
  ),
  scenario(
    "object-typical",
    "public-object-typical",
    "Typical object passport",
    `/lineage/objects/${objects[1].id}`,
    200,
  ),
  scenario(
    "object-dense",
    "public-object-dense",
    "Dense object passport",
    `/lineage/objects/${objects[0].id}`,
    200,
  ),
  scenario(
    "object-long-name",
    "public-object-long-name",
    "Long-name object passport",
    passportEvidenceCase("public-plant-long-name").path,
    200,
  ),
  scenario(
    "object-animal",
    "public-object-animal",
    "Animal passport with care chronology",
    passportEvidenceCase("public-animal-typical").path,
    200,
  ),
  scenario(
    "object-bee-colony",
    "public-object-bee-colony",
    "Bee-colony passport with apiary-safe context",
    passportEvidenceCase("public-bee-typical").path,
    200,
  ),
  scenario(
    "object-provisional",
    "public-object-provisional",
    "Provisional identity passport",
    passportEvidenceCase("public-plant-provisional").path,
    200,
  ),
  scenario(
    "object-unknown",
    "public-object-unknown",
    "Unknown identity passport",
    passportEvidenceCase("public-bee-unknown").path,
    200,
  ),
  scenario(
    "object-mixed-history",
    "public-object-mixed-history",
    "Public passport suppressing archived history",
    passportEvidenceCase("public-bee-mixed-history").path,
    200,
  ),
  scenario(
    "object-gone",
    "public-object-gone",
    "Deleted public object passport",
    passportEvidenceCase("public-gone").path,
    410,
  ),
  scenario(
    "object-missing",
    "public-object-missing",
    "Unknown object passport",
    `/lineage/objects/${fixtureUuid(3, 999)}`,
    404,
  ),
  scenario(
    "owner-object-empty",
    "owner-object-empty",
    "Signed-in owner empty passport",
    passportEvidenceCase("owner-empty").path,
    200,
  ),
  scenario(
    "owner-object-dense",
    "owner-object-dense",
    "Signed-in owner dense passport",
    passportEvidenceCase("owner-plant-dense").path,
    200,
  ),
  scenario(
    "owner-object-animal",
    "owner-object-animal",
    "Signed-in owner animal passport",
    passportEvidenceCase("owner-animal-typical").path,
    200,
  ),
  scenario(
    "owner-object-archived",
    "owner-object-archived",
    "Signed-in owner archived passport history",
    passportEvidenceCase("owner-bee-archived").path,
    200,
  ),
  scenario(
    "profile-empty",
    "public-profile-empty",
    "Empty new keeper profile",
    profileEvidenceCase("empty-guest").path,
    200,
  ),
  scenario(
    "profile-typical",
    "public-profile-typical",
    "Typical apartment keeper profile",
    profileEvidenceCase("apartment-typical").path,
    200,
  ),
  scenario(
    "profile-dense",
    "public-profile-dense",
    "Dense established gardener profile",
    profileEvidenceCase("gardener-dense").path,
    200,
  ),
  scenario(
    "profile-long",
    "public-profile-long",
    "Maximum-length profile fields",
    profileEvidenceCase("long-fields").path,
    200,
  ),
  scenario(
    "profile-private",
    "public-profile-private",
    "Private profile generic not found",
    profileEvidenceCase("private-unavailable").path,
    404,
  ),
  scenario(
    "profile-removed",
    "public-profile-removed",
    "Removed profile generic not found",
    profileEvidenceCase("removed-unavailable").path,
    404,
  ),
  scenario(
    "profile-blocked",
    "public-profile-blocked",
    "Blocked profile generic not found",
    profileEvidenceCase("blocked-unavailable").path,
    404,
  ),
  scenario(
    "owner-profile-preview",
    "owner-profile-preview",
    "Owner profile editor and exact preview",
    profileEvidenceCase("empty-owner").path,
    200,
  ),
  ...workspaceEvidence.scenarios.map((workspace) =>
    scenario(
      `workspace-${workspace.state}`,
      workspaceScenarioKind(workspace.state),
      `Garden workspace ${workspace.state}`,
      workspace.path,
      200,
    ),
  ),
  scenario(
    "media",
    "media-gallery",
    "Fixture media aspect gallery",
    "/__visual-fixtures#media-gallery",
    200,
  ),
];

export const VISUAL_FIXTURE_MANIFEST: VisualFixtureManifest = {
  version: VISUAL_FIXTURE_MANIFEST_VERSION,
  namespace: VISUAL_FIXTURE_NAMESPACE,
  actors,
  profiles,
  profileFollows,
  profileBlocks,
  profileReports,
  spaces,
  catalogItems,
  catalogNames,
  objects,
  entries,
  objectMentions,
  media,
  topics,
  topicSignals,
  feedEvidence,
  journalDirectoryEvidence,
  knowledgeEvidence,
  passportEvidence,
  journalEntryEvidence,
  profileEvidence,
  workspaceEvidence,
  creationEvidence,
  lineageEvidence,
  intentEvidence,
  socialEvidence,
  stateCoverage,
  scenarios,
};

export const VISUAL_FIXTURE_MANIFEST_HASH = calculateVisualFixtureManifestHash(
  VISUAL_FIXTURE_MANIFEST,
);

export function calculateVisualFixtureManifestHash(
  manifest: VisualFixtureManifest,
): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

export function validateVisualFixtureManifest(
  manifest: VisualFixtureManifest,
): string[] {
  const errors: string[] = [];
  checkCount(errors, "actors", manifest.actors.length, 8);
  checkCount(errors, "profiles", manifest.profiles.length, 8);
  checkCount(errors, "profile follows", manifest.profileFollows.length, 9);
  checkCount(errors, "profile blocks", manifest.profileBlocks.length, 1);
  checkCount(errors, "profile reports", manifest.profileReports.length, 1);
  checkCount(errors, "spaces", manifest.spaces.length, 10);
  checkCount(errors, "objects", manifest.objects.length, 30);
  checkCount(errors, "catalog items", manifest.catalogItems.length, 19);
  checkCount(errors, "catalog names", manifest.catalogNames.length, 29);
  checkCount(errors, "entries", manifest.entries.length, 81);
  checkCount(errors, "object mentions", manifest.objectMentions.length, 2);
  checkCount(errors, "media", manifest.media.length, 16);
  checkCount(errors, "topics", manifest.topics.length, 7);
  checkCount(errors, "topic signals", manifest.topicSignals.length, 40);
  checkCount(
    errors,
    "social comments",
    manifest.socialEvidence.comments.length,
    24,
  );
  checkCount(
    errors,
    "social bookmarks",
    manifest.socialEvidence.bookmarks.length,
    16,
  );
  checkCount(
    errors,
    "social follows",
    manifest.socialEvidence.follows.length,
    8,
  );
  checkCount(
    errors,
    "social comment reports",
    manifest.socialEvidence.commentReports.length,
    2,
  );
  checkCount(
    errors,
    "social notification receipts",
    manifest.socialEvidence.notificationReceipts.length,
    2,
  );
  checkCount(
    errors,
    "social notification preferences",
    manifest.socialEvidence.notificationPreferences.length,
    2,
  );
  checkCount(
    errors,
    "social wishlist items",
    manifest.socialEvidence.wishlistItems.length,
    14,
  );
  checkCount(
    errors,
    "journal creation scenarios",
    manifest.creationEvidence.scenarios.length,
    20,
  );

  const actorIds = new Set(manifest.actors.map((actor) => actor.id));
  const profileUserIds = new Set(
    manifest.profiles.map((profile) => profile.userId),
  );
  const spaceIds = new Set(manifest.spaces.map((space) => space.id));
  const objectIds = new Set(manifest.objects.map((object) => object.id));
  const catalogItemIds = new Set(manifest.catalogItems.map((item) => item.id));
  const entryIds = new Set(manifest.entries.map((entry) => entry.id));
  const mediaIds = new Set(manifest.media.map((item) => item.id));
  const topicIds = new Set(manifest.topics.map((topic) => topic.id));
  const pendingIdentityIds = new Set(
    manifest.lineageEvidence.pendingIdentities.map((identity) => identity.id),
  );
  checkUnique(
    errors,
    "actor ids",
    manifest.actors.map((actor) => actor.id),
  );
  checkUnique(
    errors,
    "actor handles",
    manifest.actors.map((actor) => actor.handle),
  );
  checkUnique(
    errors,
    "profile user ids",
    manifest.profiles.map((profile) => profile.userId),
  );
  checkUnique(
    errors,
    "profile handles",
    manifest.profiles.map((profile) => profile.handle),
  );
  checkUnique(
    errors,
    "profile follow ids",
    manifest.profileFollows.map((follow) => follow.id),
  );
  checkUnique(
    errors,
    "profile follow pairs",
    manifest.profileFollows.map(
      (follow) => `${follow.followerUserId}:${follow.targetUserId}`,
    ),
  );
  checkUnique(
    errors,
    "profile block ids",
    manifest.profileBlocks.map((block) => block.id),
  );
  checkUnique(
    errors,
    "profile block pairs",
    manifest.profileBlocks.map(
      (block) => `${block.blockerUserId}:${block.blockedUserId}`,
    ),
  );
  checkUnique(
    errors,
    "profile report ids",
    manifest.profileReports.map((report) => report.id),
  );
  checkUnique(
    errors,
    "profile report pairs",
    manifest.profileReports.map(
      (report) => `${report.reporterUserId}:${report.targetUserId}`,
    ),
  );
  checkUnique(
    errors,
    "social comment ids",
    manifest.socialEvidence.comments.map((comment) => comment.id),
  );
  checkUnique(
    errors,
    "social comment mutations",
    manifest.socialEvidence.comments.map(
      (comment) => `${comment.authorUserId}:${comment.clientMutationId}`,
    ),
  );
  checkUnique(
    errors,
    "social bookmark ids",
    manifest.socialEvidence.bookmarks.map((bookmark) => bookmark.id),
  );
  checkUnique(
    errors,
    "social bookmark owners and targets",
    manifest.socialEvidence.bookmarks.map(
      (bookmark) =>
        `${bookmark.ownerUserId}:${bookmark.targetKind}:${bookmark.targetRef}`,
    ),
  );
  checkUnique(
    errors,
    "social follow ids",
    manifest.socialEvidence.follows.map((follow) => follow.id),
  );
  checkUnique(
    errors,
    "social follow actors and targets",
    manifest.socialEvidence.follows.map(
      (follow) =>
        `${follow.followerUserId}:${follow.targetKind}:${follow.targetRef}`,
    ),
  );
  checkUnique(
    errors,
    "social comment report ids",
    manifest.socialEvidence.commentReports.map((report) => report.id),
  );
  checkUnique(
    errors,
    "social comment report actors and targets",
    manifest.socialEvidence.commentReports.map(
      (report) => `${report.reporterUserId}:${report.commentId}`,
    ),
  );
  checkUnique(
    errors,
    "social notification receipt ids",
    manifest.socialEvidence.notificationReceipts.map((receipt) => receipt.id),
  );
  checkUnique(
    errors,
    "social notification receipt owners and events",
    manifest.socialEvidence.notificationReceipts.map(
      (receipt) => `${receipt.ownerUserId}:${receipt.eventKey}`,
    ),
  );
  checkUnique(
    errors,
    "social notification preference owners",
    manifest.socialEvidence.notificationPreferences.map(
      (preference) => preference.ownerUserId,
    ),
  );
  checkUnique(
    errors,
    "social wishlist ids",
    manifest.socialEvidence.wishlistItems.map((item) => item.id),
  );
  checkUnique(
    errors,
    "social wishlist owners and catalog items",
    manifest.socialEvidence.wishlistItems.map(
      (item) => `${item.ownerUserId}:${item.catalogItemId}`,
    ),
  );
  checkUnique(
    errors,
    "social scenario ids",
    manifest.socialEvidence.scenarios.map((scenario) => scenario.id),
  );
  checkUnique(
    errors,
    "space ids",
    manifest.spaces.map((space) => space.id),
  );
  checkUnique(
    errors,
    "object ids",
    manifest.objects.map((object) => object.id),
  );
  checkUnique(
    errors,
    "catalog item ids",
    manifest.catalogItems.map((item) => item.id),
  );
  checkUnique(
    errors,
    "catalog public slugs",
    manifest.catalogItems.map((item) => item.publicSlug),
  );
  checkUnique(
    errors,
    "catalog name ids",
    manifest.catalogNames.map((name) => name.id),
  );
  checkUnique(
    errors,
    "entry ids",
    manifest.entries.map((entry) => entry.id),
  );
  checkUnique(
    errors,
    "media ids",
    manifest.media.map((item) => item.id),
  );
  checkUnique(
    errors,
    "media keys",
    manifest.media.map((item) => item.derivativeKey),
  );
  checkUnique(
    errors,
    "topic ids",
    manifest.topics.map((topic) => topic.id),
  );
  checkUnique(
    errors,
    "topic slugs",
    manifest.topics.map((topic) => topic.slug),
  );
  checkUnique(
    errors,
    "topic memberships",
    manifest.topicSignals.map(
      (signal) => `${signal.journalEntryId}:${signal.topicId}`,
    ),
  );
  checkUnique(
    errors,
    "object mentions",
    manifest.objectMentions.map(
      (mention) => `${mention.journalEntryId}:${mention.objectId}`,
    ),
  );
  checkUnique(
    errors,
    "public slugs",
    manifest.entries.flatMap((entry) =>
      entry.publicSlug ? [entry.publicSlug] : [],
    ),
  );
  checkUnique(
    errors,
    "state coverage ids",
    manifest.stateCoverage.map((state) => state.id),
  );
  checkUnique(
    errors,
    "state coverage kinds",
    manifest.stateCoverage.map((state) => state.kind),
  );
  checkUnique(
    errors,
    "scenario ids",
    manifest.scenarios.map((scenario) => scenario.id),
  );
  checkUnique(
    errors,
    "scenario kinds",
    manifest.scenarios.map((scenario) => scenario.kind),
  );
  checkUnique(
    errors,
    "journal directory evidence ids",
    manifest.journalDirectoryEvidence.queries.map((query) => query.id),
  );
  const knowledgeContent = [
    ...manifest.knowledgeEvidence.guides,
    ...manifest.knowledgeEvidence.answers,
  ];
  checkUnique(
    errors,
    "knowledge content slugs",
    knowledgeContent.map((content) => content.slug),
  );
  checkUnique(
    errors,
    "knowledge content paths",
    knowledgeContent.map((content) => content.path),
  );
  checkUnique(
    errors,
    "knowledge topic states",
    manifest.knowledgeEvidence.topics.map((topic) => topic.state),
  );
  checkUnique(
    errors,
    "intent scenario ids",
    manifest.intentEvidence.scenarios.map((scenario) => scenario.id),
  );
  checkUnique(
    errors,
    "lineage pending identity ids",
    manifest.lineageEvidence.pendingIdentities.map((identity) => identity.id),
  );
  checkUnique(
    errors,
    "lineage edge ids",
    manifest.lineageEvidence.edges.map((edge) => edge.id),
  );
  checkUnique(
    errors,
    "profile evidence ids",
    manifest.profileEvidence.scenarios.map((scenario) => scenario.id),
  );
  checkUnique(
    errors,
    "workspace evidence ids",
    manifest.workspaceEvidence.scenarios.map((scenario) => scenario.id),
  );
  checkUnique(
    errors,
    "workspace evidence states",
    manifest.workspaceEvidence.scenarios.map((scenario) => scenario.state),
  );
  checkUnique(
    errors,
    "journal creation scenario ids",
    manifest.creationEvidence.scenarios.map((scenario) => scenario.id),
  );

  for (const creation of manifest.creationEvidence.scenarios) {
    const fixtureObject = creation.objectId
      ? manifest.objects.find((object) => object.id === creation.objectId)
      : null;
    if (
      !actorIds.has(creation.ownerActorId) ||
      (creation.flow === "first-entry" &&
        (creation.spaceId !== null || creation.objectId !== null)) ||
      (creation.flow === "follow-up" &&
        (!creation.spaceId ||
          !spaceIds.has(creation.spaceId) ||
          !fixtureObject ||
          fixtureObject.ownerUserId !== creation.ownerActorId ||
          fixtureObject.spaceId !== creation.spaceId))
    ) {
      errors.push(
        `Journal creation scenario ${creation.id} has an invalid owner context.`,
      );
    }
    if (
      creation.entryTitle.length < 1 ||
      creation.entryTitle.length > 140 ||
      creation.entryBody.length < 1 ||
      creation.entryBody.length > 2000
    ) {
      errors.push(
        `Journal creation scenario ${creation.id} exceeds copy limits.`,
      );
    }
    if (
      (creation.locationVisibility === "hidden" &&
        creation.coarseRegionCode !== null) ||
      (creation.locationVisibility === "region" &&
        creation.coarseRegionCode === null)
    ) {
      errors.push(
        `Journal creation scenario ${creation.id} has an invalid region contract.`,
      );
    }
  }

  for (const actor of manifest.actors) {
    if (!actor.email.endsWith("@visual-fixtures.invalid")) {
      errors.push(`Actor ${actor.id} does not use the reserved email domain.`);
    }
  }
  for (const profile of manifest.profiles) {
    if (!actorIds.has(profile.userId)) {
      errors.push(`Profile ${profile.handle} references an unknown actor.`);
    }
    if (
      profile.handle.length < 3 ||
      profile.handle.length > 30 ||
      !/^[a-z0-9][a-z0-9_]{2,29}$/.test(profile.handle)
    ) {
      errors.push(`Profile ${profile.handle} has an invalid handle.`);
    }
    if (
      (profile.displayName?.length ?? 0) > 80 ||
      (profile.bio?.length ?? 0) > 600
    ) {
      errors.push(`Profile ${profile.handle} exceeds a public copy limit.`);
    }
    if (
      (profile.locationVisibility === "hidden" &&
        profile.coarseRegionCode !== null) ||
      (profile.locationVisibility === "region" &&
        profile.coarseRegionCode === null)
    ) {
      errors.push(`Profile ${profile.handle} has an invalid region contract.`);
    }
    if (
      (profile.profileLifecycleState === "active" && profile.removedAt) ||
      (profile.profileLifecycleState === "removed" && !profile.removedAt)
    ) {
      errors.push(
        `Profile ${profile.handle} has an invalid lifecycle contract.`,
      );
    }
    if (profile.avatarMediaAssetId) {
      const avatar = manifest.media.find(
        (item) => item.id === profile.avatarMediaAssetId,
      );
      if (!avatar || avatar.ownerUserId !== profile.userId) {
        errors.push(
          `Profile ${profile.handle} has an invalid avatar derivative.`,
        );
      }
    }
  }
  for (const follow of manifest.profileFollows) {
    if (
      !profileUserIds.has(follow.followerUserId) ||
      !profileUserIds.has(follow.targetUserId) ||
      follow.followerUserId === follow.targetUserId
    ) {
      errors.push(`Profile follow ${follow.id} has invalid actors.`);
    }
  }
  for (const block of manifest.profileBlocks) {
    if (
      !profileUserIds.has(block.blockerUserId) ||
      !profileUserIds.has(block.blockedUserId) ||
      block.blockerUserId === block.blockedUserId
    ) {
      errors.push(`Profile block ${block.id} has invalid actors.`);
    }
  }
  for (const report of manifest.profileReports) {
    if (
      !profileUserIds.has(report.reporterUserId) ||
      !profileUserIds.has(report.targetUserId) ||
      report.reporterUserId === report.targetUserId
    ) {
      errors.push(`Profile report ${report.id} has invalid actors.`);
    }
  }
  const socialCommentIds = new Set(
    manifest.socialEvidence.comments.map((comment) => comment.id),
  );
  const socialTargetExists = (
    kind: VisualFixtureSocialTargetKind,
    ref: string,
  ) => {
    if (kind === "journal_entry") {
      return manifest.entries.some((entry) => entry.publicSlug === ref);
    }
    if (kind === "lineage_object") return objectIds.has(ref);
    if (kind === "variety") {
      return manifest.catalogItems.some((item) => item.publicSlug === ref);
    }
    return manifest.topics.some((topic) => topic.slug === ref);
  };
  for (const comment of manifest.socialEvidence.comments) {
    if (
      !actorIds.has(comment.authorUserId) ||
      !socialTargetExists(comment.targetKind, comment.targetRef) ||
      (comment.parentCommentId !== null &&
        !socialCommentIds.has(comment.parentCommentId)) ||
      comment.body.trim().length < 1 ||
      comment.body.length > 600
    ) {
      errors.push(`Social comment ${comment.id} has an invalid contract.`);
    }
  }
  for (const bookmark of manifest.socialEvidence.bookmarks) {
    if (
      !actorIds.has(bookmark.ownerUserId) ||
      !socialTargetExists(bookmark.targetKind, bookmark.targetRef)
    ) {
      errors.push(`Social bookmark ${bookmark.id} has an invalid contract.`);
    }
  }
  for (const follow of manifest.socialEvidence.follows) {
    if (
      !actorIds.has(follow.followerUserId) ||
      !socialTargetExists(follow.targetKind, follow.targetRef)
    ) {
      errors.push(`Social follow ${follow.id} has an invalid contract.`);
    }
  }
  for (const report of manifest.socialEvidence.commentReports) {
    if (
      !actorIds.has(report.reporterUserId) ||
      !socialCommentIds.has(report.commentId)
    ) {
      errors.push(
        `Social comment report ${report.id} has an invalid contract.`,
      );
    }
  }
  for (const receipt of manifest.socialEvidence.notificationReceipts) {
    if (
      !actorIds.has(receipt.ownerUserId) ||
      !/^[a-f0-9]{32}$/.test(receipt.eventKey) ||
      (receipt.state === "read") !== Boolean(receipt.readAt)
    ) {
      errors.push(`Social notification receipt ${receipt.id} is invalid.`);
    }
  }
  for (const preference of manifest.socialEvidence.notificationPreferences) {
    if (!actorIds.has(preference.ownerUserId)) {
      errors.push(
        `Social notification preference ${preference.ownerUserId} is invalid.`,
      );
    }
  }
  for (const item of manifest.socialEvidence.wishlistItems) {
    if (
      !actorIds.has(item.ownerUserId) ||
      !catalogItemIds.has(item.catalogItemId)
    ) {
      errors.push(`Social wishlist item ${item.id} has an invalid contract.`);
    }
  }
  for (const scenario of manifest.socialEvidence.scenarios) {
    if (
      (scenario.actorId !== null && !actorIds.has(scenario.actorId)) ||
      (scenario.targetKind !== null &&
        (!scenario.targetRef ||
          !socialTargetExists(scenario.targetKind, scenario.targetRef))) ||
      !scenario.path.includes(`visualSocial=${scenario.id}`) ||
      scenario.expectedItemCount !== scenario.expectedVisibleIds.length
    ) {
      errors.push(`Social scenario ${scenario.id} has an invalid contract.`);
    }
  }
  for (const transition of manifest.socialEvidence.transitions) {
    if (!actorIds.has(transition.actorId) || !transition.targetId) {
      errors.push(`Social transition ${transition.action} has invalid actors.`);
    }
  }
  for (const scenario of manifest.profileEvidence.scenarios) {
    if (
      scenario.profileActorId &&
      !profileUserIds.has(scenario.profileActorId)
    ) {
      errors.push(
        `Profile evidence ${scenario.id} has an invalid profile actor.`,
      );
    }
    if (scenario.sessionActorId && !actorIds.has(scenario.sessionActorId)) {
      errors.push(
        `Profile evidence ${scenario.id} has an invalid session actor.`,
      );
    }
    if (
      scenario.expectedObjectIds.some((id) => !objectIds.has(id)) ||
      scenario.expectedJournalEntryIds.some((id) => !entryIds.has(id))
    ) {
      errors.push(
        `Profile evidence ${scenario.id} references unknown evidence.`,
      );
    }
    if (
      scenario.expectedAvatar &&
      !manifest.profiles.some(
        (profile) =>
          profile.userId === scenario.profileActorId &&
          profile.avatarMediaAssetId &&
          mediaIds.has(profile.avatarMediaAssetId),
      )
    ) {
      errors.push(`Profile evidence ${scenario.id} expects an invalid avatar.`);
    }
  }
  for (const space of manifest.spaces) {
    if (!actorIds.has(space.ownerUserId)) {
      errors.push(`Space ${space.id} references an unknown actor.`);
    }
  }
  for (const object of manifest.objects) {
    const objectSpace = manifest.spaces.find(
      (space) => space.id === object.spaceId,
    );
    if (
      !actorIds.has(object.ownerUserId) ||
      !objectSpace ||
      objectSpace.ownerUserId !== object.ownerUserId
    ) {
      errors.push(`Object ${object.id} has an invalid owner or space.`);
    }
    if (
      object.catalogItemId !== null &&
      !catalogItemIds.has(object.catalogItemId)
    ) {
      errors.push(`Object ${object.id} references a non-fixture catalog row.`);
    }
  }
  for (const item of manifest.catalogItems) {
    if (
      item.source !== "visual_fixture" ||
      !item.sourceId.startsWith("ove175-visual-")
    ) {
      errors.push(`Catalog item ${item.id} has unsafe fixture provenance.`);
    }
    if (!item.publicSlug.startsWith("visual-")) {
      errors.push(`Catalog item ${item.id} has a non-fixture public slug.`);
    }
  }
  for (const name of manifest.catalogNames) {
    if (!catalogItemIds.has(name.catalogItemId)) {
      errors.push(`Catalog name ${name.id} references an unknown item.`);
    }
  }
  for (const identity of manifest.lineageEvidence.pendingIdentities) {
    if (!actorIds.has(identity.createdByUserId)) {
      errors.push(`Lineage identity ${identity.id} has an invalid creator.`);
    }
  }
  for (const edge of manifest.lineageEvidence.edges) {
    if (
      !actorIds.has(edge.ownerUserId) ||
      !objectIds.has(edge.subjectObjectId) ||
      !pendingIdentityIds.has(edge.sourcePendingIdentityId)
    ) {
      errors.push(`Lineage edge ${edge.id} has an invalid fixture reference.`);
    }
  }
  if (
    !pendingIdentityIds.has(manifest.lineageEvidence.claimPendingIdentityId) ||
    !manifest.lineageEvidence.edges.some(
      (edge) => edge.id === manifest.lineageEvidence.claimEdgeId,
    )
  ) {
    errors.push("Lineage claim evidence does not reference fixture rows.");
  }
  for (const entry of manifest.entries) {
    if (
      !actorIds.has(entry.ownerUserId) ||
      !spaceIds.has(entry.spaceId) ||
      (entry.entryScope === "object"
        ? entry.objectId === null || !objectIds.has(entry.objectId)
        : entry.objectId !== null)
    ) {
      errors.push(`Entry ${entry.id} has an invalid owner, space, or object.`);
    }
    if (entry.title.length < 1 || entry.title.length > 140) {
      errors.push(`Entry ${entry.id} has an invalid title length.`);
    }
    if (entry.body.length < 1 || entry.body.length > 2000) {
      errors.push(`Entry ${entry.id} has an invalid body length.`);
    }
  }
  for (const mention of manifest.objectMentions) {
    const entry = manifest.entries.find(
      (candidate) => candidate.id === mention.journalEntryId,
    );
    const object = manifest.objects.find(
      (candidate) => candidate.id === mention.objectId,
    );
    if (
      !entry ||
      entry.entryScope !== "space" ||
      !object ||
      entry.ownerUserId !== mention.ownerUserId ||
      entry.spaceId !== mention.spaceId ||
      object.ownerUserId !== mention.ownerUserId ||
      object.spaceId !== mention.spaceId
    ) {
      errors.push("Object mention crosses a fixture owner or space boundary.");
    }
  }
  for (const item of manifest.media) {
    if (!entryIds.has(item.entryId)) {
      errors.push(`Media ${item.id} references an unknown entry.`);
    }
    if (!item.derivativeKey.startsWith(`${manifest.namespace}/`)) {
      errors.push(`Media ${item.id} is outside the fixture namespace.`);
    }
  }
  for (const signal of manifest.topicSignals) {
    const entry = manifest.entries.find(
      (candidate) => candidate.id === signal.journalEntryId,
    );
    if (!entry || !topicIds.has(signal.topicId)) {
      errors.push("Topic signal references an unknown entry or topic.");
      continue;
    }
    if (
      entry.visibility !== "public" ||
      entry.lifecycleState !== "active" ||
      entry.publicGoneAt !== null
    ) {
      errors.push(`Topic signal exposes ineligible entry ${entry.id}.`);
    }
  }
  const publicEntryById = new Map(
    manifest.entries
      .filter(
        (entry) =>
          entry.visibility === "public" &&
          entry.lifecycleState === "active" &&
          entry.publicGoneAt === null &&
          entry.publishedAt !== null &&
          entry.publicSlug !== null,
      )
      .map((entry) => [entry.id, entry]),
  );
  const catalogSlugs = new Set(
    manifest.catalogItems.map((item) => item.publicSlug),
  );
  const topicSlugs = new Set(manifest.topics.map((topic) => topic.slug));
  for (const content of knowledgeContent) {
    if (content.path !== `/${content.kind}s/${content.slug}`) {
      errors.push(`Knowledge content ${content.slug} has an invalid path.`);
    }
    if (
      !content.editorial.synthetic ||
      !/synthetic.*not expert/i.test(content.editorial.source)
    ) {
      errors.push(`Knowledge content ${content.slug} has unsafe authorship.`);
    }
    if (content.mediaId !== null && !mediaIds.has(content.mediaId)) {
      errors.push(`Knowledge content ${content.slug} has invalid media.`);
    }
    if (
      content.evidence.expectedCount !==
      content.evidence.expectedEntryIds.length
    ) {
      errors.push(`Knowledge content ${content.slug} has a count mismatch.`);
    }
    if (
      content.evidence.topicSlugs.some((slug) => !topicSlugs.has(slug)) ||
      content.evidence.catalogSlugs.some((slug) => !catalogSlugs.has(slug))
    ) {
      errors.push(`Knowledge content ${content.slug} has an unknown rule.`);
    }
    if (
      content.evidence.expectedEntryIds.some(
        (entryId) => !publicEntryById.has(entryId),
      ) ||
      content.evidence.expectedObjectIds.some(
        (objectId) => !objectIds.has(objectId),
      )
    ) {
      errors.push(
        `Knowledge content ${content.slug} exposes invalid evidence.`,
      );
    }
    if (
      !(["uk", "bg", "ru"] as const).every((locale) => {
        const translation = content.translations[locale];
        return translation.title.trim() && translation.description.trim();
      })
    ) {
      errors.push(`Knowledge content ${content.slug} lacks a translation.`);
    }
  }
  for (const topic of manifest.knowledgeEvidence.topics) {
    if (!topicSlugs.has(topic.slug)) {
      errors.push(`Knowledge topic ${topic.slug} is not curated.`);
    }
    if (
      topic.expectedEntryIds.some((entryId) => !publicEntryById.has(entryId)) ||
      topic.expectedObjectIds.some((objectId) => !objectIds.has(objectId))
    ) {
      errors.push(`Knowledge topic ${topic.slug} exposes invalid evidence.`);
    }
    if (
      (topic.state === "zero" && topic.expectedEntryIds.length !== 0) ||
      (topic.state === "one" && topic.expectedEntryIds.length !== 1) ||
      (topic.state === "dense" && topic.expectedEntryIds.length <= 8) ||
      (topic.state === "typical" && topic.expectedEntryIds.length < 3)
    ) {
      errors.push(`Knowledge topic ${topic.slug} has the wrong state count.`);
    }
  }
  if (manifest.journalDirectoryEvidence.pageSize !== 8) {
    errors.push(
      "Journal directory evidence must use the production page size.",
    );
  }
  if (manifest.journalDirectoryEvidence.hiddenRegionEntryCount < 1) {
    errors.push("Journal directory evidence has no hidden-region record.");
  }
  for (const query of manifest.journalDirectoryEvidence.queries) {
    if (!/^\/(?:bg\/|ru\/)?journals(?:\?|$)/.test(query.path)) {
      errors.push(
        `Journal directory evidence ${query.id} has an invalid path.`,
      );
    }
    if (
      query.expectedOrderedEntryIds.length !==
      query.expectedOrderedPublicSlugs.length
    ) {
      errors.push(
        `Journal directory evidence ${query.id} has mismatched order arrays.`,
      );
      continue;
    }
    query.expectedOrderedEntryIds.forEach((entryId, index) => {
      const entry = publicEntryById.get(entryId);
      if (
        !entry ||
        entry.publicSlug !== query.expectedOrderedPublicSlugs[index]
      ) {
        errors.push(
          `Journal directory evidence ${query.id} references an ineligible or mismatched entry.`,
        );
      }
    });
    if (query.expectedOrderedEntryIds.length > 8) {
      errors.push(`Journal directory evidence ${query.id} exceeds one page.`);
    }
  }
  const manifestMediaCounts = Object.groupBy(
    manifest.media,
    (item) => item.entryId,
  );
  if (
    Object.values(manifestMediaCounts).filter(
      (items) => (items?.length ?? 0) === 3,
    ).length !== 1
  ) {
    errors.push("Manifest must contain exactly one three-image feed gallery.");
  }
  for (const anchor of [
    manifest.feedEvidence.pageTwoCursor,
    manifest.feedEvidence.exhaustedCursor,
  ]) {
    if (!entryIds.has(anchor.id) || !anchor.publishedAt.endsWith("Z")) {
      errors.push("Feed cursor anchor is not a deterministic public entry.");
    }
  }
  for (const state of manifest.stateCoverage) {
    if (state.count < 1) {
      errors.push(`State coverage ${state.id} has no matching fixtures.`);
    }
    if (state.path !== null && !state.path.startsWith("/")) {
      errors.push(`State coverage ${state.id} has an invalid route path.`);
    }
    if (state.access === "owner" && state.path !== null) {
      errors.push(`Owner-only state coverage ${state.id} exposes a route.`);
    }
  }
  for (const passport of manifest.passportEvidence.scenarios) {
    const object = manifest.objects.find(
      (candidate) => candidate.id === passport.objectId,
    );
    if (!object || object.ownerUserId !== passport.ownerActorId) {
      errors.push(
        `Passport evidence ${passport.id} has an invalid owner object.`,
      );
      continue;
    }
    if (object.objectKind !== passport.objectKind) {
      errors.push(
        `Passport evidence ${passport.id} has the wrong object kind.`,
      );
    }
    if (!passport.path.includes(passport.objectId)) {
      errors.push(`Passport evidence ${passport.id} has an invalid route.`);
    }
    const expectedEntries =
      passport.expectedStatus === 200
        ? passportTimelineEntries(passport.objectId, passport.access)
        : [];
    const expectedIds = expectedEntries.map((entry) => entry.id);
    if (
      expectedIds.length !== passport.expectedTimelineCount ||
      expectedIds.some(
        (entryId, index) =>
          passport.expectedTimelineEntryIds[index] !== entryId,
      )
    ) {
      errors.push(`Passport evidence ${passport.id} has stale timeline proof.`);
    }
    const expectedIdSet = new Set(expectedIds);
    const expectedAspects = manifest.media
      .filter((item) => expectedIdSet.has(item.entryId))
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .map((item) => item.aspect);
    if (
      expectedAspects.length !== passport.expectedMediaAspects.length ||
      expectedAspects.some(
        (aspect, index) => passport.expectedMediaAspects[index] !== aspect,
      )
    ) {
      errors.push(`Passport evidence ${passport.id} has stale media proof.`);
    }
  }
  for (const intent of manifest.intentEvidence.scenarios) {
    if (intent.startPath !== `/__visual-fixtures/intent/${intent.id}`) {
      errors.push(
        `Intent scenario ${intent.id} exposes an invalid start path.`,
      );
    }
    try {
      const draft = normalizeAuthIntentDraft({
        action: intent.action,
        returnTo: intent.returnTo,
        ...(intent.target ? { target: intent.target } : {}),
      });
      if (intent.resumePath !== buildAuthIntentResumeHref(draft)) {
        errors.push(`Intent scenario ${intent.id} has an invalid resume path.`);
      }
    } catch {
      errors.push(`Intent scenario ${intent.id} has an invalid auth contract.`);
    }
    if (intent.state === "draft_retained" && !intent.draftKind) {
      errors.push(`Intent scenario ${intent.id} does not seed a real draft.`);
    }
    if (intent.state !== "draft_retained" && intent.draftKind) {
      errors.push(`Intent scenario ${intent.id} has an unexpected draft seed.`);
    }
  }

  for (const workspace of manifest.workspaceEvidence.scenarios) {
    if (
      workspace.path !==
      `/garden?visualWorkspace=${encodeURIComponent(workspace.state)}`
    ) {
      errors.push(`Workspace evidence ${workspace.id} has an invalid path.`);
    }
    if (workspace.state === "guest") {
      if (workspace.ownerActorId !== null) {
        errors.push("Guest workspace evidence unexpectedly names an owner.");
      }
      continue;
    }
    if (!workspace.ownerActorId || !actorIds.has(workspace.ownerActorId)) {
      errors.push(`Workspace evidence ${workspace.id} has an invalid owner.`);
      continue;
    }
    const ownerSpaces = manifest.spaces.filter(
      (space) => space.ownerUserId === workspace.ownerActorId,
    );
    const ownerObjects = manifest.objects.filter(
      (object) => object.ownerUserId === workspace.ownerActorId,
    );
    const ownerEntries = manifest.entries.filter(
      (entry) => entry.ownerUserId === workspace.ownerActorId,
    );
    if (
      workspace.expectedSpaceCount !== ownerSpaces.length ||
      workspace.expectedObjectCount !== ownerObjects.length ||
      workspace.expectedPlantCount !==
        ownerObjects.filter((object) => object.objectKind === "plant").length ||
      workspace.expectedAnimalCount !==
        ownerObjects.filter((object) => object.objectKind === "animal")
          .length ||
      workspace.expectedBeeColonyCount !==
        ownerObjects.filter((object) => object.objectKind === "bee_colony")
          .length ||
      workspace.expectedRecentCount !==
        Math.min(ownerEntries.length, manifest.workspaceEvidence.recentLimit)
    ) {
      errors.push(`Workspace evidence ${workspace.id} has stale counts.`);
    }
    if (
      workspace.expectedSpaceIds.some(
        (id) => !ownerSpaces.some((space) => space.id === id),
      ) ||
      workspace.expectedObjectIds.some(
        (id) => !ownerObjects.some((object) => object.id === id),
      ) ||
      workspace.expectedRecentEntryIds.some(
        (id) => !ownerEntries.some((entry) => entry.id === id),
      )
    ) {
      errors.push(`Workspace evidence ${workspace.id} crosses owner scope.`);
    }
  }

  const serialized = JSON.stringify(manifest);
  if (
    /password|access[_-]?token|refresh[_-]?token|session[_-]?token|latitude|longitude|coordinates|gps|https:\/\/over\.garden|lorem ipsum/i.test(
      serialized,
    )
  ) {
    errors.push(
      "Manifest contains forbidden production, privacy, or filler data.",
    );
  }

  return errors;
}

function buildWorkspaceEvidence(): VisualFixtureWorkspaceEvidence {
  const scenarioFor = (
    id: string,
    state: VisualFixtureWorkspaceState,
    actor: VisualFixtureActor | null,
    options: Partial<
      Pick<
        VisualFixtureWorkspaceScenarioEvidence,
        | "online"
        | "draftCount"
        | "queuedCount"
        | "failedCount"
        | "mediaProcessingCount"
        | "mediaFailedCount"
        | "faultSections"
      >
    > = {},
  ): VisualFixtureWorkspaceScenarioEvidence => {
    const ownerSpaces = actor
      ? spaces
          .filter((space) => space.ownerUserId === actor.id)
          .toSorted(compareCreatedDescending)
      : [];
    const ownerObjects = actor
      ? objects
          .filter((object) => object.ownerUserId === actor.id)
          .toSorted(compareCreatedDescending)
      : [];
    const ownerEntries = actor
      ? entries
          .filter((entry) => entry.ownerUserId === actor.id)
          .toSorted(compareWorkspaceEntries)
      : [];

    return {
      id,
      state,
      ownerActorId: actor?.id ?? null,
      path: `/garden?visualWorkspace=${encodeURIComponent(state)}`,
      expectedSpaceCount: ownerSpaces.length,
      expectedObjectCount: ownerObjects.length,
      expectedPlantCount: ownerObjects.filter(
        (object) => object.objectKind === "plant",
      ).length,
      expectedAnimalCount: ownerObjects.filter(
        (object) => object.objectKind === "animal",
      ).length,
      expectedBeeColonyCount: ownerObjects.filter(
        (object) => object.objectKind === "bee_colony",
      ).length,
      expectedRecentCount: Math.min(ownerEntries.length, 8),
      expectedSpaceIds: ownerSpaces.map((space) => space.id),
      expectedObjectIds: ownerObjects.map((object) => object.id),
      expectedRecentEntryIds: ownerEntries.slice(0, 8).map((entry) => entry.id),
      online: options.online ?? true,
      draftCount: options.draftCount ?? 0,
      queuedCount: options.queuedCount ?? 0,
      failedCount: options.failedCount ?? 0,
      mediaProcessingCount: options.mediaProcessingCount ?? 0,
      mediaFailedCount: options.mediaFailedCount ?? 0,
      faultSections: options.faultSections ?? [],
      viewportTargets: ["desktop", "mobile-320"],
    };
  };

  return {
    inventoryPreviewSize: 8,
    spacePreviewSize: 4,
    recentLimit: 8,
    scenarios: [
      scenarioFor("workspace-guest", "guest", null),
      scenarioFor("workspace-empty", "empty", actors[4]),
      scenarioFor("workspace-sparse", "sparse", actors[5]),
      scenarioFor("workspace-typical", "typical", actors[1], {
        draftCount: 1,
      }),
      scenarioFor("workspace-dense", "dense", actors[0], {
        draftCount: 2,
        mediaProcessingCount: 1,
      }),
      scenarioFor("workspace-offline", "offline", actors[0], {
        online: false,
        draftCount: 2,
        queuedCount: 1,
        failedCount: 1,
        mediaProcessingCount: 1,
        mediaFailedCount: 1,
      }),
      scenarioFor("workspace-loading", "loading", actors[0]),
      scenarioFor("workspace-partial-error", "partial-error", actors[0], {
        faultSections: ["recent"],
      }),
      scenarioFor("workspace-error", "error", actors[0], {
        faultSections: ["inventory", "spaces", "recent", "inbox", "media"],
      }),
    ],
  };
}

function compareCreatedDescending(
  left: { createdAt: string; id: string },
  right: { createdAt: string; id: string },
) {
  return (
    right.createdAt.localeCompare(left.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareWorkspaceEntries(
  left: VisualFixtureEntry,
  right: VisualFixtureEntry,
) {
  return (
    right.entryDate.localeCompare(left.entryDate) ||
    right.createdAt.localeCompare(left.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function workspaceScenarioKind(
  state: VisualFixtureWorkspaceState,
): VisualFixtureScenarioKind {
  switch (state) {
    case "guest":
      return "owner-workspace-guest";
    case "empty":
      return "owner-workspace-empty";
    case "sparse":
      return "owner-workspace-sparse";
    case "typical":
      return "owner-workspace-typical";
    case "dense":
      return "owner-workspace-dense";
    case "offline":
      return "owner-workspace-offline";
    case "loading":
      return "owner-workspace-loading";
    case "partial-error":
      return "owner-workspace-partial-error";
    case "error":
      return "owner-workspace-error";
  }
}

function buildEntries(): readonly VisualFixtureEntry[] {
  const result: VisualFixtureEntry[] = [];
  let globalIndex = 0;

  objects.forEach((object, objectOffset) => {
    const actor = actors.find(
      (candidate) => candidate.id === object.ownerUserId,
    )!;
    const count = entryCountsByObject[objectOffset];

    for (let ordinal = 1; ordinal <= count; ordinal += 1) {
      globalIndex += 1;
      const gone = globalIndex === 79;
      const archived = gone || globalIndex === 71 || globalIndex === 75;
      const isDenseObject = objectOffset === 0;
      const isPrivate =
        !gone && (isDenseObject ? ordinal > 10 : globalIndex % 9 === 0);
      const visibility: VisualFixtureVisibility = isPrivate
        ? "private"
        : "public";
      const feedRecencyRank =
        feedRecencyRankByObjectOffset.get(objectOffset) ?? objectOffset;
      const entryDate = dateDaysBefore(
        (ordinal - 1) * objects.length + feedRecencyRank,
      );
      const publicSlug =
        visibility === "public"
          ? `visual-fixture-${slugPart(object.displayName)}-${String(globalIndex).padStart(3, "0")}`
          : globalIndex === 11
            ? "visual-fixture-private-entry"
            : null;
      const title = entryTitle(actor.locale, object, ordinal, globalIndex);
      const body = entryBody(actor.locale, object, ordinal, globalIndex);
      const publishedAt =
        visibility === "public" ? `${entryDate}T12:00:00.000Z` : null;

      result.push({
        id: fixtureUuid(4, globalIndex),
        ownerUserId: object.ownerUserId,
        spaceId: object.spaceId,
        entryScope: "object",
        objectId: object.id,
        locale: actor.locale,
        title,
        body,
        entryDate,
        visibility,
        lifecycleState: archived ? "archived" : "active",
        publicSlug,
        publicNoindex: true,
        publishedAt,
        archivedAt: archived ? "2026-07-08T16:00:00.000Z" : null,
        publicGoneAt: gone ? "2026-07-09T16:00:00.000Z" : null,
        firstPublicationDisclosureVersion:
          visibility === "public" ? "first-publication-v4" : null,
        firstPublicationDisclosedAt: publishedAt,
        clientMutationId: `${VISUAL_FIXTURE_NAMESPACE}/entry-${String(globalIndex).padStart(3, "0")}`,
        createdAt: timestampForIndex(200 + globalIndex),
      });
    }
  });

  const sharedSpace = spaces[1];
  const sharedSpaceActor = actors.find(
    (actor) => actor.id === sharedSpace.ownerUserId,
  );
  if (!sharedSpaceActor) {
    throw new Error("Visual fixture space journal owner is missing.");
  }

  result.push({
    id: fixtureUuid(4, 81),
    ownerUserId: sharedSpace.ownerUserId,
    spaceId: sharedSpace.id,
    entryScope: "space",
    objectId: null,
    locale: sharedSpaceActor.locale,
    title: "Спільний ранковий обхід теплиці та сезонних грядок",
    body: "Ранковий обхід почав із Черрі біля південної стінки та Ніжинського огірка на шпалері. В обох об'єктів листя пружне, нових плям або пошкоджень немає.\n\nТомат полив меншою порцією, бо верхній шар ґрунту ще зберігав вологу. Огірку перевірив опору й прибрав один сухий листок, не змінюючи решту режиму.\n\nНаступне порівняння зроблю через два дні в той самий ранковий час, щоб окремо оцінити реакцію кожного об'єкта.",
    entryDate: "2026-07-09",
    visibility: "public",
    lifecycleState: "active",
    publicSlug: "visual-fixture-space-multi-object-round",
    publicNoindex: true,
    publishedAt: "2026-07-09T12:00:00.000Z",
    archivedAt: null,
    publicGoneAt: null,
    firstPublicationDisclosureVersion: "first-publication-v4",
    firstPublicationDisclosedAt: "2026-07-09T12:00:00.000Z",
    clientMutationId: `${VISUAL_FIXTURE_NAMESPACE}/entry-081`,
    createdAt: timestampForIndex(281),
  });

  return result;
}

function entryTitle(
  locale: VisualFixtureLocale,
  object: VisualFixtureObject,
  ordinal: number,
  globalIndex: number,
) {
  if (globalIndex === 6) {
    return "Підсумок повного сезону для Черрі біля південної стінки: полив, підв'язування, зав'язь, спека, відновлення та план наступного циклу у серпні";
  }

  const titleByLocale = {
    uk: [
      "Ранкове спостереження",
      "Що змінилося за тиждень",
      "Перевірка після догляду",
      "Нотатка перед наступним кроком",
    ],
    bg: [
      "Сутрешно наблюдение",
      "Промяната през тази седмица",
      "Проверка след грижата",
      "Бележка преди следващата стъпка",
    ],
    ru: [
      "Утреннее наблюдение",
      "Что изменилось за неделю",
      "Проверка после ухода",
      "Запись перед следующим шагом",
    ],
  } as const;
  const phrase = titleByLocale[locale][(ordinal - 1) % 4];
  return `${phrase}: ${object.displayName} · ${String(globalIndex).padStart(2, "0")}`;
}

function entryBody(
  locale: VisualFixtureLocale,
  object: VisualFixtureObject,
  ordinal: number,
  globalIndex: number,
) {
  const sequence = String(globalIndex).padStart(2, "0");
  const bodyByLocale = {
    uk: [
      `${object.displayName}: коротка перевірка №${sequence}. Видимих проблем немає; наступний огляд за звичним графіком.`,
      `${object.displayName}: спостереження №${sequence}. Порівняв колір, пружність, апетит або активність із попереднім записом. Стан відповідає сезону, тому режим догляду не змінюю. Черговість в історії: ${ordinal}.`,
      `${object.displayName}: після сьогоднішнього догляду зафіксував стан №${sequence}. Нових пошкоджень не помітив, реакція на звичний режим спокійна.\n\nДо наступної перевірки залишаю лише одну змінну: час поливу, годування або огляду. Так буде зрозуміло, що саме вплинуло на результат.`,
      `Сезонна нотатка №${sequence} про ${object.displayName}. Температура й тривалість дня змінилися, але загальний стан стабільний. Перевірив опору, чистоту місця, доступ до води та ознаки стресу. Наступний запис зроблю після помітної зміни, а не за календарем.`,
      `${object.displayName}: детальна контрольна точка №${sequence}. Спочатку оглянув новий приріст або поведінку, потім порівняв нижню частину, місце утримання та сліди шкідників чи подразнення.\n\nРізких змін немає. Зберігаю поточний режим ще на один цикл і додам фото з тієї самої точки, щоб порівняння не залежало від ракурсу. Позиція в історії: ${ordinal}.`,
    ],
    bg: [
      `${object.displayName}: кратка проверка №${sequence}. Няма видими проблеми; следващият преглед остава по обичайния график.`,
      `${object.displayName}: наблюдение №${sequence}. Сравних цвета, устойчивостта, апетита или активността с предишната бележка. Състоянието отговаря на сезона, затова не променям режима на грижа. Поредност в историята: ${ordinal}.`,
      `${object.displayName}: след днешната грижа записах състояние №${sequence}. Не видях нови повреди и реакцията към обичайния режим е спокойна.\n\nДо следващата проверка оставям само една променлива: час на поливане, хранене или преглед. Така ще е ясно кое решение е повлияло на резултата.`,
      `Сезонна бележка №${sequence} за ${object.displayName}. Температурата и продължителността на деня се промениха, но общото състояние е стабилно. Проверих опората, чистотата на мястото, достъпа до вода и признаците на стрес. Следващият запис ще бъде при видима промяна, а не само по календар.`,
      `${object.displayName}: подробна контролна точка №${sequence}. Първо прегледах новия растеж или поведението, после сравних долната част, мястото за отглеждане и следите от вредители или раздразнение.\n\nНяма резки промени. Запазвам настоящия режим за още един цикъл и ще добавя снимка от същата точка, за да не зависи сравнението от ъгъла. Позиция в историята: ${ordinal}.`,
    ],
    ru: [
      `${object.displayName}: короткая проверка №${sequence}. Видимых проблем нет; следующий осмотр остаётся по обычному графику.`,
      `${object.displayName}: наблюдение №${sequence}. Сравнил цвет, упругость, аппетит или активность с предыдущей записью. Состояние соответствует сезону, поэтому режим ухода не меняю. Порядок в истории: ${ordinal}.`,
      `${object.displayName}: после сегодняшнего ухода зафиксировал состояние №${sequence}. Новых повреждений не заметил, реакция на привычный режим спокойная.\n\nДо следующей проверки оставляю только одну переменную: время полива, кормления или осмотра. Так будет понятно, какое решение повлияло на результат.`,
      `Сезонная запись №${sequence} про ${object.displayName}. Температура и длина дня изменились, но общее состояние стабильное. Проверил опору, чистоту места, доступ к воде и признаки стресса. Следующую запись сделаю после заметного изменения, а не только по календарю.`,
      `${object.displayName}: подробная контрольная точка №${sequence}. Сначала осмотрел новый рост или поведение, затем сравнил нижнюю часть, место содержания и следы вредителей либо раздражения.\n\nРезких изменений нет. Сохраняю текущий режим ещё на один цикл и добавлю фото с той же точки, чтобы сравнение не зависело от ракурса. Позиция в истории: ${ordinal}.`,
    ],
  } as const;
  const body = bodyByLocale[locale][(ordinal - 1) % 5];

  if (globalIndex !== 6) return body;

  const maximumLengthSource = `${body}\n\nЗа два тижні верхній шар ґрунту висихав нерівномірно, тому полив переніс на ранок і розділив на дві менші порції. Нові листки розгортаються без плям, нижні не втратили пружності, а опора більше не перетискає стебло.\n\nПорівняння з попередньою датою: приріст помітний, але не різкий; колір стабільний; слідів шкідників під листям не знайшов. Залишаю той самий режим ще на сім днів, щоб не змішувати вплив одразу кількох рішень.\n\nОкремо перевірив дренажні отвори, край контейнера й нижній бік листків. Застою води немає, запах ґрунту звичайний, дрібних комах або липких слідів не видно. Ці деталі фіксую зараз, щоб наступне порівняння спиралося не лише на загальне враження.\n\nПісля полудня порівняв температуру біля скла та в проході, перевірив тінь від сусідніх рослин і переконався, що листя не торкається гарячої поверхні. Провітрювання відкриваю поступово, без різкого протягу, а полив не поєдную з підживленням у той самий день.\n\nНа кожній китиці порахував зав'язь, позначив одну контрольну гілку м'якою стрічкою та перевірив, чи не змістилася опора після останнього підв'язування. Стиглі плоди зняв вчасно, пошкоджених або тріснутих не було.\n\nУвечері оглянув нижній бік листків при боковому світлі, протер полицю, прибрав сухі частини й записав фактичну витрату води. Запах, колір ґрунту та швидкість стікання залишилися звичними для цього контейнера.\n\nДля наступного порівняння залишаю незмінними об'єм горщика, склад суміші, положення опори й ранковий час огляду. Окремо перевірю вагу врожаю, інтервал між поливами, нову зав'язь і реакцію на коротше денне провітрювання.\n\nФінальний висновок сезону: рослина стабільна, зміни пояснюються погодою та навантаженням плодами, а не ознаками хвороби. Наступне рішення прийму лише після повторного огляду з тієї самої точки та порівняння фотографій.\n\nКонтрольну точку завершую без додаткового втручання: усі спостереження прив'язані до дат, фото й конкретних дій, тому наступний запис покаже реальну динаміку, а не випадкову різницю.`;

  return `${maximumLengthSource.slice(0, 1999)}…`;
}

function createTopicSignal(
  entry: VisualFixtureEntry,
  topic: VisualFixtureTopic,
  timestampIndex: number,
): VisualFixtureTopicSignal {
  return {
    journalEntryId: entry.id,
    topicId: topic.id,
    signalSource: "operator_curated",
    reviewState: "accepted",
    publicMembershipState: "eligible",
    createdAt: timestampForIndex(timestampIndex),
  };
}

function compareFeedEntries(
  left: VisualFixtureEntry,
  right: VisualFixtureEntry,
) {
  return (
    right.publishedAt!.localeCompare(left.publishedAt!) ||
    left.id.localeCompare(right.id)
  );
}

function buildProfileEvidence(): VisualFixtureProfileEvidence {
  const profileByActorId = new Map(
    profiles.map((profile) => [profile.userId, profile]),
  );
  const activePublicProfileIds = new Set(
    profiles
      .filter(
        (profile) =>
          profile.profileVisibility === "public" &&
          profile.profileLifecycleState === "active" &&
          profile.removedAt === null,
      )
      .map((profile) => profile.userId),
  );
  const activeBlockPairs = new Set(
    profileBlocks
      .filter((block) => block.state === "active")
      .flatMap((block) => [
        `${block.blockerUserId}:${block.blockedUserId}`,
        `${block.blockedUserId}:${block.blockerUserId}`,
      ]),
  );

  const relationshipCounts = (actorId: string) => ({
    followers: profileFollows.filter(
      (follow) =>
        follow.targetUserId === actorId &&
        follow.state === "active" &&
        activePublicProfileIds.has(follow.followerUserId) &&
        !activeBlockPairs.has(`${actorId}:${follow.followerUserId}`),
    ).length,
    following: profileFollows.filter(
      (follow) =>
        follow.followerUserId === actorId &&
        follow.state === "active" &&
        activePublicProfileIds.has(follow.targetUserId) &&
        !activeBlockPairs.has(`${actorId}:${follow.targetUserId}`),
    ).length,
  });

  const publicProjection = (actorId: string) => {
    const actorEntries = entries
      .filter(
        (entry) =>
          entry.ownerUserId === actorId &&
          entry.visibility === "public" &&
          entry.lifecycleState === "active" &&
          entry.publicGoneAt === null &&
          entry.publicSlug !== null &&
          entry.publishedAt !== null,
      )
      .sort(compareFeedEntries);
    const objectEntries = Object.groupBy(
      actorEntries.filter(
        (entry) => entry.entryScope === "object" && entry.objectId,
      ),
      (entry) => entry.objectId!,
    );
    const publicObjects = objects
      .filter(
        (object) =>
          object.ownerUserId === actorId &&
          (objectEntries[object.id]?.length ?? 0) > 0,
      )
      .sort((left, right) => {
        const leftLatest = objectEntries[left.id]!.map(
          (entry) => entry.entryDate,
        )
          .sort()
          .at(-1)!;
        const rightLatest = objectEntries[right.id]!.map(
          (entry) => entry.entryDate,
        )
          .sort()
          .at(-1)!;
        return (
          rightLatest.localeCompare(leftLatest) ||
          right.createdAt.localeCompare(left.createdAt) ||
          left.id.localeCompare(right.id)
        );
      });

    return {
      expectedPublicObjectCount: publicObjects.length,
      expectedPublicEntryCount: actorEntries.length,
      expectedObjectIds: publicObjects.slice(0, 12).map((object) => object.id),
      expectedJournalEntryIds: actorEntries
        .slice(0, 16)
        .map((entry) => entry.id),
    };
  };

  const scenarioFor = ({
    id,
    profileActor,
    access,
    sessionActor = null,
    contentState,
    expectedStatus = 200,
    path,
  }: {
    id: string;
    profileActor: VisualFixtureActor;
    access: VisualFixtureProfileAccess;
    sessionActor?: VisualFixtureActor | null;
    contentState: VisualFixtureProfileContentState;
    expectedStatus?: 200 | 404;
    path?: string;
  }): VisualFixtureProfileScenarioEvidence => {
    const profile = profileByActorId.get(profileActor.id);
    if (!profile)
      throw new Error(`Fixture profile ${profileActor.id} is missing.`);
    const availableProjection = expectedStatus === 200;
    const projection = availableProjection
      ? publicProjection(profileActor.id)
      : {
          expectedPublicObjectCount: 0,
          expectedPublicEntryCount: 0,
          expectedObjectIds: [],
          expectedJournalEntryIds: [],
        };
    const counts = relationshipCounts(profileActor.id);
    const relationshipsVisible =
      availableProjection && profile.relationshipVisibility === "counts";
    const avatar = profile.avatarMediaAssetId
      ? media.find(
          (item) =>
            item.id === profile.avatarMediaAssetId &&
            item.ownerUserId === profileActor.id,
        )
      : null;

    return {
      id,
      access,
      sessionActorId: sessionActor?.id ?? null,
      profileActorId: profileActor.id,
      handle: profile.handle,
      path: path ?? localizedFixtureProfilePath(profileActor),
      expectedStatus,
      contentState,
      ...projection,
      expectedFollowerCount: relationshipsVisible ? counts.followers : null,
      expectedFollowingCount: relationshipsVisible ? counts.following : null,
      expectedAvatar: availableProjection && Boolean(avatar),
      viewportTargets: ["desktop", "mobile-320"],
    };
  };

  return {
    objectPreviewSize: 6,
    objectLimit: 12,
    journalPreviewSize: 8,
    journalLimit: 16,
    scenarios: [
      scenarioFor({
        id: "gardener-dense",
        profileActor: actors[0],
        access: "guest",
        contentState: "dense",
      }),
      scenarioFor({
        id: "apartment-typical",
        profileActor: actors[1],
        access: "guest",
        contentState: "typical",
      }),
      scenarioFor({
        id: "animal-specialist",
        profileActor: actors[2],
        access: "authenticated-non-owner",
        sessionActor: actors[3],
        contentState: "typical",
      }),
      scenarioFor({
        id: "beekeeper-specialist",
        profileActor: actors[3],
        access: "guest",
        contentState: "typical",
      }),
      scenarioFor({
        id: "empty-guest",
        profileActor: actors[4],
        access: "guest",
        contentState: "empty",
      }),
      scenarioFor({
        id: "empty-owner",
        profileActor: actors[4],
        access: "owner",
        sessionActor: actors[4],
        contentState: "empty",
        path: "/garden/profile",
      }),
      scenarioFor({
        id: "long-fields",
        profileActor: actors[7],
        access: "guest",
        contentState: "long",
      }),
      scenarioFor({
        id: "private-unavailable",
        profileActor: actors[5],
        access: "guest",
        contentState: "empty",
        expectedStatus: 404,
      }),
      scenarioFor({
        id: "removed-unavailable",
        profileActor: actors[6],
        access: "guest",
        contentState: "empty",
        expectedStatus: 404,
      }),
      scenarioFor({
        id: "blocked-unavailable",
        profileActor: actors[0],
        access: "authenticated-non-owner",
        sessionActor: actors[1],
        contentState: "dense",
        expectedStatus: 404,
      }),
    ],
  };
}

function buildSocialEvidence(): VisualFixtureSocialEvidence {
  const publicActiveEntries = entries.filter(
    (entry) =>
      entry.visibility === "public" &&
      entry.lifecycleState === "active" &&
      entry.publicGoneAt === null &&
      entry.publicSlug !== null &&
      entry.publishedAt !== null,
  );
  const ownerEntries = publicActiveEntries.filter(
    (entry) => entry.ownerUserId === actors[0].id,
  );
  const followedEntries = publicActiveEntries
    .filter((entry) => entry.ownerUserId === actors[2].id)
    .sort(compareFeedEntries);
  const blockedEntry = publicActiveEntries.find(
    (entry) => entry.ownerUserId === actors[1].id,
  );
  const closedEntry = entries.find(
    (entry) => entry.publicGoneAt !== null && entry.publicSlug !== null,
  );
  const objectForActor = (actor: VisualFixtureActor, offset = 0) =>
    objects.filter((object) => object.ownerUserId === actor.id)[offset];
  const ownerObject = objectForActor(actors[0]);
  const followedObject = objectForActor(actors[2]);
  const followedObjectRemoved = objectForActor(actors[2], 1);
  const blockedObject = objectForActor(actors[1]);
  const beekeeperObject = objectForActor(actors[3]);
  const unavailableObject = objects.find(
    (object) =>
      !entries.some(
        (entry) =>
          entry.objectId === object.id &&
          entry.visibility === "public" &&
          entry.lifecycleState === "active" &&
          entry.publicGoneAt === null,
      ),
  );

  if (
    ownerEntries.length < 5 ||
    followedEntries.length <= 12 ||
    !blockedEntry ||
    !closedEntry ||
    !ownerObject ||
    !followedObject ||
    !followedObjectRemoved ||
    !blockedObject ||
    !beekeeperObject ||
    !unavailableObject ||
    topics.length < 2
  ) {
    throw new Error(
      "Visual fixture social evidence prerequisites are incomplete.",
    );
  }

  const zeroTarget = ownerEntries[0];
  const oneTarget = ownerEntries[1];
  const pageTarget = ownerEntries[2];
  const denseTarget = ownerEntries[3];
  const comments: VisualFixtureEngagementComment[] = [];
  const addComment = (
    index: number,
    targetRef: string,
    author: VisualFixtureActor,
    state: VisualFixtureEngagementComment["state"] = "active",
    parentCommentId: string | null = null,
    body = `Synthetic discussion observation ${String(index).padStart(2, "0")}.`,
  ) => {
    const comment: VisualFixtureEngagementComment = {
      id: fixtureUuid(21, index),
      targetKind: "journal_entry",
      targetRef,
      authorUserId: author.id,
      parentCommentId,
      clientMutationId: `ove183-fixture-comment-${String(index).padStart(3, "0")}`,
      body,
      state,
      createdAt: timestampForIndex(800 + index),
    };
    comments.push(comment);
    return comment;
  };

  const oneComment = addComment(1, oneTarget.publicSlug!, actors[2]);
  const exactPageComments = Array.from({ length: 8 }, (_, offset) =>
    addComment(
      2 + offset,
      pageTarget.publicSlug!,
      [actors[2], actors[3], actors[4], actors[7]][offset % 4],
    ),
  );
  const denseRoots = Array.from({ length: 10 }, (_, offset) => {
    const index = 10 + offset;
    const state =
      index === 13
        ? "removed"
        : index === 16
          ? "reported"
          : index === 17
            ? "deleted"
            : "active";
    const author =
      index === 18
        ? actors[1]
        : [actors[2], actors[3], actors[4], actors[7]][offset % 4];
    const body =
      index === 19
        ? "Довгий синтетичний коментар перевіряє перенесення, висоту рядка й доступність меню дій без контактних даних або приватного місця. "
            .repeat(8)
            .slice(0, 600)
        : undefined;
    return addComment(
      index,
      denseTarget.publicSlug!,
      author,
      state,
      null,
      body,
    );
  });
  const nestedRoot = denseRoots.at(-1)!;
  const nestedReplies = [
    addComment(20, denseTarget.publicSlug!, actors[0], "active", nestedRoot.id),
    addComment(21, denseTarget.publicSlug!, actors[3], "active", nestedRoot.id),
    addComment(
      22,
      denseTarget.publicSlug!,
      actors[4],
      "removed",
      nestedRoot.id,
    ),
  ];
  const externalRoot = addComment(
    23,
    followedEntries[0].publicSlug!,
    actors[0],
  );
  const replyNotification = addComment(
    24,
    followedEntries[0].publicSlug!,
    actors[3],
    "active",
    externalRoot.id,
  );

  const follows: readonly VisualFixtureEngagementFollow[] = [
    socialFollow(1, actors[0], "lineage_object", followedObject.id, "active"),
    socialFollow(
      2,
      actors[0],
      "lineage_object",
      followedObjectRemoved.id,
      "removed",
    ),
    socialFollow(3, actors[0], "lineage_object", blockedObject.id, "active"),
    socialFollow(4, actors[0], "topic", topics[0].slug, "removed"),
    socialFollow(5, actors[2], "topic", topics[0].slug, "active"),
    socialFollow(6, actors[2], "lineage_object", ownerObject.id, "active"),
    socialFollow(7, actors[3], "lineage_object", ownerObject.id, "active"),
    socialFollow(
      8,
      actors[4],
      "lineage_object",
      unavailableObject.id,
      "active",
    ),
  ];

  const bookmarkTargets: Array<{
    kind: VisualFixtureSocialTargetKind;
    ref: string;
  }> = [
    ...ownerEntries.slice(0, 6).map((entry) => ({
      kind: "journal_entry" as const,
      ref: entry.publicSlug!,
    })),
    ...followedEntries.slice(0, 2).map((entry) => ({
      kind: "journal_entry" as const,
      ref: entry.publicSlug!,
    })),
    { kind: "journal_entry", ref: blockedEntry.publicSlug! },
    { kind: "lineage_object", ref: ownerObject.id },
    { kind: "lineage_object", ref: followedObject.id },
    { kind: "lineage_object", ref: beekeeperObject.id },
    { kind: "variety", ref: catalogItems[0].publicSlug },
    { kind: "topic", ref: topics[0].slug },
  ];
  const bookmarks: readonly VisualFixtureEngagementBookmark[] = [
    ...bookmarkTargets.map((target, offset) =>
      socialBookmark(1 + offset, actors[0], target.kind, target.ref, "active"),
    ),
    socialBookmark(
      30,
      actors[0],
      "journal_entry",
      followedEntries[2].publicSlug!,
      "removed",
    ),
    socialBookmark(
      31,
      actors[2],
      "journal_entry",
      ownerEntries[0].publicSlug!,
      "active",
    ),
  ];

  const selectableCatalogItems = catalogItems.filter(
    (item) => item.status === "seeded" || item.status === "confirmed",
  );
  const wishlistItems: readonly VisualFixtureWishlistItem[] = [
    ...selectableCatalogItems.slice(0, 13).map(
      (item, offset) =>
        ({
          id: fixtureUuid(26, 1 + offset),
          ownerUserId: actors[0].id,
          catalogItemId: item.id,
          sourceSurface: offset % 2 === 0 ? "public_variety" : "catalog_item",
          createdAt: timestampForIndex(980 + offset),
        }) satisfies VisualFixtureWishlistItem,
    ),
    {
      id: fixtureUuid(26, 20),
      ownerUserId: actors[2].id,
      catalogItemId: selectableCatalogItems[13].id,
      sourceSurface: "catalog_item",
      createdAt: timestampForIndex(1000),
    },
  ];

  const commentReports: readonly VisualFixtureEngagementCommentReport[] = [
    {
      id: fixtureUuid(24, 1),
      reporterUserId: actors[2].id,
      commentId: denseRoots[4].id,
      reason: "misinformation",
      state: "submitted",
      createdAt: timestampForIndex(950),
    },
    {
      id: fixtureUuid(24, 2),
      reporterUserId: actors[4].id,
      commentId: denseRoots[6].id,
      reason: "privacy",
      state: "reviewed",
      createdAt: timestampForIndex(951),
    },
  ];

  const activeInboxComments = comments
    .filter(
      (comment) =>
        comment.state === "active" &&
        comment.parentCommentId === null &&
        ownerEntries.some((entry) => entry.publicSlug === comment.targetRef) &&
        comment.authorUserId !== actors[0].id &&
        comment.authorUserId !== actors[1].id,
    )
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        left.id.localeCompare(right.id),
    );
  const objectFollowInbox = follows
    .filter(
      (follow) =>
        follow.state === "active" &&
        follow.targetKind === "lineage_object" &&
        follow.targetRef === ownerObject.id &&
        follow.followerUserId !== actors[1].id,
    )
    .map((follow) => ({
      key: fixtureNotificationEventKey("object_follow", follow.id),
      createdAt: follow.createdAt,
    }));
  const commentInbox = activeInboxComments.map((comment) => ({
    key: fixtureNotificationEventKey("comment", comment.id),
    createdAt: comment.createdAt,
  }));
  const replyInbox = [
    {
      key: fixtureNotificationEventKey("reply", replyNotification.id),
      createdAt: replyNotification.createdAt,
    },
  ];
  const expectedNotificationKeys = [
    ...objectFollowInbox,
    ...replyInbox,
    ...commentInbox,
  ]
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        left.key.localeCompare(right.key),
    )
    .slice(0, 12)
    .map((event) => event.key);
  const notificationReceipts: readonly VisualFixtureNotificationReceipt[] = [
    {
      id: fixtureUuid(25, 1),
      ownerUserId: actors[0].id,
      eventKey: expectedNotificationKeys[0],
      state: "read",
      readAt: timestampForIndex(970),
      createdAt: timestampForIndex(970),
    },
    {
      id: fixtureUuid(25, 2),
      ownerUserId: actors[0].id,
      eventKey: fixtureNotificationEventKey("comment", oneComment.id),
      state: "dismissed",
      readAt: null,
      createdAt: timestampForIndex(971),
    },
  ];
  const notificationPreferences: readonly VisualFixtureNotificationPreference[] =
    [
      {
        ownerUserId: actors[0].id,
        comments: true,
        replies: true,
        follows: true,
        mentions: true,
        claims: true,
        system: true,
        createdAt: timestampForIndex(972),
      },
      {
        ownerUserId: actors[4].id,
        comments: true,
        replies: false,
        follows: false,
        mentions: false,
        claims: false,
        system: false,
        createdAt: timestampForIndex(973),
      },
    ];

  const denseVisibleRoots = denseRoots
    .filter((comment) => comment.state !== "removed")
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 8);
  const denseVisibleRootIds = new Set(
    denseVisibleRoots.map((comment) => comment.id),
  );
  const denseVisibleIds = [
    ...denseVisibleRoots.map((comment) => comment.id),
    ...nestedReplies
      .filter(
        (comment) =>
          denseVisibleRootIds.has(comment.parentCommentId!) &&
          comment.parentCommentId === nestedRoot.id &&
          comment.state !== "removed",
      )
      .map((comment) => comment.id),
  ];
  const blockedVisibleRoots = denseRoots
    .filter(
      (comment) =>
        comment.state !== "removed" && comment.authorUserId !== actors[1].id,
    )
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 8);
  const blockedVisibleRootIds = new Set(
    blockedVisibleRoots.map((comment) => comment.id),
  );
  const blockedVisibleIds = [
    ...blockedVisibleRoots.map((comment) => comment.id),
    ...nestedReplies
      .filter(
        (comment) =>
          blockedVisibleRootIds.has(comment.parentCommentId!) &&
          comment.parentCommentId === nestedRoot.id &&
          comment.state !== "removed",
      )
      .map((comment) => comment.id),
  ];
  const visibleBookmarkRefs = bookmarkTargets
    .filter((target) => target.ref !== blockedEntry.publicSlug)
    .map((target) => target.ref);
  const visualPath = (base: string, id: string) =>
    `${base}${base.includes("?") ? "&" : "?"}visualSocial=${id}`;
  const scenario = (
    input: Omit<VisualFixtureSocialScenario, "viewportTargets">,
  ): VisualFixtureSocialScenario => ({
    ...input,
    viewportTargets: ["desktop", "mobile-320"],
  });

  return {
    commentPageSize: 8,
    feedPageSize: 12,
    notificationPageSize: 12,
    bookmarkPageSize: 12,
    actorRoles: {
      ordinaryReaderActorId: actors[4].id,
      reporterActorId: actors[2].id,
      reportedActorId: actors[3].id,
      blockedActorId: actors[1].id,
      moderatorSafeActorId: actors[4].id,
      emptyCollectionActorId: actors[4].id,
      denseCollectionActorId: actors[0].id,
    },
    comments,
    bookmarks,
    follows,
    commentReports,
    notificationReceipts,
    notificationPreferences,
    wishlistItems,
    scenarios: [
      scenario({
        id: "comments-zero",
        surface: "journal",
        state: "zero",
        actorId: null,
        path: visualPath(`/journal/${zeroTarget.publicSlug}`, "comments-zero"),
        targetKind: "journal_entry",
        targetRef: zeroTarget.publicSlug,
        expectedVisibleIds: [],
        expectedHiddenIds: [],
        expectedItemCount: 0,
        expectedHasNextPage: false,
        expectedStatus: 200,
      }),
      scenario({
        id: "comments-one",
        surface: "journal",
        state: "one",
        actorId: null,
        path: visualPath(`/journal/${oneTarget.publicSlug}`, "comments-one"),
        targetKind: "journal_entry",
        targetRef: oneTarget.publicSlug,
        expectedVisibleIds: [oneComment.id],
        expectedHiddenIds: [],
        expectedItemCount: 1,
        expectedHasNextPage: false,
        expectedStatus: 200,
      }),
      scenario({
        id: "comments-exact-page",
        surface: "journal",
        state: "page",
        actorId: null,
        path: visualPath(
          `/journal/${pageTarget.publicSlug}`,
          "comments-exact-page",
        ),
        targetKind: "journal_entry",
        targetRef: pageTarget.publicSlug,
        expectedVisibleIds: exactPageComments.map((comment) => comment.id),
        expectedHiddenIds: [],
        expectedItemCount: 8,
        expectedHasNextPage: false,
        expectedStatus: 200,
      }),
      scenario({
        id: "comments-page-plus-one",
        surface: "journal",
        state: "page-plus-one",
        actorId: null,
        path: visualPath(
          `/journal/${denseTarget.publicSlug}`,
          "comments-page-plus-one",
        ),
        targetKind: "journal_entry",
        targetRef: denseTarget.publicSlug,
        expectedVisibleIds: denseVisibleIds,
        expectedHiddenIds: [
          denseRoots[3].id,
          denseRoots[9].id,
          ...nestedReplies.map((comment) => comment.id),
        ],
        expectedItemCount: denseVisibleIds.length,
        expectedHasNextPage: true,
        expectedStatus: 200,
      }),
      scenario({
        id: "comments-dense",
        surface: "journal",
        state: "nested-long-moderated",
        actorId: actors[2].id,
        path: visualPath(
          `/journal/${denseTarget.publicSlug}`,
          "comments-dense",
        ),
        targetKind: "journal_entry",
        targetRef: denseTarget.publicSlug,
        expectedVisibleIds: denseVisibleIds,
        expectedHiddenIds: [
          denseRoots[3].id,
          denseRoots[9].id,
          ...nestedReplies.map((comment) => comment.id),
        ],
        expectedItemCount: denseVisibleIds.length,
        expectedHasNextPage: true,
        expectedStatus: 200,
      }),
      scenario({
        id: "comments-blocked",
        surface: "journal",
        state: "blocked",
        actorId: actors[0].id,
        path: visualPath(
          `/journal/${denseTarget.publicSlug}`,
          "comments-blocked",
        ),
        targetKind: "journal_entry",
        targetRef: denseTarget.publicSlug,
        expectedVisibleIds: blockedVisibleIds,
        expectedHiddenIds: [
          denseRoots[8].id,
          denseRoots[3].id,
          nestedReplies[2].id,
        ],
        expectedItemCount: blockedVisibleIds.length,
        expectedHasNextPage: false,
        expectedStatus: 200,
      }),
      scenario({
        id: "comments-closed",
        surface: "journal",
        state: "closed",
        actorId: actors[2].id,
        path: visualPath(
          `/journal/${closedEntry.publicSlug}`,
          "comments-closed",
        ),
        targetKind: "journal_entry",
        targetRef: closedEntry.publicSlug,
        expectedVisibleIds: [],
        expectedHiddenIds: [],
        expectedItemCount: 0,
        expectedHasNextPage: false,
        expectedStatus: 410,
      }),
      scenario({
        id: "feed-dense",
        surface: "feed",
        state: "dense",
        actorId: actors[0].id,
        path: "/feed?visualSocial=feed-dense",
        targetKind: null,
        targetRef: null,
        expectedVisibleIds: followedEntries
          .slice(0, 12)
          .map((entry) => entry.id),
        expectedHiddenIds: publicActiveEntries
          .filter((entry) => entry.ownerUserId === actors[1].id)
          .map((entry) => entry.id),
        expectedItemCount: 12,
        expectedHasNextPage: true,
        expectedStatus: 200,
      }),
      scenario({
        id: "notifications-dense",
        surface: "notifications",
        state: "dense",
        actorId: actors[0].id,
        path: "/notifications?visualSocial=notifications-dense",
        targetKind: null,
        targetRef: null,
        expectedVisibleIds: expectedNotificationKeys,
        expectedHiddenIds: [
          fixtureNotificationEventKey("comment", oneComment.id),
        ],
        expectedItemCount: 12,
        expectedHasNextPage: true,
        expectedStatus: 200,
      }),
      scenario({
        id: "notifications-individual",
        surface: "notifications",
        state: "individual",
        actorId: actors[0].id,
        path: "/notifications?visualSocial=notifications-individual&view=individual",
        targetKind: null,
        targetRef: null,
        expectedVisibleIds: expectedNotificationKeys,
        expectedHiddenIds: [],
        expectedItemCount: 12,
        expectedHasNextPage: true,
        expectedStatus: 200,
      }),
      scenario({
        id: "notifications-grouped",
        surface: "notifications",
        state: "grouped",
        actorId: actors[0].id,
        path: "/notifications?visualSocial=notifications-grouped&view=grouped",
        targetKind: null,
        targetRef: null,
        expectedVisibleIds: expectedNotificationKeys,
        expectedHiddenIds: [],
        expectedItemCount: 12,
        expectedHasNextPage: true,
        expectedStatus: 200,
      }),
      scenario({
        id: "notifications-empty",
        surface: "notifications",
        state: "empty",
        actorId: actors[4].id,
        path: "/notifications?visualSocial=notifications-empty",
        targetKind: null,
        targetRef: null,
        expectedVisibleIds: [],
        expectedHiddenIds: expectedNotificationKeys,
        expectedItemCount: 0,
        expectedHasNextPage: false,
        expectedStatus: 200,
      }),
      scenario({
        id: "bookmarks-dense",
        surface: "bookmarks",
        state: "dense",
        actorId: actors[0].id,
        path: "/bookmarks?visualSocial=bookmarks-dense",
        targetKind: null,
        targetRef: null,
        expectedVisibleIds: visibleBookmarkRefs,
        expectedHiddenIds: [blockedEntry.publicSlug!],
        expectedItemCount: visibleBookmarkRefs.length,
        expectedHasNextPage: true,
        expectedStatus: 200,
      }),
      scenario({
        id: "bookmarks-empty",
        surface: "bookmarks",
        state: "empty",
        actorId: actors[4].id,
        path: "/bookmarks?visualSocial=bookmarks-empty",
        targetKind: null,
        targetRef: null,
        expectedVisibleIds: [],
        expectedHiddenIds: visibleBookmarkRefs,
        expectedItemCount: 0,
        expectedHasNextPage: false,
        expectedStatus: 200,
      }),
      scenario({
        id: "wishlist-dense",
        surface: "wishlist",
        state: "dense",
        actorId: actors[0].id,
        path: "/wishlist?visualSocial=wishlist-dense",
        targetKind: null,
        targetRef: null,
        expectedVisibleIds: selectableCatalogItems
          .slice(0, 13)
          .map((item) => item.publicSlug),
        expectedHiddenIds: [],
        expectedItemCount: 13,
        expectedHasNextPage: true,
        expectedStatus: 200,
      }),
    ],
    transitions: [
      socialTransition(
        "comment",
        actors[4],
        denseTarget.publicSlug!,
        "none",
        "active",
        "actor-final",
      ),
      socialTransition(
        "reply",
        actors[4],
        nestedRoot.id,
        "none",
        "active",
        "actor-final",
      ),
      socialTransition(
        "follow",
        actors[0],
        followedObject.id,
        "removed",
        "active",
        "reversible",
      ),
      socialTransition(
        "bookmark",
        actors[0],
        ownerEntries[0].publicSlug!,
        "removed",
        "active",
        "reversible",
      ),
      socialTransition(
        "delete",
        actors[3],
        denseRoots[7].id,
        "active",
        "deleted",
        "actor-final",
      ),
      socialTransition(
        "report",
        actors[2],
        denseRoots[4].id,
        "none",
        "submitted",
        "actor-final",
      ),
      socialTransition(
        "block",
        actors[0],
        actors[1].id,
        "none",
        "active",
        "reversible",
      ),
      socialTransition(
        "notification_receipt",
        actors[0],
        expectedNotificationKeys[0],
        "unread",
        "read",
        "reversible",
      ),
    ],
  };
}

function socialFollow(
  index: number,
  actor: VisualFixtureActor,
  targetKind: VisualFixtureEngagementFollow["targetKind"],
  targetRef: string,
  state: VisualFixtureEngagementFollow["state"],
): VisualFixtureEngagementFollow {
  return {
    id: fixtureUuid(23, index),
    followerUserId: actor.id,
    targetKind,
    targetRef,
    state,
    createdAt: timestampForIndex(900 + index),
  };
}

function socialBookmark(
  index: number,
  actor: VisualFixtureActor,
  targetKind: VisualFixtureSocialTargetKind,
  targetRef: string,
  state: VisualFixtureEngagementBookmark["state"],
): VisualFixtureEngagementBookmark {
  return {
    id: fixtureUuid(22, index),
    ownerUserId: actor.id,
    targetKind,
    targetRef,
    state,
    createdAt: timestampForIndex(920 + index),
  };
}

function socialTransition(
  action: VisualFixtureSocialTransition["action"],
  actor: VisualFixtureActor,
  targetId: string,
  from: string,
  to: string,
  finality: VisualFixtureSocialTransition["finality"],
): VisualFixtureSocialTransition {
  return { action, actorId: actor.id, targetId, from, to, finality };
}

function fixtureNotificationEventKey(kind: string, sourceId: string) {
  return createHash("sha256")
    .update(`overgarden-notification:${kind}:${sourceId}`)
    .digest("hex")
    .slice(0, 32);
}

function localizedFixtureProfilePath(actor: VisualFixtureActor) {
  const prefix = actor.locale === "uk" ? "" : `/${actor.locale}`;
  return `${prefix}/@${actor.handle}`;
}

function buildJournalEntryEvidence(): VisualFixtureJournalEntryEvidence {
  const publicActive = entries.filter(
    (entry) =>
      entry.visibility === "public" &&
      entry.lifecycleState === "active" &&
      entry.publicGoneAt === null &&
      entry.publicSlug !== null,
  );
  const mediaByEntry = Object.groupBy(media, (item) => item.entryId);
  const requireEntry = (
    label: string,
    predicate: (entry: VisualFixtureEntry) => boolean,
  ) => {
    const entry = entries.find(predicate);
    if (!entry?.publicSlug) {
      throw new Error(`Visual fixture journal evidence ${label} is missing.`);
    }
    return entry;
  };
  const entryWithMedia = (
    label: string,
    predicate: (item: VisualFixtureMedia) => boolean,
  ) => {
    const item = media.find(predicate);
    return requireEntry(label, (entry) => entry.id === item?.entryId);
  };
  const objectEntries = (objectId: string) =>
    publicActive
      .filter(
        (entry) => entry.entryScope === "object" && entry.objectId === objectId,
      )
      .sort(compareJournalChronology);

  const denseChronology = objectEntries(objects[0].id);
  const newestDense = denseChronology[0];
  const oldestDense = denseChronology.at(-1);
  if (!newestDense || !oldestDense) {
    throw new Error("Visual fixture journal chronology evidence is missing.");
  }

  const gallery = requireEntry(
    "gallery",
    (entry) => (mediaByEntry[entry.id]?.length ?? 0) > 1,
  );
  const longEntry = requireEntry(
    "long",
    (entry) =>
      entry.entryScope === "object" &&
      entry.visibility === "public" &&
      entry.lifecycleState === "active" &&
      entry.body.length > 800,
  );
  const shortEntry = requireEntry(
    "short",
    (entry) =>
      entry.entryScope === "object" &&
      entry.visibility === "public" &&
      entry.lifecycleState === "active" &&
      entry.body.length < 180 &&
      !mediaByEntry[entry.id],
  );
  const portrait = entryWithMedia(
    "portrait",
    (item) =>
      item.aspect === "portrait_3_4" &&
      (mediaByEntry[item.entryId]?.length ?? 0) === 1,
  );
  const landscape = entryWithMedia(
    "landscape",
    (item) =>
      item.aspect === "landscape_4_3" &&
      (mediaByEntry[item.entryId]?.length ?? 0) === 1 &&
      objectKindForEntryId(item.entryId) === "plant",
  );
  const animal = entryWithMedia(
    "animal",
    (item) =>
      objectKindForEntryId(item.entryId) === "animal" &&
      (mediaByEntry[item.entryId]?.length ?? 0) === 1,
  );
  const bee = entryWithMedia(
    "bee",
    (item) =>
      objectKindForEntryId(item.entryId) === "bee_colony" &&
      item.aspect === "square",
  );
  const hidden = requireEntry(
    "hidden location",
    (entry) =>
      entry.entryScope === "object" &&
      entry.visibility === "public" &&
      entry.lifecycleState === "active" &&
      entry.objectId !== null &&
      objects.find((object) => object.id === entry.objectId)
        ?.locationVisibility === "hidden",
  );
  const privateEntry = requireEntry(
    "private",
    (entry) => entry.visibility === "private" && entry.publicSlug !== null,
  );
  const removedEntry = requireEntry(
    "gone",
    (entry) => entry.publicGoneAt !== null,
  );
  const differentReader = actors.find((actor) => actor.id !== bee.ownerUserId);
  if (!differentReader) {
    throw new Error("Visual fixture authenticated reader is missing.");
  }

  const activeScenario = (
    id: string,
    entry: VisualFixtureEntry,
    access: VisualFixtureJournalEntryAccess,
    locale: VisualFixtureLocale = entry.locale,
  ): VisualFixtureJournalEntryScenarioEvidence => {
    const relatedChronology = publicActive
      .filter((candidate) =>
        entry.entryScope === "object"
          ? candidate.entryScope === "object" &&
            candidate.objectId === entry.objectId
          : candidate.entryScope === "space" &&
            candidate.spaceId === entry.spaceId,
      )
      .sort(compareJournalChronology);
    const position = relatedChronology.findIndex(
      (candidate) => candidate.id === entry.id,
    );
    const entryMedia = mediaByEntry[entry.id] ?? [];
    const object = entry.objectId
      ? objects.find((candidate) => candidate.id === entry.objectId)
      : null;

    return {
      id,
      access,
      sessionActorId:
        access === "guest"
          ? null
          : access === "owner"
            ? entry.ownerUserId
            : differentReader.id,
      ownerActorId: entry.ownerUserId,
      entryId: entry.id,
      publicSlug: entry.publicSlug!,
      path: localizedJournalEntryPath(locale, entry.publicSlug!),
      expectedStatus: 200,
      contextKind: entry.entryScope,
      objectKind: object?.objectKind ?? null,
      contentLength: journalContentLength(entry.body),
      mediaState: journalMediaState(entryMedia),
      expectedMediaCount: entryMedia.length,
      expectedMentionCount: objectMentions.filter(
        (mention) => mention.journalEntryId === entry.id,
      ).length,
      expectedNewer: position > 0,
      expectedOlder: position >= 0 && position < relatedChronology.length - 1,
      viewportTargets: ["desktop", "mobile-320"],
    };
  };
  const unavailableScenario = (
    id: string,
    entry: VisualFixtureEntry | null,
    publicSlug: string,
    expectedStatus: 404 | 410,
    locale: VisualFixtureLocale,
  ): VisualFixtureJournalEntryScenarioEvidence => {
    const object = entry?.objectId
      ? objects.find((candidate) => candidate.id === entry.objectId)
      : null;
    return {
      id,
      access: "guest",
      sessionActorId: null,
      ownerActorId: entry?.ownerUserId ?? null,
      entryId: entry?.id ?? null,
      publicSlug,
      path: localizedJournalEntryPath(locale, publicSlug),
      expectedStatus,
      contextKind: entry?.entryScope ?? "object",
      objectKind: object?.objectKind ?? null,
      contentLength: entry ? journalContentLength(entry.body) : "normal",
      mediaState: "none",
      expectedMediaCount: 0,
      expectedMentionCount: 0,
      expectedNewer: false,
      expectedOlder: false,
      viewportTargets: ["desktop", "mobile-320"],
    };
  };

  return {
    maxPublicMedia: 6,
    scenarios: [
      activeScenario("recent-mixed-gallery", gallery, "guest", "uk"),
      activeScenario("backdated-long", longEntry, "guest", "uk"),
      activeScenario("short-no-media", shortEntry, "guest", "bg"),
      activeScenario("portrait-media", portrait, "guest", "bg"),
      activeScenario("landscape-media", landscape, "guest", "bg"),
      activeScenario("animal-journal", animal, "guest", "uk"),
      activeScenario("bee-square-media", bee, "guest", "ru"),
      activeScenario("safe-region", newestDense, "guest", "uk"),
      activeScenario("hidden-region", hidden, "guest", "uk"),
      activeScenario("authenticated-reader", bee, "authenticated-reader", "ru"),
      activeScenario("owner-controls", gallery, "owner", "uk"),
      activeScenario("space-multi-object", spaceJournalEntry!, "guest", "uk"),
      activeScenario("chronology-first", newestDense, "guest", "uk"),
      activeScenario("chronology-last", oldestDense, "guest", "uk"),
      unavailableScenario(
        "private-404",
        privateEntry,
        privateEntry.publicSlug!,
        404,
        "bg",
      ),
      unavailableScenario(
        "gone-410",
        removedEntry,
        removedEntry.publicSlug!,
        410,
        "uk",
      ),
      unavailableScenario(
        "missing-404",
        null,
        "visual-fixtures-missing-journal-v2",
        404,
        "ru",
      ),
    ],
  };
}

function compareJournalChronology(
  left: VisualFixtureEntry,
  right: VisualFixtureEntry,
) {
  return (
    right.entryDate.localeCompare(left.entryDate) ||
    right.createdAt.localeCompare(left.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function objectKindForEntryId(entryId: string) {
  const entry = entries.find((candidate) => candidate.id === entryId);
  return entry?.objectId
    ? (objects.find((object) => object.id === entry.objectId)?.objectKind ??
        null)
    : null;
}

function journalContentLength(
  body: string,
): VisualFixtureJournalEntryContentLength {
  if (body.length < 180) return "short";
  if (body.length > 800) return "long";
  return "normal";
}

function journalMediaState(
  entryMedia: readonly VisualFixtureMedia[],
): VisualFixtureJournalEntryMediaState {
  if (entryMedia.length === 0) return "none";
  if (entryMedia.length > 1) return "mixed-gallery";
  if (entryMedia[0]?.aspect === "square") return "square";
  if (entryMedia[0]?.aspect === "portrait_3_4") return "portrait";
  return "landscape";
}

function localizedJournalEntryPath(
  locale: VisualFixtureLocale,
  publicSlug: string,
) {
  const base = `/journal/${publicSlug}`;
  return locale === "uk" ? base : `/${locale}${base}`;
}

function buildPassportEvidence(): VisualFixturePassportEvidence {
  const specs = [
    ["public-plant-typical", "guest-public", 1, 200],
    ["public-plant-dense", "guest-public", 0, 200],
    ["public-plant-long-name", "guest-public", 16, 200],
    ["public-animal-typical", "guest-public", 18, 200],
    ["public-bee-typical", "guest-public", 26, 200],
    ["public-plant-provisional", "guest-public", 3, 200],
    ["public-bee-unknown", "guest-public", 28, 200],
    ["public-bee-mixed-history", "guest-public", 29, 200],
    ["public-unpublished", "guest-public", 17, 404],
    ["public-gone", "guest-public", 25, 410],
    ["owner-empty", "signed-in-owner", 17, 200],
    ["owner-plant-dense", "signed-in-owner", 0, 200],
    ["owner-animal-typical", "signed-in-owner", 18, 200],
    ["owner-bee-archived", "signed-in-owner", 29, 200],
  ] as const satisfies readonly (readonly [
    string,
    VisualFixturePassportAccess,
    number,
    200 | 404 | 410,
  ])[];

  return {
    timelinePreviewSize: 5,
    maxPublicTimeline: 40,
    scenarios: specs.map(([id, access, objectIndex, expectedStatus]) => {
      const object = objects[objectIndex];
      if (!object) {
        throw new Error(`Passport evidence object ${objectIndex} is missing.`);
      }
      const timelineEntries =
        expectedStatus === 200
          ? passportTimelineEntries(object.id, access)
          : [];
      const entryIds = new Set(timelineEntries.map((entry) => entry.id));
      const expectedMediaAspects = media
        .filter((item) => entryIds.has(item.entryId))
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id),
        )
        .map((item) => item.aspect);

      return {
        id,
        access,
        objectId: object.id,
        ownerActorId: object.ownerUserId,
        path:
          access === "signed-in-owner"
            ? `/garden/objects/${object.id}`
            : `/lineage/objects/${object.id}`,
        expectedStatus,
        objectKind: object.objectKind,
        identityState: passportIdentityState(object),
        mediaState:
          expectedMediaAspects.length === 0
            ? "none"
            : expectedMediaAspects.length === 1
              ? "cover"
              : "gallery",
        timelineState:
          timelineEntries.length === 0
            ? "empty"
            : timelineEntries.length === 1
              ? "one"
              : timelineEntries.length > 5
                ? "dense"
                : "typical",
        expectedTimelineCount: timelineEntries.length,
        expectedTimelineEntryIds: timelineEntries.map((entry) => entry.id),
        expectedMediaAspects,
        viewportTargets: ["desktop", "mobile-320"],
      };
    }),
  };
}

function passportTimelineEntries(
  objectId: string,
  access: VisualFixturePassportAccess,
) {
  return entries
    .filter(
      (entry) =>
        (entry.objectId === objectId ||
          (access === "signed-in-owner" &&
            entry.entryScope === "space" &&
            objectMentions.some(
              (mention) =>
                mention.journalEntryId === entry.id &&
                mention.objectId === objectId,
            ))) &&
        (access === "signed-in-owner" ||
          (entry.visibility === "public" &&
            entry.lifecycleState === "active" &&
            entry.publicGoneAt === null &&
            entry.publicSlug !== null)),
    )
    .sort(
      (left, right) =>
        right.entryDate.localeCompare(left.entryDate) ||
        right.createdAt.localeCompare(left.createdAt) ||
        left.id.localeCompare(right.id),
    );
}

function passportIdentityState(
  object: VisualFixtureObject,
): VisualFixturePassportIdentityState {
  if (object.catalogItemId && object.varietyState === "selected") {
    return "confirmed";
  }
  if (
    object.varietyState === "user_added" ||
    object.varietyState === "free_text"
  ) {
    return "provisional";
  }
  return "unknown";
}

function buildKnowledgeEvidence(): VisualFixtureKnowledgeEvidence {
  const denseRule = knowledgeRule(["care-checks"], []);
  const typicalRule = knowledgeRule(["seasonal-care"], []);
  const emptyRule = knowledgeRule(["quiet-evidence"], []);
  const recoveryRule = knowledgeRule(["stress-and-recovery"], []);
  const oneRule = knowledgeRule(["single-observation"], []);
  const catalogRule = knowledgeRule([], ["visual-pomidor-cheri"]);
  const editorial: VisualFixtureKnowledgeEditorial = {
    author: "OverGarden visual fixture",
    source: "Synthetic OVE-177 visual fixture. Not expert guidance.",
    updatedDate: "2026-07-10",
    synthetic: true,
  };

  const guides: readonly VisualFixtureKnowledgeGuide[] = [
    {
      kind: "guide",
      slug: "visual-seasonal-observation",
      path: "/guides/visual-seasonal-observation",
      task: "compare-two-dated-observations",
      objectKinds: ["plant", "animal", "bee_colony"],
      editorial,
      evidence: denseRule,
      mediaId: media[0]?.id ?? null,
      translations: {
        uk: {
          title: "Як порівняти два спостереження без зайвих припущень",
          description:
            "Синтетичний приклад структури, у якій одна зміна перевіряється за датованим журналом і повторним спостереженням.",
          outcome:
            "Після проходження видно, що саме змінилося між двома датами, а що лишилося лише припущенням автора запису.",
          steps: [
            {
              title: "Оберіть одну ознаку",
              body: "Порівнюйте лише те, що можна назвати однаково в обох записах: стан листя, активність тварини, сила сім'ї або інший видимий сигнал.",
            },
            {
              title: "Звірте дати і контекст",
              body: "Перевірте інтервал між спостереженнями та зафіксовані дії. Не додавайте пояснень, яких немає в самому журналі.",
            },
            {
              title: "Відокремте факт від тлумачення",
              body: "Фотографія, вимір і повторюваний опис є спостереженнями. Причина зміни залишається версією, доки її не підтримує наступний запис.",
            },
            {
              title: "Залиште перевірюваний наступний крок",
              body: "Сформулюйте одну наступну перевірку, щоб новий запис міг підтвердити або спростувати попередню версію.",
            },
          ],
        },
        bg: {
          title: "Как да сравните две наблюдения без излишни предположения",
          description:
            "Синтетичен пример за структура, в която една промяна се проверява чрез датиран дневник и повторно наблюдение.",
          outcome:
            "Накрая се вижда какво действително се е променило между две дати и какво остава само предположение.",
          steps: [
            {
              title: "Изберете един признак",
              body: "Сравнявайте само признак, който може да бъде назован еднакво и в двата записа: листа, активност, сила на семейство или друг видим сигнал.",
            },
            {
              title: "Сверете датите и контекста",
              body: "Проверете интервала и записаните действия, без да добавяте обяснения, които липсват в дневника.",
            },
            {
              title: "Разделете факт от тълкуване",
              body: "Снимка, измерване и повторяемо описание са наблюдения. Причината остава версия до следващото потвърждение.",
            },
            {
              title: "Оставете проверима следваща стъпка",
              body: "Формулирайте една проверка, която следващият запис може да потвърди или отхвърли.",
            },
          ],
        },
        ru: {
          title: "Как сравнить два наблюдения без лишних предположений",
          description:
            "Синтетический пример структуры, где одно изменение проверяется датированным журналом и повторным наблюдением.",
          outcome:
            "В конце видно, что действительно изменилось между двумя датами, а что осталось лишь предположением.",
          steps: [
            {
              title: "Выберите один признак",
              body: "Сравнивайте только признак, который можно одинаково назвать в обеих записях: состояние листьев, активность, силу семьи или другой видимый сигнал.",
            },
            {
              title: "Сверьте даты и контекст",
              body: "Проверьте интервал и записанные действия, не добавляя объяснений, которых нет в журнале.",
            },
            {
              title: "Отделите факт от толкования",
              body: "Фотография, измерение и повторяемое описание являются наблюдениями. Причина остаётся версией до следующей проверки.",
            },
            {
              title: "Оставьте проверяемый следующий шаг",
              body: "Сформулируйте одну проверку, которую следующая запись сможет подтвердить или опровергнуть.",
            },
          ],
        },
      },
    },
    {
      kind: "guide",
      slug: "visual-routine-across-living-objects",
      path: "/guides/visual-routine-across-living-objects",
      task: "build-a-repeatable-care-check",
      objectKinds: ["plant", "animal", "bee_colony"],
      editorial,
      evidence: typicalRule,
      mediaId: null,
      translations: {
        uk: {
          title: "Одна коротка перевірка для різних живих об'єктів",
          description:
            "Синтетичний насичений сценарій для рослин, тварин і бджолосімей без удаваної універсальної поради.",
          outcome:
            "Кожен об'єкт отримує власний спостережуваний сигнал, але журнал зберігає однаковий ритм повернення.",
          steps: [
            {
              title: "Назвіть об'єкт",
              body: "Почніть із конкретного живого об'єкта, а не загальної категорії.",
            },
            {
              title: "Оберіть видимий сигнал",
              body: "Запишіть лише те, що можна повторно перевірити без припущень.",
            },
            {
              title: "Призначте повернення",
              body: "Визначте наступну дату перевірки відповідно до реального ритму догляду.",
            },
          ],
        },
        bg: {
          title: "Една кратка проверка за различни живи обекти",
          description:
            "Синтетичен плътен сценарий за растения, животни и пчелни семейства без привидно универсален съвет.",
          outcome:
            "Всеки обект има собствен наблюдаем сигнал, а дневникът запазва общ ритъм на връщане.",
          steps: [
            {
              title: "Назовете обекта",
              body: "Започнете с конкретен жив обект, не с обща категория.",
            },
            {
              title: "Изберете видим сигнал",
              body: "Запишете само това, което може да бъде проверено отново.",
            },
            {
              title: "Определете връщане",
              body: "Изберете следваща дата според реалния ритъм на грижата.",
            },
          ],
        },
        ru: {
          title: "Одна короткая проверка для разных живых объектов",
          description:
            "Синтетический плотный сценарий для растений, животных и пчелиных семей без мнимого универсального совета.",
          outcome:
            "У каждого объекта остаётся свой наблюдаемый сигнал, а у журнала общий ритм возврата.",
          steps: [
            {
              title: "Назовите объект",
              body: "Начните с конкретного живого объекта, а не общей категории.",
            },
            {
              title: "Выберите видимый сигнал",
              body: "Запишите только то, что можно повторно проверить.",
            },
            {
              title: "Назначьте возврат",
              body: "Выберите следующую дату по реальному ритму ухода.",
            },
          ],
        },
      },
    },
    {
      kind: "guide",
      slug: "visual-honest-empty-evidence",
      path: "/guides/visual-honest-empty-evidence",
      task: "recognize-an-evidence-gap",
      objectKinds: ["plant"],
      editorial,
      evidence: emptyRule,
      mediaId: null,
      translations: {
        uk: {
          title: "Що робити, коли пов'язаних журналів ще немає",
          description:
            "Синтетичний порожній стан, який не підміняє відсутній досвід вигаданими прикладами.",
          outcome:
            "Користувач бачить межу матеріалу та може повернутися до теми, коли з'являться реальні записи.",
          steps: [
            {
              title: "Перевірте межу",
              body: "Відсутність пов'язаних журналів означає лише відсутність публічного доказу за цим правилом.",
            },
            {
              title: "Не узагальнюйте",
              body: "Не перетворюйте один авторський орієнтир на твердження про всі об'єкти.",
            },
          ],
        },
        bg: {
          title: "Какво да направите, когато още няма свързани дневници",
          description:
            "Синтетично празно състояние, което не заменя липсващия опит с измислени примери.",
          outcome:
            "Потребителят вижда границата на материала и може да се върне при появата на реални записи.",
          steps: [
            {
              title: "Проверете границата",
              body: "Липсата на дневници означава само липса на публично доказателство по това правило.",
            },
            {
              title: "Не обобщавайте",
              body: "Не превръщайте един авторски ориентир в твърдение за всички обекти.",
            },
          ],
        },
        ru: {
          title: "Что делать, когда связанных журналов ещё нет",
          description:
            "Синтетическое пустое состояние, которое не заменяет отсутствующий опыт вымышленными примерами.",
          outcome:
            "Пользователь видит границу материала и может вернуться после появления реальных записей.",
          steps: [
            {
              title: "Проверьте границу",
              body: "Отсутствие журналов означает только отсутствие публичного доказательства по этому правилу.",
            },
            {
              title: "Не обобщайте",
              body: "Не превращайте один авторский ориентир в утверждение обо всех объектах.",
            },
          ],
        },
      },
    },
  ];

  const answers: readonly VisualFixtureKnowledgeAnswer[] = [
    {
      kind: "answer",
      slug: "visual-long-recovery-answer",
      path: "/answers/visual-long-recovery-answer",
      task: "review-a-long-recovery-sequence",
      objectKinds: ["plant", "animal", "bee_colony"],
      editorial,
      evidence: recoveryRule,
      mediaId: null,
      translations: {
        uk: {
          question: "Як читати довгу історію відновлення живого об'єкта?",
          title: "Як читати довгу історію відновлення живого об'єкта?",
          description:
            "Синтетична довга відповідь для перевірки ієрархії, перенесення тексту та переходу до реальних журналів.",
          conciseAnswer:
            "Почніть не з останнього позитивного запису, а з першої датованої зміни, після якої автор почав говорити про відновлення. Потім складіть послідовність із фактів: що було видно, яку одну дію зафіксували, коли з'явилося наступне спостереження і чи повторився результат. Не вважайте часовий збіг доведеною причиною. Якщо між записами змінювалися одразу кілька умов, журнал показує перебіг подій, але не дозволяє чесно приписати результат одній із них. Окремо перевірте, чи є невдалий або нейтральний повторний запис: саме він часто робить історію кориснішою за гладку розповідь про успіх. Наприкінці сформулюйте межу висновку одним реченням, щоб інший користувач міг порівняти власний об'єкт без копіювання чужого рішення.",
          proofDetails: [
            "Знайдіть перший запис із чіткою датою та спостережуваною зміною.",
            "Випишіть кожну зафіксовану дію окремо від припущення автора.",
            "Перевірте інтервали між записами й пропуски у спостереженнях.",
            "Шукайте нейтральний, негативний або суперечливий повторний запис.",
            "Порівнюйте лише об'єкти та умови, описані з достатньою ясністю.",
          ],
          faqs: [
            {
              question: "Чи останній запис є підсумком?",
              answer:
                "Лише якщо автор явно повернувся до попередньої зміни й описав результат, а не просто додав нову подію.",
            },
            {
              question: "Чи можна повторити зафіксовану дію?",
              answer:
                "Журнал показує досвід конкретного об'єкта. Він не перетворює дію на універсальну рекомендацію.",
            },
            {
              question: "Що робити з пропущеними датами?",
              answer:
                "Позначте прогалину як невідомий період і не домислюйте, що відбувалося між записами.",
            },
            {
              question: "Навіщо читати кілька журналів?",
              answer:
                "Різні перебіги подій допомагають побачити межі схожості та не прийняти одиничний результат за правило.",
            },
          ],
        },
        bg: {
          question: "Как да прочетете дълга история на възстановяване?",
          title: "Как да прочетете дълга история на възстановяване?",
          description:
            "Синтетичен дълъг отговор за проверка на йерархията, пренасянето на текст и прехода към реални дневници.",
          conciseAnswer:
            "Започнете от първата датирана промяна, а не от последния положителен запис. Подредете видимите факти, записаното действие, следващото наблюдение и резултата. Времевото съвпадение не доказва причина. Ако са променени няколко условия, дневникът показва хода на събитията, но не доказва кое е довело до резултата. Потърсете и неутрален или неуспешен последващ запис, защото той показва границата на историята.",
          proofDetails: [
            "Намерете първия запис с ясна дата.",
            "Отделете действията от предположенията.",
            "Проверете интервалите и липсващите наблюдения.",
            "Потърсете противоречив последващ запис.",
            "Сравнявайте само ясно описани условия.",
          ],
          faqs: [
            {
              question: "Последният запис ли е извод?",
              answer:
                "Само ако се връща към предишната промяна и описва резултата.",
            },
            {
              question: "Може ли действието да се повтори?",
              answer:
                "Това е опит с конкретен обект, не универсална препоръка.",
            },
            {
              question: "Какво означават пропуснатите дати?",
              answer:
                "Те остават неизвестен период, който не трябва да се измисля.",
            },
            {
              question: "Защо са нужни няколко дневника?",
              answer:
                "Те показват границите на сходството между отделни случаи.",
            },
          ],
        },
        ru: {
          question: "Как читать длинную историю восстановления?",
          title: "Как читать длинную историю восстановления?",
          description:
            "Синтетический длинный ответ для проверки иерархии, переноса текста и перехода к реальным журналам.",
          conciseAnswer:
            "Начните с первого датированного изменения, а не с последней положительной записи. Соберите последовательность видимых фактов, записанного действия, следующего наблюдения и результата. Совпадение по времени не доказывает причину. Если одновременно менялись несколько условий, журнал показывает ход событий, но не доказывает, какое из них привело к результату. Найдите нейтральную или неудачную повторную запись: она показывает границу истории и помогает не принять единичный опыт за универсальное правило.",
          proofDetails: [
            "Найдите первую запись с ясной датой.",
            "Отделите действия от предположений.",
            "Проверьте интервалы и пропуски.",
            "Ищите противоречивую повторную запись.",
            "Сравнивайте только ясно описанные условия.",
          ],
          faqs: [
            {
              question: "Последняя запись является итогом?",
              answer:
                "Только если она возвращается к прежнему изменению и описывает результат.",
            },
            {
              question: "Можно повторить действие?",
              answer:
                "Это опыт конкретного объекта, а не универсальная рекомендация.",
            },
            {
              question: "Что означают пропущенные даты?",
              answer:
                "Они остаются неизвестным периодом, который нельзя додумывать.",
            },
            {
              question: "Зачем читать несколько журналов?",
              answer:
                "Они показывают границы сходства между отдельными случаями.",
            },
          ],
        },
      },
    },
    {
      kind: "answer",
      slug: "visual-single-observation-answer",
      path: "/answers/visual-single-observation-answer",
      task: "interpret-one-public-observation",
      objectKinds: ["plant"],
      editorial,
      evidence: oneRule,
      mediaId: null,
      translations: {
        uk: answerTranslation(
          "Що можна сказати за одним датованим спостереженням?",
          "Одне спостереження підтверджує лише стан конкретного об'єкта в конкретний момент. Воно ще не показує напрям зміни або повторюваність.",
          "uk",
        ),
        bg: answerTranslation(
          "Какво може да се каже от едно датирано наблюдение?",
          "Едно наблюдение потвърждава само състоянието на конкретния обект в конкретен момент. То още не показва посока или повторяемост.",
          "bg",
        ),
        ru: answerTranslation(
          "Что можно сказать по одному датированному наблюдению?",
          "Одно наблюдение подтверждает только состояние конкретного объекта в конкретный момент. Оно ещё не показывает направление или повторяемость.",
          "ru",
        ),
      },
    },
    {
      kind: "answer",
      slug: "visual-catalog-comparison-answer",
      path: "/answers/visual-catalog-comparison-answer",
      task: "compare-records-with-shared-catalog-identity",
      objectKinds: ["plant"],
      editorial,
      evidence: catalogRule,
      mediaId: null,
      translations: {
        uk: answerTranslation(
          "Навіщо порівнювати журнали зі спільною ідентичністю?",
          "Спільна каталогова ідентичність звужує порівняння, але не робить умови вирощування однаковими. Дати й контекст кожного журналу залишаються обов'язковими.",
          "uk",
        ),
        bg: answerTranslation(
          "Защо да сравнявате дневници с обща идентичност?",
          "Общата каталожна идентичност стеснява сравнението, но не прави условията еднакви. Датите и контекстът на всеки дневник остават задължителни.",
          "bg",
        ),
        ru: answerTranslation(
          "Зачем сравнивать журналы с общей идентичностью?",
          "Общая каталоговая идентичность сужает сравнение, но не делает условия одинаковыми. Даты и контекст каждого журнала остаются обязательными.",
          "ru",
        ),
      },
    },
  ];

  return {
    guides,
    answers,
    topics: [
      knowledgeTopic("quiet-evidence", "zero"),
      knowledgeTopic("single-observation", "one"),
      knowledgeTopic("seasonal-care", "typical"),
      knowledgeTopic("care-checks", "dense"),
    ],
  };
}

function knowledgeRule(
  topicSlugs: readonly string[],
  catalogSlugs: readonly string[],
): VisualFixtureKnowledgeEvidenceRule {
  const topicIds = new Set(
    topics
      .filter((topic) => topicSlugs.includes(topic.slug))
      .map((topic) => topic.id),
  );
  const topicEntryIds = new Set(
    topicSignals
      .filter((signal) => topicIds.has(signal.topicId))
      .map((signal) => signal.journalEntryId),
  );
  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
  const objectById = new Map(objects.map((object) => [object.id, object]));
  const matchedEntries = publicFeedEligibleEntries
    .filter((entry) => {
      if (topicEntryIds.has(entry.id)) return true;
      const object = entry.objectId ? objectById.get(entry.objectId) : null;
      const catalog = object?.catalogItemId
        ? catalogById.get(object.catalogItemId)
        : null;
      return Boolean(
        catalog &&
        (catalog.status === "seeded" || catalog.status === "confirmed") &&
        catalogSlugs.includes(catalog.publicSlug),
      );
    })
    .sort(compareFeedEntries);

  return {
    topicSlugs,
    catalogSlugs,
    expectedCount: matchedEntries.length,
    expectedEntryIds: matchedEntries.map((entry) => entry.id),
    expectedObjectIds: [
      ...new Set(
        matchedEntries.flatMap((entry) =>
          entry.objectId ? [entry.objectId] : [],
        ),
      ),
    ],
  };
}

function knowledgeTopic(
  slug: string,
  state: VisualFixtureKnowledgeTopicEvidence["state"],
): VisualFixtureKnowledgeTopicEvidence {
  const rule = knowledgeRule([slug], []);
  const objectById = new Map(objects.map((object) => [object.id, object]));
  return {
    slug,
    state,
    objectKinds: [
      ...new Set(
        rule.expectedObjectIds.flatMap((objectId) => {
          const kind = objectById.get(objectId)?.objectKind;
          return kind ? [kind] : [];
        }),
      ),
    ],
    expectedEntryIds: rule.expectedEntryIds,
    expectedObjectIds: rule.expectedObjectIds,
  };
}

function answerTranslation(
  question: string,
  conciseAnswer: string,
  locale: VisualFixtureLocale,
): VisualFixtureKnowledgeAnswerTranslation {
  const chrome = {
    uk: {
      description:
        "Синтетичний тестовий матеріал для перевірки переходу до доказів без експертної претензії.",
      details: [
        "Перевірте дату і конкретний живий об'єкт.",
        "Відокремте спостереження від пояснення автора.",
        "Шукайте наступний запис перед узагальненням.",
      ],
      faqQuestion: "Чи цього достатньо для висновку?",
      faqAnswer:
        "Ні. Це межа одного синтетичного сценарію, а не готова рекомендація.",
      contextQuestion: "Де перевірити контекст?",
      contextAnswer:
        "У пов'язаному публічному журналі та паспорті живого об'єкта.",
    },
    bg: {
      description:
        "Синтетичен тестов материал за проверка на прехода към доказателства без експертна претенция.",
      details: [
        "Проверете датата и конкретния жив обект.",
        "Отделете наблюдението от обяснението на автора.",
        "Потърсете следващ запис преди обобщение.",
      ],
      faqQuestion: "Достатъчно ли е това за извод?",
      faqAnswer:
        "Не. Това е граница на синтетичен сценарий, а не готова препоръка.",
      contextQuestion: "Къде да проверите контекста?",
      contextAnswer: "В свързания публичен дневник и паспорта на живия обект.",
    },
    ru: {
      description:
        "Синтетический тестовый материал для проверки перехода к доказательствам без экспертной претензии.",
      details: [
        "Проверьте дату и конкретный живой объект.",
        "Отделите наблюдение от объяснения автора.",
        "Найдите следующую запись до обобщения.",
      ],
      faqQuestion: "Этого достаточно для вывода?",
      faqAnswer:
        "Нет. Это граница синтетического сценария, а не готовая рекомендация.",
      contextQuestion: "Где проверить контекст?",
      contextAnswer: "В связанном публичном журнале и паспорте живого объекта.",
    },
  }[locale];

  return {
    question,
    title: question,
    description: chrome.description,
    conciseAnswer,
    proofDetails: chrome.details,
    faqs: [
      {
        question: chrome.faqQuestion,
        answer: chrome.faqAnswer,
      },
      {
        question: chrome.contextQuestion,
        answer: chrome.contextAnswer,
      },
    ],
  };
}

function buildJournalDirectoryEvidence(): VisualFixtureJournalDirectoryEvidence {
  const pageSize = 8 as const;
  const objectById = new Map(objects.map((object) => [object.id, object]));
  const topicBySlug = new Map(topics.map((topic) => [topic.slug, topic]));
  const entryIdsByTopic = new Map<string, Set<string>>();

  for (const signal of topicSignals) {
    const topic = topics.find((candidate) => candidate.id === signal.topicId);
    if (!topic) continue;
    const ids = entryIdsByTopic.get(topic.slug) ?? new Set<string>();
    ids.add(signal.journalEntryId);
    entryIdsByTopic.set(topic.slug, ids);
  }

  const forTopic = (slug: string) => {
    if (!topicBySlug.has(slug)) {
      throw new Error(`Visual fixture journal topic ${slug} is missing.`);
    }
    const ids = entryIdsByTopic.get(slug) ?? new Set<string>();
    return sortedPublicDirectoryEntries.filter((entry) => ids.has(entry.id));
  };
  const combinedEntries = sortedPublicDirectoryEntries.filter((entry) => {
    const object = entry.objectId ? objectById.get(entry.objectId) : null;
    return (
      object?.objectKind === "bee_colony" &&
      object.locationVisibility === "region" &&
      object.coarseRegionCode === "BG-23" &&
      fixtureSeason(entry.entryDate) === "summer"
    );
  });
  const correctedQueryEntries = sortedPublicDirectoryEntries.filter((entry) =>
    (entry.objectId ? objectById.get(entry.objectId) : null)?.displayName
      .toLocaleLowerCase("uk")
      .includes("черрі"),
  );
  const sparseEntries = forTopic("watering-and-moisture").filter(
    (entry) =>
      (entry.objectId ? objectById.get(entry.objectId) : null)?.objectKind ===
      "bee_colony",
  );
  const finalPage = Math.max(
    1,
    Math.ceil(sortedPublicDirectoryEntries.length / pageSize),
  );

  return {
    pageSize,
    authoredLocales: ["uk", "bg", "ru"],
    safeRegionCodes: ["UA-30", "BG-22", "BG-23"],
    hiddenRegionEntryCount: sortedPublicDirectoryEntries.filter(
      (entry) =>
        (entry.objectId ? objectById.get(entry.objectId) : null)
          ?.locationVisibility === "hidden",
    ).length,
    queries: [
      journalDirectoryQuery(
        "default",
        "Default recent journals",
        "/journals",
        sortedPublicDirectoryEntries,
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "page-two",
        "Second complete result page",
        "/journals?page=2",
        sortedPublicDirectoryEntries,
        2,
        pageSize,
      ),
      journalDirectoryQuery(
        "page-size-minus-one",
        "Seven watering and moisture journals",
        "/journals?topic=watering-and-moisture",
        forTopic("watering-and-moisture"),
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "page-size",
        "Eight stress and recovery journals",
        "/journals?topic=stress-and-recovery",
        forTopic("stress-and-recovery"),
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "page-size-plus-one",
        "Nine season preparation journals",
        "/journals?topic=season-preparation",
        forTopic("season-preparation"),
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "sparse",
        "Sparse bee-colony topic result",
        "/ru/journals?kind=bee_colony&topic=watering-and-moisture",
        sparseEntries,
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "combined-safe-filters",
        "Bee journals in a public coarse region and summer",
        "/ru/journals?kind=bee_colony&season=summer&region=BG-23",
        combinedEntries,
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "zero-results",
        "No-result recovery",
        "/journals?q=visual-fixture-no-match",
        [],
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "corrected-query",
        "Corrected living-object query",
        "/journals?q=%D0%A7%D0%B5%D1%80%D1%80%D1%96",
        correctedQueryEntries,
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "reset",
        "Reset to default browse",
        "/journals",
        sortedPublicDirectoryEntries,
        1,
        pageSize,
      ),
      journalDirectoryQuery(
        "exhausted",
        "Final result page",
        `/journals?page=${finalPage}`,
        sortedPublicDirectoryEntries,
        finalPage,
        pageSize,
      ),
    ],
  };
}

function journalDirectoryQuery(
  id: string,
  label: string,
  path: string,
  entriesForQuery: readonly VisualFixtureEntry[],
  page: number,
  pageSize: number,
): VisualFixtureJournalDirectoryQueryEvidence {
  const pageEntries = entriesForQuery.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const publicSlugs = pageEntries.map((entry) => {
    if (!entry.publicSlug) {
      throw new Error(`Directory evidence entry ${entry.id} is not public.`);
    }
    return entry.publicSlug;
  });

  return {
    id,
    label,
    path: appendVisualJournalCorpus(path),
    expectedCount: entriesForQuery.length,
    expectedOrderedEntryIds: pageEntries.map((entry) => entry.id),
    expectedOrderedPublicSlugs: publicSlugs,
  };
}

function appendVisualJournalCorpus(path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}__visualJournals=corpus`;
}

function fixtureSeason(entryDate: string) {
  const month = Number(entryDate.slice(5, 7));
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

function journalDirectoryEvidencePath(id: string) {
  const evidence = journalDirectoryEvidence.queries.find(
    (query) => query.id === id,
  );
  if (!evidence) {
    throw new Error(`Visual fixture journal directory case ${id} is missing.`);
  }
  return evidence.path;
}

function passportEvidenceCase(id: string) {
  const evidence = passportEvidence.scenarios.find(
    (scenario) => scenario.id === id,
  );
  if (!evidence) {
    throw new Error(`Visual fixture passport case ${id} is missing.`);
  }
  return evidence;
}

function profileEvidenceCase(id: string) {
  const evidence = profileEvidence.scenarios.find(
    (scenario) => scenario.id === id,
  );
  if (!evidence) {
    throw new Error(`Visual fixture profile case ${id} is missing.`);
  }
  return evidence;
}

function catalogSeed(
  id: string,
  canonicalName: string,
  publicSlug: string,
  catalogKind: VisualFixtureCatalogKind,
  locale: VisualFixtureCatalogLocale,
  status?: VisualFixtureCatalogStatus,
): CatalogSeedSpec {
  return {
    id,
    canonicalName,
    publicSlug,
    catalogKind,
    locale,
    ...(status ? { status } : {}),
  };
}

function normalizeCatalogName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en");
}

function createProfile(
  actor: VisualFixtureActor,
  overrides: Partial<
    Omit<VisualFixtureProfile, "userId" | "handle" | "createdAt">
  > = {},
): VisualFixtureProfile {
  return {
    userId: actor.id,
    handle: actor.handle,
    displayName: actor.displayName,
    avatarMediaAssetId: null,
    bio: null,
    languages: [actor.locale],
    locationVisibility: "hidden",
    coarseRegionCode: null,
    profileVisibility: "public",
    profileLifecycleState: "active",
    relationshipVisibility: "counts",
    removedAt: null,
    createdAt: actor.createdAt,
    ...overrides,
  };
}

function createProfileFollow(
  index: number,
  follower: VisualFixtureActor,
  target: VisualFixtureActor,
  state: "active" | "removed",
): VisualFixtureProfileFollow {
  return {
    id: fixtureUuid(10, index),
    followerUserId: follower.id,
    targetUserId: target.id,
    state,
    createdAt: timestampForIndex(710 + index),
  };
}

function createSpace(
  index: number,
  actor: VisualFixtureActor,
  displayName: string,
  locationVisibility: "hidden" | "region",
  coarseRegionCode: string | null,
): VisualFixtureSpace {
  return {
    id: fixtureUuid(2, index),
    ownerUserId: actor.id,
    displayName,
    locationVisibility,
    coarseRegionCode,
    createdAt: timestampForIndex(index),
  };
}

type VisualFixtureCreationScenarioInput = Pick<
  VisualFixtureCreationScenarioEvidence,
  "flow" | "state" | "label"
> &
  Partial<
    Pick<
      VisualFixtureCreationScenarioEvidence,
      | "objectKind"
      | "objectName"
      | "entryTitle"
      | "entryBody"
      | "entryDate"
      | "catalogQuery"
      | "userAddedCatalogName"
      | "locationVisibility"
      | "coarseRegionCode"
      | "topicTagInput"
      | "mediaFileName"
      | "online"
      | "submitState"
      | "message"
      | "detailsOpen"
    >
  >;

function creationScenario(
  index: number,
  input: VisualFixtureCreationScenarioInput,
): VisualFixtureCreationScenarioEvidence {
  const followUpTargets = [
    objects[0],
    objects[18],
    objects[26],
    objects[17],
    objects[1],
    objects[19],
    objects[27],
    objects[20],
    objects[28],
  ];
  const fixtureObject =
    input.flow === "follow-up" ? followUpTargets[index - 12] : null;
  if (input.flow === "follow-up" && !fixtureObject) {
    throw new Error(`Journal creation target ${index} is missing.`);
  }
  const firstEntryOwner = actors[4];
  const id = `ove182-c${String(index).padStart(3, "0")}`;
  const objectName = input.objectName ?? fixtureObject?.displayName ?? "Object";
  const objectId = fixtureObject?.id ?? null;
  const ownerActorId = fixtureObject?.ownerUserId ?? firstEntryOwner.id;
  const spaceId = fixtureObject?.spaceId ?? null;
  const expectedSpaceId = fixtureObject?.spaceId ?? fixtureUuid(17, index);
  const expectedObjectId = fixtureObject?.id ?? fixtureUuid(18, index);
  const expectedEntryId = fixtureUuid(19, index);
  const expectedServerWrite = !["draft", "offline", "error", "cancel"].includes(
    input.state,
  );
  const expectedMediaAssetIds =
    expectedServerWrite && input.mediaFileName ? [fixtureUuid(20, index)] : [];
  const path =
    input.flow === "first-entry"
      ? `/garden?visualCreate=${id}#first-entry-composer`
      : `/garden/objects/${fixtureObject!.id}?visualCreate=${id}#follow-up-composer`;
  const postSavePath = expectedServerWrite
    ? `/garden/objects/${expectedObjectId}?visualCreateResult=${id}`
    : null;

  return {
    id,
    flow: input.flow,
    state: input.state,
    label: input.label,
    ownerActorId,
    objectId,
    spaceId,
    spaceName:
      input.flow === "first-entry"
        ? `Scenario space ${String(index).padStart(2, "0")}`
        : (spaces.find((space) => space.id === fixtureObject!.spaceId)
            ?.displayName ?? "Fixture space"),
    objectKind: input.objectKind ?? fixtureObject?.objectKind ?? "plant",
    objectName,
    entryTitle: input.entryTitle ?? `Update: ${objectName}`,
    entryBody: input.entryBody ?? "A short useful observation.",
    entryDate: input.entryDate ?? "2026-07-12",
    catalogQuery: input.catalogQuery ?? null,
    userAddedCatalogName: input.userAddedCatalogName ?? null,
    locationVisibility: input.locationVisibility ?? "hidden",
    coarseRegionCode:
      input.locationVisibility === "region"
        ? (input.coarseRegionCode ?? "UA-32")
        : null,
    topicTagInput: input.topicTagInput ?? "",
    mediaFileName: input.mediaFileName ?? null,
    online: input.online ?? true,
    submitState: input.submitState ?? "idle",
    message:
      input.message ??
      "Private by default. You choose later whether an entry becomes public.",
    detailsOpen: input.detailsOpen ?? false,
    path,
    startPath: path,
    payloadClass: `${input.flow}:${input.state}`,
    clientMutationId: `${id}-mutation`,
    preconditionEntryIds: fixtureObject
      ? entries
          .filter((entry) => entry.objectId === fixtureObject.id)
          .map((entry) => entry.id)
      : [],
    expectedSpaceId,
    expectedObjectId,
    expectedEntryId,
    expectedMediaAssetIds,
    expectedServerWrite,
    expectedEntryVisibility: input.state === "publish" ? "public" : "private",
    postSavePath,
    resetOwnedSpaceIds: input.flow === "first-entry" ? [expectedSpaceId] : [],
    resetOwnedObjectIds: input.flow === "first-entry" ? [expectedObjectId] : [],
    resetOwnedEntryIds: [expectedEntryId],
    resetOwnedMediaAssetIds: expectedMediaAssetIds,
    dexieDraftKey:
      input.state === "draft" || input.state === "cancel"
        ? input.flow === "first-entry"
          ? "first-entry"
          : `follow-up-entry:${fixtureObject!.id}`
        : null,
    expectedStatus: 200,
    viewportTargets: ["desktop", "mobile-320"],
  };
}

function scenario(
  suffix: string,
  kind: VisualFixtureScenarioKind,
  label: string,
  path: string,
  expectedStatus: 200 | 404 | 410,
  expectedUiState?: "not_found",
): VisualFixtureScenario {
  return {
    id: `ove187-${suffix}`,
    kind,
    label,
    path,
    expectedStatus,
    ...(expectedUiState ? { expectedUiState } : {}),
    viewportTargets: ["desktop", "mobile-320"],
  };
}

function intentScenario(
  index: number,
  action: AuthIntentAction,
  label: string,
  state: VisualFixtureIntentState,
  returnTo: string,
  target?: AuthIntentTarget,
  tokenMode: VisualFixtureIntentScenario["tokenMode"] = "valid",
  expectedStatus: VisualFixtureIntentScenario["expectedStatus"] = 200,
): VisualFixtureIntentScenario {
  const draft = normalizeAuthIntentDraft({
    action,
    returnTo,
    ...(target ? { target } : {}),
  });
  const id = `ove174-i${String(index).padStart(3, "0")}`;

  return {
    id,
    action,
    label,
    state,
    returnTo: draft.returnTo,
    ...(draft.target ? { target: draft.target } : {}),
    startPath: `/__visual-fixtures/intent/${id}`,
    resumePath: buildAuthIntentResumeHref(draft),
    tokenMode,
    expectedStatus,
    viewportTargets: ["desktop", "mobile-320"],
  };
}

function coverageState(
  kind: VisualFixtureStateKind,
  label: string,
  detail: string,
  count: number,
  access: "public" | "owner",
  path: string | null,
): VisualFixtureStateCoverage {
  return {
    id: `ove187-state-${kind}`,
    kind,
    label,
    detail,
    count,
    access,
    path,
  };
}

function fixtureUuid(group: number, index: number) {
  return `187000${String(group).padStart(2, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function timestampForIndex(index: number) {
  return new Date(Date.UTC(2026, 0, 5, 9, index)).toISOString();
}

function dateDaysBefore(days: number) {
  const date = new Date(Date.UTC(2026, 6, 10));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function slugPart(value: string) {
  const normalized = value
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42)
    .replace(/-+$/g, "");
  return normalized || "living-object";
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checkCount(
  errors: string[],
  label: string,
  actual: number,
  expected: number,
) {
  if (actual !== expected) {
    errors.push(`${label} expected ${expected}, received ${actual}.`);
  }
}

function checkUnique(errors: string[], label: string, values: string[]) {
  if (new Set(values).size !== values.length) {
    errors.push(`${label} must be unique.`);
  }
}
