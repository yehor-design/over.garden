import type { Insertable, Selectable } from "kysely";

import type {
  DB,
  AdminRoleAuditLog as AdminRoleAuditLogTable,
  AdminUserRoles as AdminUserRolesTable,
  AnalyticsEvents as AnalyticsEventsTable,
  CatalogAliasProjections as CatalogAliasProjectionsTable,
  CatalogFuzzyDuplicateSuggestions as CatalogFuzzyDuplicateSuggestionsTable,
  CatalogItemNames as CatalogItemNamesTable,
  CatalogItems as CatalogItemsTable,
  CatalogMatchSuggestions as CatalogMatchSuggestionsTable,
  CatalogSourceLinks as CatalogSourceLinksTable,
  CatalogSourceRecords as CatalogSourceRecordsTable,
  CatalogSourceRefreshEvents as CatalogSourceRefreshEventsTable,
  CatalogSourceRefreshRecords as CatalogSourceRefreshRecordsTable,
  CatalogSourceSnapshots as CatalogSourceSnapshotsTable,
  Communities as CommunitiesTable,
  CommunityContributionReports as CommunityContributionReportsTable,
  CommunityContributions as CommunityContributionsTable,
  CommunityMemberships as CommunityMembershipsTable,
  CommunityModerationAuditLog as CommunityModerationAuditLogTable,
  CommunityModerators as CommunityModeratorsTable,
  CommunityRules as CommunityRulesTable,
  EngagementBookmarks as EngagementBookmarksTable,
  EngagementCommentReports as EngagementCommentReportsTable,
  EngagementComments as EngagementCommentsTable,
  EngagementFollows as EngagementFollowsTable,
  EngagementLikes as EngagementLikesTable,
  ErasureRequests as ErasureRequestsTable,
  Health as HealthTable,
  JobQueue as JobQueueTable,
  JournalEntries as JournalEntriesTable,
  JournalEntryMutationReceipts as JournalEntryMutationReceiptsTable,
  JournalEntryObjectMentions as JournalEntryObjectMentionsTable,
  JournalEntryTopicSignals as JournalEntryTopicSignalsTable,
  JournalTopics as JournalTopicsTable,
  JsonValue,
  LineageNodeFollows as LineageNodeFollowsTable,
  LineagePendingSourceIdentities as LineagePendingSourceIdentitiesTable,
  LineageProvenanceEdgeAuditEvents as LineageProvenanceEdgeAuditEventsTable,
  LineageProvenanceEdges as LineageProvenanceEdgesTable,
  LineageQuestions as LineageQuestionsTable,
  MediaAssets as MediaAssetsTable,
  NotificationPreferences as NotificationPreferencesTable,
  NotificationReceipts as NotificationReceiptsTable,
  PlantObjects as PlantObjectsTable,
  Spaces as SpacesTable,
  UserHandleRegistry as UserHandleRegistryTable,
  UserPublicProfiles as UserPublicProfilesTable,
  VarietySeedProofs as VarietySeedProofsTable,
  WishlistItems as WishlistItemsTable,
} from "./generated";

export type Database = DB;
export type { JsonValue };

export type EntryVisibility = "public";
export type EntryLifecycleState = "active" | "deleted_retention";
export type EntryScope = "object" | "space";
export type JournalContentClass =
  | "real_ugc"
  | "founder_first_hand"
  | "editorial"
  | "catalog_fact"
  | "production_smoke"
  | "visual_fixture";
export type JournalSourceLanguage = "uk" | "bg";
export type LocationVisibility = "region" | "hidden";
export type { CoarseRegionCode } from "@/lib/garden/regions";
export type VarietyState = "selected" | "unknown" | "user_added" | "free_text";
export type CatalogKind = "plant_variety" | "species" | "breed";
export type PlantObjectKind = "plant" | "animal";
export type CatalogItemStatus =
  | "seeded"
  | "confirmed"
  | "provisional"
  | "merged"
  | "rejected";
export type CatalogMatchSuggestionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "stale";
export type CatalogMatchConfidenceBucket = "high" | "medium" | "low" | "none";
export type CatalogMatchType =
  | "normalized_exact"
  | "transliteration_exact"
  | "fuzzy_name"
  | "no_safe_match";
