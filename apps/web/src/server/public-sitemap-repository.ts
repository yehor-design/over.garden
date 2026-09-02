import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/types";
import {
  publicJournalEntryPath,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import { PUBLIC_LOCALES, localizedPath } from "@/lib/public-localization";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/** Google accepts 50 000 URLs per file; smaller chunks keep each fast. */
export const PUBLIC_SITEMAP_CHUNK_SIZE = 5_000;

export interface PublicSitemapUrl {
  url: string;
  lastModified: Date;
}

/** Live journal entries: active, public, launch-surface content classes. */
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
      "journal_entries.public_slug as publicSlug",
      "journal_entries.updated_at as updatedAt",
    ])
    .orderBy("journal_entries.published_at", "asc")
    .orderBy("journal_entries.id", "asc")
    .limit(PUBLIC_SITEMAP_CHUNK_SIZE)
    .offset(chunkIndex * PUBLIC_SITEMAP_CHUNK_SIZE)
    .execute();
  return rows.flatMap((row) =>
    row.publicSlug
      ? [
          {
            url: publicJournalEntryPath(row.publicSlug),
            lastModified: toDate(row.updatedAt),
          },
        ]
      : [],
  );
}

/** Profiles that have at least one live public entry, every locale variant. */
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
    .limit(PUBLIC_SITEMAP_CHUNK_SIZE)
    .offset(chunkIndex * PUBLIC_SITEMAP_CHUNK_SIZE)
    .execute();
  return rows.flatMap((row) =>
    PUBLIC_LOCALES.map((locale) => ({
      url: publicProfilePath(locale, row.handle),
      lastModified: toDate(row.updatedAt),
    })),
  );
}

/** Communities on curated topics, every locale variant. */
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
  return rows.flatMap((row) =>
    PUBLIC_LOCALES.map((locale) => ({
      url: localizedPath(locale, `/communities/${row.slug}`),
      lastModified: toDate(row.updatedAt),
    })),
  );
}

export function sitemapChunkCount(total: number): number {
  return Math.max(1, Math.ceil(total / PUBLIC_SITEMAP_CHUNK_SIZE));
}

function toDate(value: Date | string | null | undefined): Date {
  if (value instanceof Date) return value;
  const parsed = value ? new Date(value) : new Date(0);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(0);
}
