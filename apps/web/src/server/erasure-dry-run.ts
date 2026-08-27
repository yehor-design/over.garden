export type ErasureDryRunDataClassKey =
  | "account_auth"
  | "public_identity"
  | "garden_workspace"
  | "lineage_provenance"
  | "journal_entries"
  | "media_assets"
  | "social_engagement"
  | "community"
  | "public_exposure"
  | "analytics_events"
  | "catalog_provisional"
  | "catalog_operator_links"
  | "search_index_artifacts"
  | "erasure_operator_records";

export interface ErasureDryRunDataClass {
  key: ErasureDryRunDataClassKey;
  label: string;
  description: string;
  counts: Record<string, number>;
}

export interface ErasureDryRunPreview {
  requestId: string;
  requesterUserId: string;
  generatedAt: Date;
  dataClasses: ErasureDryRunDataClass[];
  caveats: string[];
}

export const ERASURE_DRY_RUN_CAVEATS = [
  "This preview is non-destructive and repeatable. No account, garden, lineage, journal, media, search, or analytics row is deleted or anonymized by viewing it.",
  "Counts describe affected data classes only. Raw journal text, media keys, emails, tokens, IP addresses, user agents, referrers, and precise location never appear in this read model.",
  "Final irreversible erasure or anonymization still requires maintainer approval and a separate operator workflow.",
] as const;

export function assembleErasureDryRunPreview(input: {
  requestId: string;
  requesterUserId: string;
  generatedAt: Date;
  counts: ErasureDryRunCounts;
}): ErasureDryRunPreview {
  return {
    requestId: input.requestId,
    requesterUserId: input.requesterUserId,
    generatedAt: input.generatedAt,
    dataClasses: buildErasureDryRunDataClasses(input.counts),
    caveats: [...ERASURE_DRY_RUN_CAVEATS],
  };
}

export interface ErasureDryRunCounts {
  authUserPresent: number;
  authSessions: number;
  authAccounts: number;
  publicIdentityProfiles: number;
  currentHandleClaims: number;
  retiredHandleClaims: number;
  unreviewedIdentityRows: number;
  spaces: number;
  plantObjects: number;
  lineageProvenanceEdges: number;
  lineagePendingSourceIdentities: number;
  lineageProvenanceAuditEvents: number;
  lineageNodeFollows: number;
  lineageQuestions: number;
  journalEntriesTotal: number;
  journalEntriesPublicActive: number;
  journalEntriesDeletionPending: number;
  journalEntryObjectMentions: number;
  journalEntryCatalogMentions: number;
  journalMutationReceipts: number;
  mediaAssetsTotal: number;
  mediaAssetsQuarantined: number;
  mediaAssetsProcessed: number;
  mediaAssetsFailed: number;
  mediaAssetsCoverOnly: number;
  mediaAssetsWithExplicitCover: number;
  profileFollows: number;
  profileBlocks: number;
  wishlistItems: number;
  engagementComments: number;
  engagementBookmarks: number;
  notificationReceipts: number;
  communityMemberships: number;
  communityContributions: number;
  communityModerationActorRefs: number;
  publicSlugs: number;
  publicGoneTombstones: number;
  analyticsEvents: number;
  catalogProvisionalItems: number;
  plantObjectsUserAdded: number;
  catalogReviewerLinks: number;
  searchPublicActiveEntries: number;
  searchPendingIndexJobs: number;
  searchPendingUnindexJobs: number;
  searchTerminalJobsWithUserId: number;
  publicProjectionIntents: number;
  erasureRequestsTotal: number;
}

