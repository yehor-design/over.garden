import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  JOURNAL_MEDIA_USAGE_COVER_ONLY,
  JOURNAL_MEDIA_USAGE_INLINE,
} from "@/lib/garden/journal-cover-contract";
import { getPublicDerivativeUrl } from "@/lib/storage";
import {
  buildJournalEntrySearchDocumentContractFixture,
  type JournalEntrySearchContractDocument,
  type JournalSearchCoverSource,
} from "@/server/search/documents";
import { isSafeJournalSearchDocumentId } from "@/server/search/public-journal-document-id";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export interface PublicJournalSearchExpectedRow {
  id: string;
  ownerUserId: string;
  document: JournalEntrySearchContractDocument;
  fingerprint: string;
}

/**
 * Canonical global Meilisearch eligibility: public active published journals
 * with public-safe owner profile. Route feed/directory may narrow further.
 */
export function buildGloballyEligibleJournalSearchRowsQuery(
  executor: QueryExecutor = db,
) {
  const coverMedia = executor
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
    .distinctOn(["media_assets.journal_entry_id"])
    .select([
      "media_assets.journal_entry_id as journalEntryId",
      "media_assets.id as mediaId",
      "media_assets.usage_role as usageRole",
      "media_assets.derivative_key as derivativeKey",
      "journal_entries.cover_media_asset_id as coverMediaAssetId",
    ])
    .where("media_assets.journal_entry_id", "is not", null)
    .where("media_assets.status", "=", "processed")
    .where("media_assets.derivative_key", "is not", null)
    .where("media_assets.revoked_at", "is", null)
    .where((eb) =>
      eb.or([
        eb(
          "media_assets.id",
          "=",
          eb.ref("journal_entries.cover_media_asset_id"),
        ),
        eb("media_assets.usage_role", "=", JOURNAL_MEDIA_USAGE_INLINE),
      ]),
    )
    .orderBy("media_assets.journal_entry_id", "asc")
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
    .as("eligible_cover_media");

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
    .innerJoin("user_handle_registry", (join) =>
      join
        .onRef(
          "user_handle_registry.user_id",
          "=",
          "journal_entries.owner_user_id",
        )
        .on("user_handle_registry.lifecycle_state", "=", "current"),
    )
    .innerJoin("user_public_profiles", (join) =>
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
    .leftJoin(coverMedia, (join) =>
      join.onRef("eligible_cover_media.journalEntryId", "=", "journal_entries.id"),
    )
    .select([
      "journal_entries.id as id",
      "journal_entries.owner_user_id as ownerUserId",
      "journal_entries.title as title",
      "journal_entries.body as body",
      "journal_entries.public_slug as publicSlug",
      "journal_entries.public_noindex as publicNoindex",
      "journal_entries.public_gone_at as publicGoneAt",
      "journal_entries.published_at as publishedAt",
      "journal_entries.entry_date as entryDate",
      "journal_entries.entry_scope as entryScope",
      "journal_entries.created_at as createdAt",
      "journal_entries.visibility as visibility",
      "journal_entries.lifecycle_state as lifecycleState",
      sql<string>`case
        when ${sql.ref("journal_entries.entry_scope")} = 'space'
          then ${sql.ref("spaces.location_visibility")}
        else ${sql.ref("plant_objects.location_visibility")}
      end`.as("locationVisibility"),
      sql<string | null>`case
        when ${sql.ref("journal_entries.entry_scope")} = 'space'
         and ${sql.ref("spaces.location_visibility")} = 'region'
          then ${sql.ref("spaces.coarse_region_code")}
        when ${sql.ref("plant_objects.location_visibility")} = 'region' then
          coalesce(
            ${sql.ref("plant_objects.coarse_region_code")},
            case
              when ${sql.ref("spaces.location_visibility")} = 'region'
                then ${sql.ref("spaces.coarse_region_code")}
              else null
            end
          )
        else null
      end`.as("coarseRegionCode"),
      "eligible_cover_media.mediaId as coverMediaId",
      "eligible_cover_media.usageRole as coverUsageRole",
      "eligible_cover_media.derivativeKey as coverDerivativeKey",
      "eligible_cover_media.coverMediaAssetId as explicitCoverMediaAssetId",
    ])
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .where("journal_entries.entry_scope", "in", ["object", "space"])
    .where("journal_entries.title", "<>", "")
    .where("journal_entries.body", "<>", "")
    .where(publicLaunchSurfacePredicates())
    .$narrowType<{
      publicSlug: string;
      publishedAt: Date;
      coverDerivativeKey: string | null;
    }>();
}

export async function listGloballyEligibleJournalSearchDocuments(
  executor: QueryExecutor = db,
): Promise<PublicJournalSearchExpectedRow[]> {
  const rows = await buildGloballyEligibleJournalSearchRowsQuery(executor).execute();
  const expected: PublicJournalSearchExpectedRow[] = [];

  for (const row of rows) {
    if (!isSafeJournalSearchDocumentId(row.id)) continue;
    const cover = resolveCoverPresentation({
      coverMediaId: row.coverMediaId,
      coverUsageRole: row.coverUsageRole,
      coverDerivativeKey: row.coverDerivativeKey,
      explicitCoverMediaAssetId: row.explicitCoverMediaAssetId,
    });
    const document = buildJournalEntrySearchDocumentContractFixture({
      id: row.id,
      title: row.title,
      body: row.body,
      public_slug: row.publicSlug,
      public_noindex: row.publicNoindex,
      public_gone_at: row.publicGoneAt,
      published_at: row.publishedAt,
      entry_date: row.entryDate,
      entry_scope: row.entryScope,
      created_at: row.createdAt,
      visibility: row.visibility,
      lifecycle_state: row.lifecycleState,
      location_visibility: row.locationVisibility,
      coarse_region_code: row.coarseRegionCode,
      owner_profile_public_safe: true,
      cover_source: cover.coverSource,
      cover_public_url: cover.coverPublicUrl,
    });
    if (!document) continue;
    expected.push({
      id: document.id,
      ownerUserId: row.ownerUserId,
      document,
      fingerprint: fingerprintJournalSearchDocument(document),
    });
  }

  return expected;
}

export function fingerprintJournalSearchDocument(
  document: JournalEntrySearchContractDocument,
): string {
  return [
    document.id,
    document.kind,
    document.entryScope,
    document.locationVisibility,
    document.coarseRegionCode ?? "",
    document.noindex ? "1" : "0",
    document.coverSource,
    document.coverPublicUrl ? "url" : "none",
    Object.keys(document).sort().join(","),
  ].join("|");
}

export function resolveCoverPresentation(input: {
  coverMediaId: string | null;
  coverUsageRole: string | null;
  coverDerivativeKey: string | null;
  explicitCoverMediaAssetId: string | null;
}): {
  coverSource: JournalSearchCoverSource;
  coverPublicUrl: string | null;
} {
  if (!input.coverMediaId || !input.coverDerivativeKey) {
    return { coverSource: "none", coverPublicUrl: null };
  }
  const coverPublicUrl = getPublicDerivativeUrl(input.coverDerivativeKey);
  if (input.explicitCoverMediaAssetId === input.coverMediaId) {
    if (input.coverUsageRole === JOURNAL_MEDIA_USAGE_COVER_ONLY) {
      return { coverSource: "separate", coverPublicUrl };
    }
    return { coverSource: "explicit_inline", coverPublicUrl };
  }
  if (input.coverUsageRole === JOURNAL_MEDIA_USAGE_INLINE) {
    return { coverSource: "automatic_inline", coverPublicUrl };
  }
  return { coverSource: "none", coverPublicUrl: null };
}
