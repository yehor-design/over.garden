/**
 * OVE-192 machine-readable current-schema erasure coverage.
 * Dry-run counts and execution steps must own every classified path.
 */

export type ErasureDisposition =
  | "delete"
  | "anonymize"
  | "retain-bounded"
  | "not-account-linkable";

export type ErasureCoveragePathKind =
  | "fk"
  | "soft_column"
  | "json_payload"
  | "aggregate_field";

export interface ErasureCoverageEntry {
  id: string;
  table: string;
  columnOrPath: string;
  kind: ErasureCoveragePathKind;
  disposition: ErasureDisposition;
  rationale: string;
  dryRunOwned: boolean;
  executionOwned: boolean;
}

export const ERASURE_SCHEMA_COVERAGE_VERSION = "ove237.erasure-schema.v3";

export const ERASURE_SCHEMA_COVERAGE: readonly ErasureCoverageEntry[] = [
  // Auth / Better Auth
  {
    id: "user.id",
    table: "user",
    columnOrPath: "id",
    kind: "fk",
    disposition: "delete",
    rationale: "Account row is deleted after dependent identity is cleared.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "session.userId",
    table: "session",
    columnOrPath: "userId",
    kind: "fk",
    disposition: "delete",
    rationale: "Sessions for the subject are deleted before the user row.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "account.userId",
    table: "account",
    columnOrPath: "userId",
    kind: "fk",
    disposition: "delete",
    rationale: "Provider/credential accounts are deleted with the subject.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "verification.identifier",
    table: "verification",
    columnOrPath: "identifier",
    kind: "soft_column",
    disposition: "delete",
    rationale:
      "Email verification rows keyed by the subject email are deleted.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "pilot_invite_grants.user_id",
    table: "pilot_invite_grants",
    columnOrPath: "user_id",
    kind: "soft_column",
    disposition: "delete",
    rationale: "Closed-pilot grant row is removed with the account.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "learning_actor_attributions.user_id",
    table: "learning_actor_attributions",
    columnOrPath: "user_id",
    kind: "fk",
    disposition: "delete",
    rationale:
      "OVE-200 durable learning actor class is removed with the account.",
    dryRunOwned: true,
    executionOwned: true,
  },

  // OVE-203 public identity (cascade on user delete; still inventory-owned)
  {
    id: "user_public_profiles.user_id",
    table: "user_public_profiles",
    columnOrPath: "user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE; inventory proves profile removal.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "user_public_profiles.handle",
    table: "user_public_profiles",
    columnOrPath: "handle",
    kind: "soft_column",
    disposition: "delete",
    rationale: "Deleted with the public profile before the auth user row.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "user_public_profiles.normalized_handle",
    table: "user_public_profiles",
    columnOrPath: "normalized_handle",
    kind: "soft_column",
    disposition: "delete",
    rationale: "Deleted with the public profile before the auth user row.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "user_handle_registry.user_id",
    table: "user_handle_registry",
    columnOrPath: "user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE for current and retired handle claims.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "user_handle_registry.normalized_handle",
    table: "user_handle_registry",
    columnOrPath: "normalized_handle",
    kind: "soft_column",
    disposition: "delete",
    rationale: "Current and retired handle claims are deleted with the user.",
    dryRunOwned: true,
    executionOwned: true,
  },

  // Social / engagement (cascade)
  {
    id: "profile_follows.follower_user_id",
    table: "profile_follows",
    columnOrPath: "follower_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "profile_follows.target_user_id",
    table: "profile_follows",
    columnOrPath: "target_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "profile_blocks.blocker_user_id",
    table: "profile_blocks",
    columnOrPath: "blocker_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "profile_blocks.blocked_user_id",
    table: "profile_blocks",
    columnOrPath: "blocked_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "profile_reports.reporter_user_id",
    table: "profile_reports",
    columnOrPath: "reporter_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "profile_reports.target_user_id",
    table: "profile_reports",
    columnOrPath: "target_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "wishlist_items.owner_user_id",
    table: "wishlist_items",
    columnOrPath: "owner_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "engagement_comments.author_user_id",
    table: "engagement_comments",
    columnOrPath: "author_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "engagement_bookmarks.owner_user_id",
    table: "engagement_bookmarks",
    columnOrPath: "owner_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "engagement_follows.follower_user_id",
    table: "engagement_follows",
    columnOrPath: "follower_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "engagement_comment_reports.reporter_user_id",
    table: "engagement_comment_reports",
    columnOrPath: "reporter_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "engagement_comment_reports.reviewed_by_user_id",
    table: "engagement_comment_reports",
    columnOrPath: "reviewed_by_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale:
      "ON DELETE SET NULL preserves the review state without its actor.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "engagement_moderation_audit_log.actor_user_id",
    table: "engagement_moderation_audit_log",
    columnOrPath: "actor_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale:
      "ON DELETE SET NULL retains the moderation audit without its actor.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "notification_receipts.owner_user_id",
    table: "notification_receipts",
    columnOrPath: "owner_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "notification_preferences.owner_user_id",
    table: "notification_preferences",
    columnOrPath: "owner_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "engagement_likes.anonymous_device_hash",
    table: "engagement_likes",
    columnOrPath: "anonymous_device_hash",
    kind: "soft_column",
    disposition: "not-account-linkable",
    rationale:
      "No user_id column; hash is SHA-256 of a device token via hashAnonymousEngagementToken, not an account id.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "interaction_quota_windows.actor_user_id",
    table: "interaction_quota_windows",
    columnOrPath: "actor_user_id",
    kind: "fk",
    disposition: "delete",
    rationale:
      "Bounded admission counters are deleted by the user FK ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },

  // Community
  {
    id: "community_memberships.user_id",
    table: "community_memberships",
    columnOrPath: "user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "community_moderators.user_id",
    table: "community_moderators",
    columnOrPath: "user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "community_moderators.granted_by_user_id",
    table: "community_moderators",
    columnOrPath: "granted_by_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale: "ON DELETE SET NULL; also nulled explicitly before user delete.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "community_contributions.contributor_user_id",
    table: "community_contributions",
    columnOrPath: "contributor_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "community_contributions.removed_by_user_id",
    table: "community_contributions",
    columnOrPath: "removed_by_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale:
      "ON DELETE RESTRICT and NOT NULL when set; rekeyed to synthetic erased subject.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "community_contribution_reports.reporter_user_id",
    table: "community_contribution_reports",
    columnOrPath: "reporter_user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "community_contribution_reports.resolved_by_user_id",
    table: "community_contribution_reports",
    columnOrPath: "resolved_by_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale:
      "ON DELETE RESTRICT and NOT NULL when set; rekeyed to synthetic erased subject.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "community_moderation_audit_log.actor_user_id",
    table: "community_moderation_audit_log",
    columnOrPath: "actor_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale:
      "ON DELETE RESTRICT and NOT NULL; rekeyed to synthetic erased subject.",
    dryRunOwned: true,
    executionOwned: true,
  },

  // Garden workspace / journals / media (soft owners + OVE-207 cover)
  {
    id: "spaces.owner_user_id",
    table: "spaces",
    columnOrPath: "owner_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Rekeyed to synthetic erased subject; display name erased.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "plant_objects.owner_user_id",
    table: "plant_objects",
    columnOrPath: "owner_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Rekeyed to synthetic erased subject.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "journal_entries.owner_user_id",
    table: "journal_entries",
    columnOrPath: "owner_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Rekeyed; content wiped; public slugs become 410 tombstones.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "journal_entries.cover_media_asset_id",
    table: "journal_entries",
    columnOrPath: "cover_media_asset_id",
    kind: "aggregate_field",
    disposition: "anonymize",
    rationale:
      "Explicit cover cleared to null before media deletion (OVE-207).",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "journal_entries.content_document",
    table: "journal_entries",
    columnOrPath: "content_document",
    kind: "json_payload",
    disposition: "anonymize",
    rationale: "Structured document including inline media refs is nulled.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "media_assets.owner_user_id",
    table: "media_assets",
    columnOrPath: "owner_user_id",
    kind: "soft_column",
    disposition: "delete",
    rationale:
      "Rows deleted after cover clear; object keys captured into erasure outbox.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "media_assets.usage_role",
    table: "media_assets",
    columnOrPath: "usage_role",
    kind: "aggregate_field",
    disposition: "delete",
    rationale: "Inline and cover_only assets are both inventoried and deleted.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "journal_entry_object_mentions.owner_user_id",
    table: "journal_entry_object_mentions",
    columnOrPath: "owner_user_id",
    kind: "soft_column",
    disposition: "delete",
    rationale: "Owned mention rows are deleted before journal rekey.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "journal_entry_catalog_mentions.owner_user_id",
    table: "journal_entry_catalog_mentions",
    columnOrPath: "owner_user_id",
    kind: "soft_column",
    disposition: "delete",
    rationale: "Owned catalog mention rows are deleted before journal rekey.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "analytics_events.owner_user_id",
    table: "analytics_events",
    columnOrPath: "owner_user_id",
    kind: "soft_column",
    disposition: "delete",
    rationale: "First-party analytics owned by the subject are deleted.",
    dryRunOwned: true,
    executionOwned: true,
  },

  // Lineage
  {
    id: "lineage_provenance_edges.owner_user_id",
    table: "lineage_provenance_edges",
    columnOrPath: "owner_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Structural tombstone anonymization; not raw delete.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "lineage_provenance_edges.source_owner_user_id",
    table: "lineage_provenance_edges",
    columnOrPath: "source_owner_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Person-source owner link cleared or preserved per shape rules.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "lineage_pending_source_identities.created_by_user_id",
    table: "lineage_pending_source_identities",
    columnOrPath: "created_by_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale: "ON DELETE SET NULL plus explicit anonymization.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "lineage_pending_source_identities.claimed_by_user_id",
    table: "lineage_pending_source_identities",
    columnOrPath: "claimed_by_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale: "ON DELETE SET NULL plus explicit anonymization.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "lineage_provenance_edge_audit_events.actor_user_id",
    table: "lineage_provenance_edge_audit_events",
    columnOrPath: "actor_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale: "ON DELETE SET NULL; nulled for subject.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "lineage_provenance_edge_audit_events.target_user_id",
    table: "lineage_provenance_edge_audit_events",
    columnOrPath: "target_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale: "ON DELETE SET NULL; nulled for subject.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "lineage_node_follows.follower_user_id",
    table: "lineage_node_follows",
    columnOrPath: "follower_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Rekeyed/anonymized follow state.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "lineage_node_follows.target_owner_user_id",
    table: "lineage_node_follows",
    columnOrPath: "target_owner_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Rekeyed to the synthetic erased subject and marked anonymized.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "lineage_questions.asker_user_id",
    table: "lineage_questions",
    columnOrPath: "asker_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Rekeyed/anonymized question text.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "lineage_questions.recipient_user_id",
    table: "lineage_questions",
    columnOrPath: "recipient_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Rekeyed with target object ownership.",
    dryRunOwned: true,
    executionOwned: true,
  },

  // Catalog / operator soft links
  {
    id: "catalog_items.created_by_user_id",
    table: "catalog_items",
    columnOrPath: "created_by_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Nulled; provisional rows created by subject are deleted.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "catalog_items.reviewed_by_user_id",
    table: "catalog_items",
    columnOrPath: "reviewed_by_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Reviewer attribution nulled.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "catalog_match_suggestions.reviewed_by_user_id",
    table: "catalog_match_suggestions",
    columnOrPath: "reviewed_by_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Curator reviewer id nulled.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "catalog_alias_projections.reviewed_by_user_id",
    table: "catalog_alias_projections",
    columnOrPath: "reviewed_by_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Alias reviewer id nulled.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "variety_seed_proofs.author_user_id",
    table: "variety_seed_proofs",
    columnOrPath: "author_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "NOT NULL soft author; rekeyed to synthetic erased subject.",
    dryRunOwned: true,
    executionOwned: true,
  },
  // Erasure request bookkeeping
  {
    id: "erasure_requests.requester_user_id",
    table: "erasure_requests",
    columnOrPath: "requester_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "Rekeyed to synthetic erased subject for one-year evidence.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "erasure_requests.handled_by_user_id",
    table: "erasure_requests",
    columnOrPath: "handled_by_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale:
      "If the erased user handled other requests, operator id is nulled.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "erasure_requests.dry_run_reviewed_by_user_id",
    table: "erasure_requests",
    columnOrPath: "dry_run_reviewed_by_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale: "If the erased user reviewed dry-runs, reviewer id is nulled.",
    dryRunOwned: true,
    executionOwned: true,
  },

  // Admin (cascade / set null)
  {
    id: "admin_user_roles.user_id",
    table: "admin_user_roles",
    columnOrPath: "user_id",
    kind: "fk",
    disposition: "delete",
    rationale: "ON DELETE CASCADE.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "admin_user_roles.granted_by_user_id",
    table: "admin_user_roles",
    columnOrPath: "granted_by_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale: "ON DELETE SET NULL.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "admin_role_audit_log.actor_user_id",
    table: "admin_role_audit_log",
    columnOrPath: "actor_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale: "ON DELETE SET NULL; retain-bounded audit without subject id.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "admin_role_audit_log.target_user_id",
    table: "admin_role_audit_log",
    columnOrPath: "target_user_id",
    kind: "fk",
    disposition: "anonymize",
    rationale: "ON DELETE SET NULL.",
    dryRunOwned: true,
    executionOwned: true,
  },

  // Queue / outbox
  {
    id: "journal_entry_mutation_receipts.owner_user_id",
    table: "journal_entry_mutation_receipts",
    columnOrPath: "owner_user_id",
    kind: "soft_column",
    disposition: "delete",
    rationale:
      "Owner mutation receipts are deleted before journal ownership is rekeyed.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "public_projection_intents.owner_user_id",
    table: "public_projection_intents",
    columnOrPath: "owner_user_id",
    kind: "soft_column",
    disposition: "anonymize",
    rationale:
      "OVE-242 erasure intents are rekeyed to the synthetic erased subject.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "plant_identification_requests.owner_user_id",
    table: "plant_identification_requests",
    columnOrPath: "owner_user_id",
    kind: "fk",
    disposition: "delete",
    rationale:
      "Private provider request receipts cascade with the erased owner and retain no public projection.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "plant_identification_decisions.owner_user_id",
    table: "plant_identification_decisions",
    columnOrPath: "owner_user_id",
    kind: "fk",
    disposition: "delete",
    rationale:
      "Explicit identity decisions are private owner records and cascade with account erasure.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "job_queue.payload.userId",
    table: "job_queue",
    columnOrPath: "payload.userId",
    kind: "json_payload",
    disposition: "delete",
    rationale:
      "All statuses including done are scrubbed of the old user id before commit.",
    dryRunOwned: true,
    executionOwned: true,
  },
  {
    id: "job_queue.payload.erasure_media_object_delete",
    table: "job_queue",
    columnOrPath: "payload.kind=erasure_media_object_delete",
    kind: "json_payload",
    disposition: "retain-bounded",
    rationale:
      "Post-commit storage saga rows store requestId/bucket/objectKey only until completed.",
    dryRunOwned: true,
    executionOwned: true,
  },
] as const;

export function listErasureCoverageEntries(): readonly ErasureCoverageEntry[] {
  return ERASURE_SCHEMA_COVERAGE;
}

export function assertErasureCoverageCompleteness(input: {
  discoveredPathIds: readonly string[];
}): void {
  const classified = new Set(ERASURE_SCHEMA_COVERAGE.map((entry) => entry.id));
  const missing = input.discoveredPathIds.filter((id) => !classified.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Unclassified erasure schema paths: ${missing.sort().join(", ")}`,
    );
  }

  for (const entry of ERASURE_SCHEMA_COVERAGE) {
    if (!entry.dryRunOwned || !entry.executionOwned) {
      throw new Error(
        `Coverage entry ${entry.id} must be owned by dry-run and execution.`,
      );
    }
  }
}

/** Paths the SQL-file discovery must find (FK + soft user columns + queue). */
export const ERASURE_SQL_DISCOVERY_REQUIRED_IDS = [
  "community_contributions.removed_by_user_id",
  "community_contribution_reports.resolved_by_user_id",
  "community_moderation_audit_log.actor_user_id",
  "catalog_alias_projections.reviewed_by_user_id",
  "catalog_match_suggestions.reviewed_by_user_id",
  "variety_seed_proofs.author_user_id",
  "erasure_requests.handled_by_user_id",
  "erasure_requests.dry_run_reviewed_by_user_id",
  "journal_entries.cover_media_asset_id",
  "media_assets.usage_role",
  "engagement_likes.anonymous_device_hash",
  "engagement_comment_reports.reviewed_by_user_id",
  "interaction_quota_windows.actor_user_id",
  "job_queue.payload.userId",
  "user_public_profiles.user_id",
  "user_handle_registry.user_id",
] as const;

export function discoverErasurePathsFromWalkingSkeletonSql(
  sqlText: string,
): string[] {
  const discovered = new Set<string>();

  // Read the owning table from the DDL, never from the constraint name. Several
  // historical constraints abbreviate the table name.
  for (const match of sqlText.matchAll(
    /alter table\s+"?(\w+)"?[^;]{0,600}?add constraint\s+\w+\s+foreign key \((\w+)\)\s+references\s+"user"\(id\)/gi,
  )) {
    discovered.add(`${match[1]}.${match[2]}`);
  }

  // Discover identity-shaped columns from CREATE TABLE bodies. This is broader
  // than the manifest on purpose: a new path must fail CI until it receives an
  // explicit disposition.
  for (const tableMatch of sqlText.matchAll(
    /create table if not exists\s+"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi,
  )) {
    const table = tableMatch[1] ?? "";
    const body = tableMatch[2] ?? "";
    for (const columnMatch of body.matchAll(/^\s*"?(\w+)"?\s+[^,\n]+/gm)) {
      const column = columnMatch[1] ?? "";
      if (
        /_user_id$/.test(column) ||
        /(?:^|_)(?:email|handle|identifier)$/.test(column) ||
        /^(?:anonymous_device_hash|cover_media_asset_id|usage_role|content_document)$/.test(
          column,
        )
      ) {
        discovered.add(`${table}.${column}`);
      }
    }

    for (const jsonPath of body.matchAll(
      /"?(\w+)"?\s*->>\s*'([A-Za-z][A-Za-z0-9_]*)'/g,
    )) {
      discovered.add(`${table}.${jsonPath[1]}.${jsonPath[2]}`);
    }
  }

  const softColumns: Array<{ table: string; column: string }> = [
    { table: "spaces", column: "owner_user_id" },
    { table: "plant_objects", column: "owner_user_id" },
    { table: "journal_entries", column: "owner_user_id" },
    { table: "journal_entries", column: "cover_media_asset_id" },
    { table: "media_assets", column: "owner_user_id" },
    { table: "media_assets", column: "usage_role" },
    { table: "analytics_events", column: "owner_user_id" },
    { table: "catalog_items", column: "created_by_user_id" },
    { table: "catalog_items", column: "reviewed_by_user_id" },
    { table: "catalog_match_suggestions", column: "reviewed_by_user_id" },
    { table: "catalog_alias_projections", column: "reviewed_by_user_id" },
    { table: "variety_seed_proofs", column: "author_user_id" },
    { table: "erasure_requests", column: "requester_user_id" },
    { table: "erasure_requests", column: "handled_by_user_id" },
    { table: "erasure_requests", column: "dry_run_reviewed_by_user_id" },
    { table: "engagement_likes", column: "anonymous_device_hash" },
    { table: "lineage_provenance_edges", column: "owner_user_id" },
    { table: "lineage_provenance_edges", column: "source_owner_user_id" },
    { table: "lineage_node_follows", column: "follower_user_id" },
    { table: "lineage_questions", column: "asker_user_id" },
    { table: "lineage_questions", column: "recipient_user_id" },
    { table: "pilot_invite_grants", column: "user_id" },
    { table: "learning_actor_attributions", column: "user_id" },
    { table: "journal_entry_object_mentions", column: "owner_user_id" },
    { table: "journal_entry_catalog_mentions", column: "owner_user_id" },
  ];

  for (const { table, column } of softColumns) {
    if (
      sqlText.includes(column) &&
      (sqlText.includes(`create table if not exists ${table}`) ||
        sqlText.includes(`alter table ${table}`) ||
        sqlText.includes(`create table if not exists ${table} (`))
    ) {
      discovered.add(`${table}.${column}`);
    }
  }

  if (sqlText.includes("job_queue") && sqlText.includes("payload")) {
    discovered.add("job_queue.payload.userId");
  }

  if (sqlText.includes("content_document")) {
    discovered.add("journal_entries.content_document");
  }

  return [...discovered].sort();
}
