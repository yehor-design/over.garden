import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { getCommunityContentCopy } from "@/lib/community-copy";
import {
  publicCommunityPath,
  publicJournalEntryPath,
  publicProfileBasePath,
} from "@/lib/garden/public-paths";
import {
  normalizePublicContentLanguage,
  type PublicLocale,
} from "@/lib/public-localization";
import { publicAuthorHandleSql } from "@/server/author-handle-sql";
import { listPublicCommunities } from "@/server/community-repository";
import {
  searchCatalogSuggestionsForTypeaheadResult,
  type CatalogSuggestion,
} from "@/server/catalog-repository";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";

/**
 * The command palette's read (DESIGN.md §5.2): four public corpora in one
 * round trip, each bounded, each already public.
 *
 * **What it is not.** It is not a replacement for `/journals` or the catalogue.
 * Those stay full, crawlable, no-JavaScript search pages, because everything
 * public is indexable (ADR-0022 D3) and a palette that replaced them would take
 * 114,669 pages out of the index — the opposite of what the product is for.
 *
 * **It reads no cookie and no session.** Nothing here is scoped to a viewer, so
 * the same query answers the same way for everybody and there is nothing
 * personal to leak into a cache. The route above it still answers `no-store`:
 * the one caching exception in `AGENTS.md` rule 5 is `/api/public/catalog/`
 * and this is not that route.
 *
 * The organism group goes through the picker's own statement (ADR-0026 D7),
 * which is kind-scoped, so it runs once per kind and interleaves the two — a
 * reader searching "роза" wants roses before they want a breed, and a reader
 * searching "карпатка" wants the bee.
 */
type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const PALETTE_GROUP_LIMIT = 5;
export const PALETTE_MIN_QUERY_LENGTH = 2;
export const PALETTE_MAX_QUERY_LENGTH = 80;

export type PublicPaletteGroupKey =
  | "journals"
  | "organisms"
  | "gardeners"
  | "communities";

export interface PublicPaletteResult {
  key: PublicPaletteGroupKey;
  /** Stable within a group, for `aria-activedescendant`. */
  id: string;
  label: string;
  /** One line of context: an author, a rank, a member count. */
  detail: string | null;
  href: string;
  /** Set when this result's own words are not the reader's language. */
  language: PublicLocale | null;
}

export interface PublicPaletteGroups {
  query: string;
  groups: Array<{ key: PublicPaletteGroupKey; results: PublicPaletteResult[] }>;
}

export function normalizePaletteQuery(value: string | null | undefined) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/gu, " ").slice(0, PALETTE_MAX_QUERY_LENGTH);
}

export async function searchPublicPalette(
  rawQuery: string,
  options: { locale: PublicLocale; executor?: QueryExecutor },
): Promise<PublicPaletteGroups> {
  const query = normalizePaletteQuery(rawQuery);
  if (query.length < PALETTE_MIN_QUERY_LENGTH) {
    return { query, groups: [] };
  }
  const executor = options.executor ?? db;

  const [journals, organisms, gardeners, communities] = await Promise.all([
    searchJournals(query, options.locale, executor).catch(() => []),
    searchOrganisms(query, options.locale).catch(() => []),
    searchGardeners(query, options.locale, executor).catch(() => []),
    searchCommunities(query, options.locale).catch(() => []),
  ]);

  return {
    query,
    groups: [
      { key: "journals" as const, results: journals },
      { key: "organisms" as const, results: organisms },
      { key: "gardeners" as const, results: gardeners },
      { key: "communities" as const, results: communities },
    ].filter((group) => group.results.length > 0),
  };
}

async function searchJournals(
  query: string,
  locale: PublicLocale,
  executor: QueryExecutor,
): Promise<PublicPaletteResult[]> {
  const pattern = `%${escapeLikePattern(query)}%`;
  const rows = await executor
    .selectFrom("journal_entries")
    .select([
      "journal_entries.id as id",
      "journal_entries.title as title",
      "journal_entries.public_slug as publicSlug",
      "journal_entries.source_language as sourceLanguage",
      publicAuthorHandleSql("journal_entries.owner_user_id").as(
        "addressHandle",
      ),
    ])
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .where(publicLaunchSurfacePredicates())
    // An entry whose author holds no handle has no public address at all
    // (ADR-0029 D9), so it is not a row a palette can offer.
    .where(
      publicAuthorHandleSql("journal_entries.owner_user_id"),
      "is not",
      null,
    )
    .where(sql<boolean>`journal_entries.title ilike ${pattern}`)
    .orderBy("journal_entries.published_at", "desc")
    .limit(PALETTE_GROUP_LIMIT)
    .execute();

  return rows.flatMap((row) => {
    if (!row.publicSlug || !row.addressHandle) return [];
    const language = normalizePublicContentLanguage(row.sourceLanguage);
    return [
      {
        key: "journals" as const,
        id: `journals:${row.id}`,
        label: row.title,
        detail: `@${row.addressHandle}`,
        href: publicJournalEntryPath(row.addressHandle, row.publicSlug),
        language: language === locale ? null : language,
      },
    ];
  });
}