export type JobStatus = "pending" | "processing" | "done" | "failed";
export type VarietySeedProofStatus = "draft" | "published";
export type ErasureRequestStatus =
  | "submitted"
  | "reviewing"
  | "handled"
  | "canceled";
export type ErasureRequestScope = "account_data_erasure";
export type ErasureRequestHandledStatus =
  | "completed"
  | "cleanup_pending"
  | "declined"
  | "duplicate"
  | "needs_identity_verification";
export type AnalyticsEventName =
  | "activation_started"
  | "space_created"
  | "object_created"
  | "entry_logged"
  | "entry_photo_attached"
  | "progress_screen_shown"
  | "own_record_revisited"
  | "follow_up_value_pulse"
  | "journal_blocks_reordered"
  | "journal_cover_changed";
export type LineageSourceKind =
  | "own_object"
  | "source_reference"
  | "pending_identity";
export type LineageSourceReferenceKind =
  | "person"
  | "seed_packet"
  | "nursery"
  | "catalog_variety"
  | "other";
export type LineageConsentState =
  | "proposed"
  | "confirmed"
  | "declined"
  | "anonymized";
export type LineageVisibilityPolicy = "owner_only_until_confirmed";
export type LineageErasureState =
  | "active"
  | "source_tombstone"
  | "subject_tombstone"
  | "anonymized";
export type LineageClaimAuditAction = "confirm" | "decline";
export type LineagePendingSourceInviteState =
  | "pending"
  | "claimed"
  | "declined"
  | "anonymized";
export type LineageFollowState = "active" | "anonymized";
export type LineageQuestionState = "delivered" | "anonymized";
export type WishlistSourceSurface = "catalog_item" | "public_variety";
export type EngagementTargetKind =
  | "journal_entry"
  | "lineage_object"
  | "variety"
  | "topic";
export type EngagementCommentState =
  | "active"
  | "deleted"
  | "reported"
  | "removed";
export type EngagementBookmarkState = "active" | "removed";
export type EngagementLikeState = "active" | "removed";
export type EngagementFollowTargetKind = "lineage_object" | "topic";
export type EngagementFollowState = "active" | "removed";
export type EngagementCommentReportReason =
  | "spam"
  | "harassment"
  | "privacy"
  | "misinformation"
  | "other";
export type EngagementCommentReportState =
  | "submitted"
  | "reviewed"
  | "dismissed"
  | "actioned";
export type NotificationReceiptState = "unread" | "read" | "dismissed";
export type CommunityLifecycleState = "draft" | "active" | "archived";
export type CommunityParticipationState = "open" | "closed";
export type CommunityRuleState = "active" | "retired";
export type CommunityMembershipState = "active" | "left" | "banned";
export type CommunityModeratorState = "active" | "revoked";
export type CommunityContributionState = "active" | "removed";
export type CommunityDiscussionState = "open" | "closed";
export type CommunityReportReason =
  | "spam"
  | "harassment"
  | "privacy"
  | "misinformation"
  | "off_topic"
  | "other";
export type CommunityReportState =
  | "submitted"
  | "reviewed"
  | "dismissed"
  | "actioned";
export type CommunityModerationReason =
  | "rule_violation"
  | CommunityReportReason;
export type CommunityModerationTargetKind =
  | "community"
  | "contribution"
  | "membership"
  | "report";
export type CommunityModerationAction =
  | "remove_contribution"
  | "restore_contribution"
  | "close_discussion"
  | "open_discussion"
  | "ban_member"
  | "restore_member"
  | "dismiss_report"
  | "action_report"
  | "close_community"
  | "open_community";
export type JournalTopicTrustState = "curated" | "provisional" | "rejected";
export type JournalEntryTopicSignalSource =
  | "explicit_tag"
  | "object_kind"
  | "catalog_kind"
  | "catalog_mention"
  | "operator_curated";
export type JournalEntryTopicReviewState =
  | "accepted"
  | "review_needed"
  | "rejected";
