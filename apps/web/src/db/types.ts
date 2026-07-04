import type { Insertable, Selectable } from "kysely";

import type {
  DB,
  AdminRoleAuditLog as AdminRoleAuditLogTable,
  AdminUserRoles as AdminUserRolesTable,
  AnalyticsEvents as AnalyticsEventsTable,
  CatalogAliasProjections as CatalogAliasProjectionsTable,
  CatalogItemNames as CatalogItemNamesTable,
  CatalogItems as CatalogItemsTable,
  CatalogSourceLinks as CatalogSourceLinksTable,
  CatalogSourceRecords as CatalogSourceRecordsTable,
  CatalogSourceRefreshEvents as CatalogSourceRefreshEventsTable,
  CatalogSourceRefreshRecords as CatalogSourceRefreshRecordsTable,
  CatalogSourceSnapshots as CatalogSourceSnapshotsTable,
  ErasureRequests as ErasureRequestsTable,
  Health as HealthTable,
  JobQueue as JobQueueTable,
  JournalEntries as JournalEntriesTable,
  JournalEntryObjectMentions as JournalEntryObjectMentionsTable,
  JsonValue,
  LineageNodeFollows as LineageNodeFollowsTable,
  LineagePendingSourceIdentities as LineagePendingSourceIdentitiesTable,
  LineageProvenanceEdgeAuditEvents as LineageProvenanceEdgeAuditEventsTable,
  LineageProvenanceEdges as LineageProvenanceEdgesTable,
  LineageQuestions as LineageQuestionsTable,
  MediaAssets as MediaAssetsTable,
  PilotInviteGrants as PilotInviteGrantsTable,
  PilotInterviewLearnings as PilotInterviewLearningsTable,
  PlantObjects as PlantObjectsTable,
  Spaces as SpacesTable,
  UserPublicProfiles as UserPublicProfilesTable,
  VarietySeedProofs as VarietySeedProofsTable,
} from "./generated";

export type Database = DB;
export type { JsonValue };

export type EntryVisibility = "private" | "public";
export type EntryLifecycleState = "active" | "archived";
export type EntryScope = "object" | "space";
export type LocationVisibility = "region" | "hidden";
export type { CoarseRegionCode } from "@/lib/garden/regions";
export type VarietyState = "selected" | "unknown" | "user_added" | "free_text";
export type CatalogKind = "plant_variety" | "species" | "breed";
export type PlantObjectKind = "plant" | "bee_colony" | "animal";
export type CatalogItemStatus =
  | "seeded"
  | "confirmed"
  | "provisional"
  | "merged"
  | "rejected";
export type MediaAssetStatus = "quarantined" | "processed" | "failed";
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
  | "declined"
  | "duplicate"
  | "needs_identity_verification";
export type AnalyticsEventName =
  | "activation_started"
  | "space_created"
  | "object_created"
  | "entry_logged"
  | "entry_photo_attached"
  | "offline_entry_queued"
  | "offline_entry_synced"
  | "progress_screen_shown"
  | "own_record_revisited"
  | "follow_up_value_pulse";
export type EntrySyncStatus = "online" | "offline_queued" | "offline_synced";
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
export type CatalogItem = Selectable<CatalogItemsTable>;
export type CatalogItemName = Selectable<CatalogItemNamesTable>;
export type CatalogSourceLink = Selectable<CatalogSourceLinksTable>;
export type CatalogSourceRecord = Selectable<CatalogSourceRecordsTable>;
export type CatalogSourceRefreshEvent =
  Selectable<CatalogSourceRefreshEventsTable>;
export type CatalogSourceRefreshRecord =
  Selectable<CatalogSourceRefreshRecordsTable>;
export type CatalogSourceSnapshot = Selectable<CatalogSourceSnapshotsTable>;
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
export type JournalEntryObjectMention =
  Selectable<JournalEntryObjectMentionsTable>;
export type NewJournalEntryObjectMention =
  Insertable<JournalEntryObjectMentionsTable>;
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
export type PilotInviteGrant = Selectable<PilotInviteGrantsTable>;
export type NewPilotInviteGrant = Insertable<PilotInviteGrantsTable>;
export type UserPublicProfile = Selectable<UserPublicProfilesTable>;
export type NewUserPublicProfile = Insertable<UserPublicProfilesTable>;
export type PilotInterviewLearning = Selectable<PilotInterviewLearningsTable>;
export type NewPilotInterviewLearning =
  Insertable<PilotInterviewLearningsTable>;
export type PilotInterviewSegment =
  | "casual_micro_grower"
  | "casual_gen_z"
  | "casual_practical_beginner"
  | "casual_urban_balcony"
  | "casual_food_self_reliance"
  | "power_burned_out_it"
  | "power_collector"
  | "power_experienced"
  | "power_homestead"
  | "supply_expert_creator"
  | "supply_local_seller"
  | "channel_ally"
  | "unknown_segment";
export type PilotInterviewActivationResult =
  | "not_activated"
  | "activated_first_entry_only"
  | "activated_with_follow_up"
  | "started_no_save"
  | "dropped_after_first"
  | "not_in_cohort"
  | "unknown";
export type PilotInterviewReturnReason =
  | "same_object_follow_up"
  | "seasonal_return"
  | "never_returned"
  | "returned_no_save"
  | "privacy_concern"
  | "composer_friction"
  | "not_relevant_yet"
  | "unknown";
export type PilotInterviewMainObjection =
  | "no_journal_habit"
  | "too_much_effort"
  | "privacy_location"
  | "no_clear_value"
  | "prefers_paper_or_social"
  | "product_too_early"
  | "not_gardener_fit"
  | "none_observed"
  | "unknown";
export type PilotInterviewObservedValue =
  | "history_worth_keeping"
  | "photo_safe_capture"
  | "catalog_helpful"
  | "offline_queue_helpful"
  | "progress_moment_helpful"
  | "public_variety_hook"
  | "no_clear_value_yet"
  | "unknown";
export type PilotInterviewNextAction =
  | "continue_pilot"
  | "iterate_composer"
  | "iterate_onboarding"
  | "iterate_privacy_copy"
  | "schedule_follow_up"
  | "pause_recruiting"
  | "close_track"
  | "none";
export type JobQueueJob = Selectable<JobQueueTable>;
export type NewJobQueueJob = Insertable<JobQueueTable>;
export type VarietySeedProof = Selectable<VarietySeedProofsTable>;
export type NewVarietySeedProof = Insertable<VarietySeedProofsTable>;
