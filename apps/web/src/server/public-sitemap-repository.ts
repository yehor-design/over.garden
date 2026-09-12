import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/types";
import {
  publicCommunityPath,
  publicJournalEntryPath,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import {
  DEFAULT_PUBLIC_LOCALE,
  PUBLIC_LOCALES,
  localizedPath,
} from "@/lib/public-localization";
import {
  buildPublicCommunityDiscoverySource,
  getPublicCommunityPage,
} from "@/server/community-repository";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";
import { resolvePublicSurfaceDiscoveryForRequest } from "@/server/public-surface-discovery";
import { getPublicDerivativeUrl } from "@/lib/storage";
import { publicAuthorHandleSql } from "@/server/author-handle-sql";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/** Google accepts 50 000 URLs per file; smaller chunks keep each fast. */
export const PUBLIC_SITEMAP_CHUNK_SIZE = 5_000;

export interface PublicSitemapUrl {
  url: string;
  lastModified: Date;
  /**
   * The photographs on that page, for the image sitemap extension (OVE-432).
   *
   * A gardening record *is* its photographs, and image search is a first-class
   * channel for this subject — but a crawler only learns a photo exists by
   * rendering the page, and these pages stream. `<image:image>` says it in the
   * sitemap instead.
   *
   * Only entries carry them. Every other chunk lists pages whose pictures
   * belong to something else.
   */
  images?: readonly PublicSitemapImage[];
}

export interface PublicSitemapImage {
  /** Absolute or site-relative; the renderer makes it absolute. */
  url: string;
  /** The caption, which is also the `alt` the page shows (ADR-0029 D13). */
  caption: string | null;
}

/**
 * Live journal entries: active, public, launch-surface content classes.
 *
 * This predicate implies sitemap eligibility, so the chunk needs no per-URL
 * discovery gate: the row is a public candidate by construction, and
 * `journal_entries.body` carries a `1..20000` CHECK, so the empty-listing rule
 * can never fire on it. Compare `listPublicCommunitySitemapUrls`, whose
 * predicate says nothing about whether anything was contributed.
 */
function activePublicEntries(executor: QueryExecutor) {
  return executor
    .selectFrom("journal_entries")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_slug", "is not", null)
    .where(publicLaunchSurfacePredicates());
}

export async function countPublicJournalEntriesForSitemap(
  executor: QueryExecutor = db,
): Promise<number> {
  const row = await activePublicEntries(executor)
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

export async function listPublicJournalEntrySitemapUrls(
  chunkIndex: number,
  executor: QueryExecutor = db,
): Promise<PublicSitemapUrl[]> {
  const rows = await activePublicEntries(executor)
    .select([
      "journal_entries.id as entryId",
      "journal_entries.title as title",
      "journal_entries.public_slug as publicSlug",
      "journal_entries.updated_at as updatedAt",
      publicAuthorHandleSql("journal_entries.owner_user_id").as(
        "addressHandle",
      ),
    ])
    .orderBy("journal_entries.published_at", "asc")
    .orderBy("journal_entries.id", "asc")
    .limit(PUBLIC_SITEMAP_CHUNK_SIZE)
    .offset(chunkIndex * PUBLIC_SITEMAP_CHUNK_SIZE)
    .execute();

  // One statement for the whole chunk, not one per entry: a chunk holds up to
  // 5 000 URLs and a query each would make the sitemap the slowest page on the
  // site.
  const mediaRows =
    rows.length === 0
      ? []
      : await executor
          .selectFrom("media_assets")
          .select([
            "media_assets.journal_entry_id as entryId",
            "media_assets.derivative_key as derivativeKey",
            "media_assets.caption as caption",
            "media_assets.alt_text as altText",
          ])
          .where(
            "media_assets.journal_entry_id",
            "in",
            rows.map((row) => row.entryId),
          )
          .where("media_assets.usage_role", "=", "inline")
          .where("media_assets.revoked_at", "is", null)
          .where("media_assets.derivative_key", "is not", null)
          .orderBy("media_assets.document_position", "asc")
          .execute();

  const imagesByEntryId = new Map<string, PublicSitemapImage[]>();
  for (const media of mediaRows) {
    if (!media.derivativeKey) continue;
    const images = imagesByEntryId.get(media.entryId) ?? [];
    images.push({
      url: getPublicDerivativeUrl(media.derivativeKey),
      caption: media.caption?.trim() || media.altText?.trim() || null,
    });
    imagesByEntryId.set(media.entryId, images);
  }
  // An entry whose author has no handle has no canonical address, and a
  // sitemap that submitted its legacy one would be submitting a 308
  // (ADR-0022 D3: a sitemap lists canonicals and nothing else).
  return rows.flatMap((row) =>
    row.publicSlug && row.addressHandle
      ? [
          {
            url: publicJournalEntryPath(row.addressHandle, row.publicSlug),
            lastModified: toDate(row.updatedAt),
            images: (imagesByEntryId.get(row.entryId) ?? []).map((image) => ({
              url: image.url,
              // A photo with no caption of its own is still the entry's photo,
              // and the entry's title is what the page shows for it — one
              // rule, the same as `publicMediaAltText` (OVE-432).
              caption: image.caption ?? row.title,
            })),
          },
        ]
      : [],
  );
}

/**
 * Profiles that have at least one live public entry, every locale variant.
 *
 * The `exists(activePublicEntries)` clause is what makes a per-URL discovery
 * gate unnecessary here: a profile in this set always has content.
 */
function profilesWithPublicEntries(executor: QueryExecutor) {
  return executor
    .selectFrom("user_public_profiles")
    .where("user_public_profiles.profile_lifecycle_state", "=", "active")
    .where("user_public_profiles.removed_at", "is", null)
    .where((eb) =>
      eb.exists(
        activePublicEntries(executor)
          .select("journal_entries.id")
          .where(
            "journal_entries.owner_user_id",
            "=",
            sql.ref<string>("user_public_profiles.user_id"),
          ),
      ),
    );
}

export async function countPublicProfilesForSitemap(
  executor: QueryExecutor = db,
): Promise<number> {
  const row = await profilesWithPublicEntries(executor)
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

export async function listPublicProfileSitemapUrls(
  chunkIndex: number,
  executor: QueryExecutor = db,
): Promise<PublicSitemapUrl[]> {
  const rows = await profilesWithPublicEntries(executor)
    .select([
      "user_public_profiles.handle as handle",
      "user_public_profiles.updated_at as updatedAt",
    ])
    .orderBy("user_public_profiles.created_at", "asc")
    .orderBy("user_public_profiles.user_id", "asc")
    .limit(sitemapRowsPerChunk(PUBLIC_LOCALES.length))
    .offset(chunkIndex * sitemapRowsPerChunk(PUBLIC_LOCALES.length))
    .execute();
  return rows.flatMap((row) =>
    PUBLIC_LOCALES.map((locale) => ({
      url: publicProfilePath(locale, row.handle),
      lastModified: toDate(row.updatedAt),
    })),
  );
}

/**
 * Communities on curated topics, every locale variant that is actually
 * indexable.
 *
 * Unlike entries and profiles, the SQL predicate here does not imply
 * eligibility: a community can be active, on a curated topic, and hold no
 * contributions at all, which the empty-listing rule refuses. Every live
 * community URL was `noindex, nofollow` and submitted before this gate
 * existed, which is exactly what Search Console reports as
 * "Submitted URL marked 'noindex'".
 *
 * Contributions do not vary by locale, so the page loads once and each locale's
 * decision is evaluated against that one model.
 */
export async function listPublicCommunitySitemapUrls(
  executor: QueryExecutor = db,
): Promise<PublicSitemapUrl[]> {
  const rows = await executor
    .selectFrom("communities")
    .innerJoin(
      "journal_topics",
      "journal_topics.id",
      "communities.journal_topic_id",
    )
    .select(["communities.slug as slug", "communities.updated_at as updatedAt"])
    .where("communities.lifecycle_state", "in", ["active", "archived"])
    .where("journal_topics.trust_state", "=", "curated")
    .orderBy("communities.created_at", "asc")
    .execute();
  const pages = await Promise.all(
    rows.map(async (row) => ({
      row,
      page: await getPublicCommunityPage(row.slug, DEFAULT_PUBLIC_LOCALE, {
        executor,
      }),
    })),
  );

  return pages.flatMap(({ row, page }) => {
    if (!page) return [];
    return PUBLIC_LOCALES.flatMap((locale) => {
      const decision = resolvePublicSurfaceDiscoveryForRequest(
        buildPublicCommunityDiscoverySource(locale, page),
      ).decision;
      if (!decision.sitemapEligible) return [];
      return [
        {
          url: localizedPath(locale, publicCommunityPath(row.slug)),
          lastModified: toDate(row.updatedAt),
        },
      ];
    });
  });
}

/**
 * Chunks are budgeted in emitted URLs, not in rows. A row that yields one URL
 * per locale fills the budget three times faster, so a "5 000" profile chunk
 * used to hold 15 000 URLs.
 */
export function sitemapRowsPerChunk(urlsPerRow: number): number {
  return Math.max(1, Math.floor(PUBLIC_SITEMAP_CHUNK_SIZE / urlsPerRow));
}

export function sitemapChunkCount(total: number, urlsPerRow = 1): number {
  return Math.max(1, Math.ceil(total / sitemapRowsPerChunk(urlsPerRow)));
}

function toDate(value: Date | string | null | undefined): Date {
  if (value instanceof Date) return value;
  const parsed = value ? new Date(value) : new Date(0);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(0);
}