async function searchOrganisms(
  query: string,
  locale: PublicLocale,
): Promise<PublicPaletteResult[]> {
  const [plants, animals] = await Promise.all([
    searchCatalogSuggestionsForTypeaheadResult(query, {
      objectKind: "plant",
      locale,
      limit: PALETTE_GROUP_LIMIT,
    }).catch(() => ({ suggestions: [] as CatalogSuggestion[] })),
    searchCatalogSuggestionsForTypeaheadResult(query, {
      objectKind: "animal",
      locale,
      limit: PALETTE_GROUP_LIMIT,
    }).catch(() => ({ suggestions: [] as CatalogSuggestion[] })),
  ]);

  const interleaved: CatalogSuggestion[] = [];
  for (let index = 0; index < PALETTE_GROUP_LIMIT; index += 1) {
    const plant = plants.suggestions[index];
    const animal = animals.suggestions[index];
    if (plant) interleaved.push(plant);
    if (animal) interleaved.push(animal);
  }

  const seen = new Set<string>();
  return interleaved
    .filter((suggestion) => {
      if (!suggestion.publicPath || seen.has(suggestion.id)) return false;
      seen.add(suggestion.id);
      return true;
    })
    .slice(0, PALETTE_GROUP_LIMIT)
    .map((suggestion) => ({
      key: "organisms" as const,
      id: `organisms:${suggestion.id}`,
      label: suggestion.displayName,
      detail: suggestion.parentDisplayName ?? suggestion.matchedName,
      href: suggestion.publicPath!,
      language: null,
    }));
}

async function searchGardeners(
  query: string,
  locale: PublicLocale,
  executor: QueryExecutor,
): Promise<PublicPaletteResult[]> {
  const pattern = `%${escapeLikePattern(query.replace(/^@/u, ""))}%`;
  const rows = await executor
    .selectFrom("user_public_profiles")
    .select([
      "user_public_profiles.user_id as userId",
      "user_public_profiles.handle as handle",
      "user_public_profiles.display_name as displayName",
    ])
    .where("user_public_profiles.profile_lifecycle_state", "=", "active")
    .where("user_public_profiles.removed_at", "is", null)
    .where(
      sql<boolean>`(user_public_profiles.handle ilike ${pattern}
        or user_public_profiles.display_name ilike ${pattern})`,
    )
    .orderBy("user_public_profiles.handle", "asc")
    .limit(PALETTE_GROUP_LIMIT)
    .execute();

  return rows.map((row) => ({
    key: "gardeners" as const,
    id: `gardeners:${row.userId}`,
    label: row.displayName ?? `@${row.handle}`,
    detail: `@${row.handle}`,
    // The profile's address is locale-prefixed for the reader's language, the
    // way every public link in the shell is.
    href: localizedProfilePath(locale, row.handle),
    language: null,
  }));
}

async function searchCommunities(
  query: string,
  locale: PublicLocale,
): Promise<PublicPaletteResult[]> {
  // The directory is a handful of rows and is already read once per request
  // through `React.cache`, so the filter is in memory rather than a statement.
  const communities = await listPublicCommunities();
  const needle = query.toLocaleLowerCase();
  return communities
    .filter((community) => community.navigationReady)
    .map((community) => ({
      community,
      copy: getCommunityContentCopy(locale, community.contentKey),
    }))
    .filter(
      ({ community, copy }) =>
        copy.name.toLocaleLowerCase().includes(needle) ||
        community.slug.toLocaleLowerCase().includes(needle),
    )
    .slice(0, PALETTE_GROUP_LIMIT)
    .map(({ community, copy }) => ({
      key: "communities" as const,
      id: `communities:${community.id}`,
      label: copy.name,
      detail: null,
      href: publicCommunityPath(community.slug),
      language: null,
    }));
}

function localizedProfilePath(locale: PublicLocale, handle: string) {
  return locale === "uk"
    ? publicProfileBasePath(handle)
    : `/${locale}${publicProfileBasePath(handle)}`;
}

/**
 * `ilike` treats `%` and `_` as wildcards, so a reader searching for "50_50"
 * would match everything. Escaped with a backslash, which is Postgres' default
 * escape character for `like`.
 */
function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}