export type JournalEntryTopicPublicMembershipState = "eligible" | "hidden";
export type CatalogAliasStatus =
  | "accepted"
  | "review_needed"
  | "rejected"
  | "generated"
  | "user_provisional";
export type CatalogAliasSourceMethod =
  | "source_backed"
  | "generated"
  | "manual_seed"
  | "ontology_seed"
  | "user_provisional"
  | "curator";

export type AdminUserRole = Selectable<AdminUserRolesTable>;
export type NewAdminUserRole = Insertable<AdminUserRolesTable>;
export type AdminRoleAuditEntry = Selectable<AdminRoleAuditLogTable>;
export type NewAdminRoleAuditEntry = Insertable<AdminRoleAuditLogTable>;
export type AnalyticsEvent = Selectable<AnalyticsEventsTable>;
export type CatalogAliasProjection = Selectable<CatalogAliasProjectionsTable>;
export type CatalogFuzzyDuplicateSuggestion =
  Selectable<CatalogFuzzyDuplicateSuggestionsTable>;
export type NewCatalogFuzzyDuplicateSuggestion =
  Insertable<CatalogFuzzyDuplicateSuggestionsTable>;
export type CatalogItem = Selectable<CatalogItemsTable>;
export type CatalogItemName = Selectable<CatalogItemNamesTable>;
export type CatalogMatchSuggestion = Selectable<CatalogMatchSuggestionsTable>;
export type NewCatalogMatchSuggestion =
  Insertable<CatalogMatchSuggestionsTable>;
export type CatalogSourceLink = Selectable<CatalogSourceLinksTable>;
export type CatalogSourceRecord = Selectable<CatalogSourceRecordsTable>;
export type CatalogSourceRefreshEvent =
  Selectable<CatalogSourceRefreshEventsTable>;
export type CatalogSourceRefreshRecord =
  Selectable<CatalogSourceRefreshRecordsTable>;
export type CatalogSourceSnapshot = Selectable<CatalogSourceSnapshotsTable>;
export type Community = Selectable<CommunitiesTable>;
export type NewCommunity = Insertable<CommunitiesTable>;
export type CommunityRule = Selectable<CommunityRulesTable>;
export type NewCommunityRule = Insertable<CommunityRulesTable>;
export type CommunityMembership = Selectable<CommunityMembershipsTable>;
export type NewCommunityMembership = Insertable<CommunityMembershipsTable>;
export type CommunityModerator = Selectable<CommunityModeratorsTable>;
export type NewCommunityModerator = Insertable<CommunityModeratorsTable>;
export type CommunityContribution = Selectable<CommunityContributionsTable>;
export type NewCommunityContribution = Insertable<CommunityContributionsTable>;
export type CommunityContributionReport =
  Selectable<CommunityContributionReportsTable>;
export type NewCommunityContributionReport =
  Insertable<CommunityContributionReportsTable>;
export type CommunityModerationAuditEntry =
  Selectable<CommunityModerationAuditLogTable>;
export type NewCommunityModerationAuditEntry =
  Insertable<CommunityModerationAuditLogTable>;
export type NewAnalyticsEvent = Insertable<AnalyticsEventsTable>;
export type NewCatalogAliasProjection =
  Insertable<CatalogAliasProjectionsTable>;
export type NewCatalogItem = Insertable<CatalogItemsTable>;
export type NewCatalogItemName = Insertable<CatalogItemNamesTable>;
export type NewCatalogSourceLink = Insertable<CatalogSourceLinksTable>;
export type NewCatalogSourceRecord = Insertable<CatalogSourceRecordsTable>;
export type NewCatalogSourceRefreshEvent =
  Insertable<CatalogSourceRefreshEventsTable>;
export type NewCatalogSourceRefreshRecord =
  Insertable<CatalogSourceRefreshRecordsTable>;
