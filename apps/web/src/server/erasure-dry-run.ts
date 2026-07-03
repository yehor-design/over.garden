export type ErasureDryRunDataClassKey =
  | "account_auth"
  | "garden_workspace"
  | "lineage_provenance"
  | "journal_entries"
  | "media_assets"
  | "public_exposure"
  | "analytics_events"
  | "catalog_provisional"
  | "search_index_artifacts"
  | "pilot_operator_records";

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
  pilotInviteGrantPresent: number;
  spaces: number;
  plantObjects: number;
  lineageProvenanceEdges: number;
  lineageProvenanceAuditEvents: number;
  journalEntriesTotal: number;
  journalEntriesPrivateActive: number;
  journalEntriesPublicActive: number;
  journalEntriesArchived: number;
  mediaAssetsTotal: number;
  mediaAssetsQuarantined: number;
  mediaAssetsProcessed: number;
  mediaAssetsFailed: number;
  publicSlugs: number;
  publicGoneTombstones: number;
  analyticsEvents: number;
  catalogProvisionalItems: number;
  plantObjectsUserAdded: number;
  searchPublicActiveEntries: number;
  searchPendingIndexJobs: number;
  searchPendingUnindexJobs: number;
  pilotInterviewRecords: number;
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
        "Better Auth user row, linked sessions, credential/provider accounts, and closed-pilot invite grant.",
      counts: {
        user_row: counts.authUserPresent,
        sessions: counts.authSessions,
        accounts: counts.authAccounts,
        pilot_invite_grant: counts.pilotInviteGrantPresent,
      },
    },
    {
      key: "garden_workspace",
      label: "Garden workspace",
      description: "Owned spaces and plant objects that anchor journal history.",
      counts: {
        spaces: counts.spaces,
        plant_objects: counts.plantObjects,
      },
    },
    {
      key: "lineage_provenance",
      label: "Lineage provenance",
      description:
        "Owner-scoped provenance edges that preserve structure through anonymized tombstones. Source labels and contact-like details never appear in this preview.",
      counts: {
        provenance_edges: counts.lineageProvenanceEdges,
        audit_events: counts.lineageProvenanceAuditEvents,
      },
    },
    {
      key: "journal_entries",
      label: "Journal entries",
      description:
        "Private and public entry rows grouped by lifecycle. Titles and bodies are never selected into this preview.",
      counts: {
        total: counts.journalEntriesTotal,
        private_active: counts.journalEntriesPrivateActive,
        public_active: counts.journalEntriesPublicActive,
        archived: counts.journalEntriesArchived,
      },
    },
    {
      key: "media_assets",
      label: "Media derivatives and quarantine references",
      description:
        "Photo processing rows by status. Object keys and signed URLs are never selected into this preview.",
      counts: {
        total: counts.mediaAssetsTotal,
        quarantined: counts.mediaAssetsQuarantined,
        processed: counts.mediaAssetsProcessed,
        failed: counts.mediaAssetsFailed,
      },
    },
    {
      key: "public_exposure",
      label: "Public slugs and tombstones",
      description:
        "Published public URLs and archived entries that return 410 Gone on the old slug.",
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
      key: "search_index_artifacts",
      label: "Search and index artifacts",
      description:
        "Public entries that would have derived search documents plus pending journal index/unindex jobs.",
      counts: {
        public_active_entries: counts.searchPublicActiveEntries,
        pending_index_jobs: counts.searchPendingIndexJobs,
        pending_unindex_jobs: counts.searchPendingUnindexJobs,
      },
    },
    {
      key: "pilot_operator_records",
      label: "Pilot operator records",
      description:
        "Structured interview learnings linked to the requester plus erasure intake rows.",
      counts: {
        interview_records: counts.pilotInterviewRecords,
        erasure_requests: counts.erasureRequestsTotal,
      },
    },
  ];
}