function buildErasureDryRunDataClasses(
  counts: ErasureDryRunCounts,
): ErasureDryRunDataClass[] {
  return [
    {
      key: "account_auth",
      label: "Account and auth-adjacent data",
      description:
        "Better Auth user row, linked sessions, and credential/provider accounts.",
      counts: {
        user_row: counts.authUserPresent,
        sessions: counts.authSessions,
        accounts: counts.authAccounts,
      },
    },
    {
      key: "public_identity",
      label: "Pseudonymous public identity",
      description:
        "Current profile and current or retired handle claims associated with the account. Handles, display names, policy terms, and internal identifiers never appear in this preview.",
      counts: {
        profiles: counts.publicIdentityProfiles,
        current_handle_claims: counts.currentHandleClaims,
        retired_handle_claims: counts.retiredHandleClaims,
        unreviewed_policy_rows: counts.unreviewedIdentityRows,
      },
    },
    {
      key: "garden_workspace",
      label: "Garden workspace",
      description:
        "Owned spaces and plant objects that anchor journal history.",
      counts: {
        spaces: counts.spaces,
        plant_objects: counts.plantObjects,
      },
    },
    {
      key: "lineage_provenance",
      label: "Lineage provenance",
      description:
        "Owner-scoped provenance and private lineage interactions that preserve structure through anonymized tombstones. Source labels, question text, and contact-like details never appear in this preview.",
      counts: {
        provenance_edges: counts.lineageProvenanceEdges,
        pending_identities: counts.lineagePendingSourceIdentities,
        audit_events: counts.lineageProvenanceAuditEvents,
        follows: counts.lineageNodeFollows,
        questions: counts.lineageQuestions,
      },
    },
    {
      key: "journal_entries",
      label: "Journal entries",
      description:
        "Public entry rows grouped by lifecycle, including entries the owner already deleted whose seven-day technical retention has not elapsed. Titles and bodies are never selected into this preview.",
      counts: {
        total: counts.journalEntriesTotal,
        public_active: counts.journalEntriesPublicActive,
        deletion_pending: counts.journalEntriesDeletionPending,
        object_mentions: counts.journalEntryObjectMentions,
        catalog_mentions: counts.journalEntryCatalogMentions,
        mutation_receipts: counts.journalMutationReceipts,
      },
    },
    {
      key: "media_assets",
      label: "Media derivatives and quarantine references",
      description:
        "Photo processing rows by status, including cover-only assets. Object keys and signed URLs are never selected into this preview.",
      counts: {
        total: counts.mediaAssetsTotal,
        quarantined: counts.mediaAssetsQuarantined,
        processed: counts.mediaAssetsProcessed,
        failed: counts.mediaAssetsFailed,
        cover_only: counts.mediaAssetsCoverOnly,
        explicit_cover_refs: counts.mediaAssetsWithExplicitCover,
      },
    },
    {
      key: "social_engagement",
      label: "Social and engagement rows",
      description:
        "Profile follows/blocks, wishlist, comments, bookmarks, and notification receipts owned by or targeting the requester. Anonymous likes are classified not-account-linkable and are not counted here.",
      counts: {
        profile_follows: counts.profileFollows,
        profile_blocks: counts.profileBlocks,
        wishlist_items: counts.wishlistItems,
        comments: counts.engagementComments,
        bookmarks: counts.engagementBookmarks,
        notification_receipts: counts.notificationReceipts,
      },
    },
    {
      key: "community",
      label: "Community membership and moderation refs",
      description:
        "Memberships, contributions, and moderation actor references that must be rekeyed or cascade-deleted. Raw report text never appears.",
      counts: {
        memberships: counts.communityMemberships,
        contributions: counts.communityContributions,
        moderation_actor_refs: counts.communityModerationActorRefs,
      },
    },
    {
      key: "public_exposure",
      label: "Public slugs and tombstones",
      description:
        "Published public URLs and deletion-pending entries that return 410 Gone on the old slug.",
      counts: {
        public_slugs: counts.publicSlugs,
        gone_tombstones: counts.publicGoneTombstones,
      },
    },
    {
      key: "analytics_events",
      label: "Analytics events",
      description:
        "First-party activation/retention/value-pulse rows owned by the requester.",
      counts: {
        events: counts.analyticsEvents,
      },
    },
    {
      key: "catalog_provisional",
      label: "Catalog provisional rows",
      description:
        "User-added catalog candidates and objects still marked user_added.",
      counts: {
        provisional_catalog_items: counts.catalogProvisionalItems,
        user_added_objects: counts.plantObjectsUserAdded,
      },
    },
    {
      key: "catalog_operator_links",
      label: "Catalog operator attribution links",
      description:
        "Reviewer and author soft links on catalog suggestions, aliases, and seed proofs.",
      counts: {
        reviewer_or_author_links: counts.catalogReviewerLinks,
      },
    },
    {
      key: "search_index_artifacts",
      label: "Search and index artifacts",
      description:
        "Public entries that would have derived search documents plus journal index/unindex jobs in any queue status.",
      counts: {
        public_active_entries: counts.searchPublicActiveEntries,
        pending_index_jobs: counts.searchPendingIndexJobs,
        pending_unindex_jobs: counts.searchPendingUnindexJobs,
        terminal_jobs_with_user_id: counts.searchTerminalJobsWithUserId,
        public_projection_intents: counts.publicProjectionIntents,
      },
    },
    {
      key: "erasure_operator_records",
      label: "Erasure operator records",
      description: "Erasure intake rows linked to the requester.",
      counts: {
        erasure_requests: counts.erasureRequestsTotal,
      },
    },
  ];
}