export type NewCatalogSourceSnapshot = Insertable<CatalogSourceSnapshotsTable>;
export type ErasureRequest = Selectable<ErasureRequestsTable>;
export type NewErasureRequest = Insertable<ErasureRequestsTable>;
export type Health = Selectable<HealthTable>;
export type NewHealth = Insertable<HealthTable>;
export type Space = Selectable<SpacesTable>;
export type NewSpace = Insertable<SpacesTable>;
export type PlantObject = Selectable<PlantObjectsTable>;
export type NewPlantObject = Insertable<PlantObjectsTable>;
export type JournalEntry = Selectable<JournalEntriesTable>;
export type NewJournalEntry = Insertable<JournalEntriesTable>;
export type JournalEntryMutationReceipt =
  Selectable<JournalEntryMutationReceiptsTable>;
export type NewJournalEntryMutationReceipt =
  Insertable<JournalEntryMutationReceiptsTable>;
export type JournalEntryObjectMention =
  Selectable<JournalEntryObjectMentionsTable>;
export type NewJournalEntryObjectMention =
  Insertable<JournalEntryObjectMentionsTable>;
export type JournalTopic = Selectable<JournalTopicsTable>;
export type NewJournalTopic = Insertable<JournalTopicsTable>;
export type JournalEntryTopicSignal = Selectable<JournalEntryTopicSignalsTable>;
export type NewJournalEntryTopicSignal =
  Insertable<JournalEntryTopicSignalsTable>;
export type LineageNodeFollow = Selectable<LineageNodeFollowsTable>;
export type NewLineageNodeFollow = Insertable<LineageNodeFollowsTable>;
export type LineagePendingSourceIdentity =
  Selectable<LineagePendingSourceIdentitiesTable>;
export type NewLineagePendingSourceIdentity =
  Insertable<LineagePendingSourceIdentitiesTable>;
export type LineageProvenanceEdge = Selectable<LineageProvenanceEdgesTable>;
export type NewLineageProvenanceEdge = Insertable<LineageProvenanceEdgesTable>;
export type LineageProvenanceEdgeAuditEvent =
  Selectable<LineageProvenanceEdgeAuditEventsTable>;
export type NewLineageProvenanceEdgeAuditEvent =
  Insertable<LineageProvenanceEdgeAuditEventsTable>;
export type LineageQuestion = Selectable<LineageQuestionsTable>;
export type NewLineageQuestion = Insertable<LineageQuestionsTable>;
export type MediaAsset = Selectable<MediaAssetsTable>;
export type NewMediaAsset = Insertable<MediaAssetsTable>;
export type UserPublicProfile = Selectable<UserPublicProfilesTable>;
export type NewUserPublicProfile = Insertable<UserPublicProfilesTable>;
export type UserHandleRegistryEntry = Selectable<UserHandleRegistryTable>;
export type NewUserHandleRegistryEntry = Insertable<UserHandleRegistryTable>;
export type WishlistItem = Selectable<WishlistItemsTable>;
export type NewWishlistItem = Insertable<WishlistItemsTable>;
export type EngagementBookmark = Selectable<EngagementBookmarksTable>;
export type NewEngagementBookmark = Insertable<EngagementBookmarksTable>;
export type EngagementComment = Selectable<EngagementCommentsTable>;
export type NewEngagementComment = Insertable<EngagementCommentsTable>;
export type EngagementCommentReport = Selectable<EngagementCommentReportsTable>;
export type NewEngagementCommentReport =
  Insertable<EngagementCommentReportsTable>;
export type EngagementFollow = Selectable<EngagementFollowsTable>;
export type NewEngagementFollow = Insertable<EngagementFollowsTable>;
export type EngagementLike = Selectable<EngagementLikesTable>;
export type NewEngagementLike = Insertable<EngagementLikesTable>;
export type NotificationPreference = Selectable<NotificationPreferencesTable>;
export type NewNotificationPreference =
  Insertable<NotificationPreferencesTable>;
export type NotificationReceipt = Selectable<NotificationReceiptsTable>;
export type NewNotificationReceipt = Insertable<NotificationReceiptsTable>;
export type JobQueueJob = Selectable<JobQueueTable>;
export type NewJobQueueJob = Insertable<JobQueueTable>;
export type VarietySeedProof = Selectable<VarietySeedProofsTable>;
export type NewVarietySeedProof = Insertable<VarietySeedProofsTable>;
