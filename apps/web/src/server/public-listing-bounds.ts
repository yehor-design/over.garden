import "server-only";

import type { Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  isCursorListing,
  paginatedListingPageSize,
  requestedListingCursor,
  requestedListingPage,
} from "@/lib/public-listing-pagination";
import {
  buildPublicFeedEntriesQuery,
  normalizePublicFeedRequest,
} from "@/server/public-feed-repository";
import { countPublicJournalEntriesForSitemap } from "@/server/public-sitemap-repository";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export async function isListingPageBeyondTheEnd(
  pathname: string,
  search: URLSearchParams,
  executor: QueryExecutor = db,
): Promise<boolean> {
  const pageSize = paginatedListingPageSize(pathname);
  if (pageSize === null) return false;
  const page = requestedListingPage(search);
  if (page === null) return false;

  const total = await countPublicJournalEntriesForSitemap(executor);
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  return page > maxPage;
}

/**
 * A later portion of a cursor listing that is not one: a cursor that does not
 * decode, or one with no entry after it under the same filters. Either would
 * answer `200` with an empty list — crawlable nothing behind one parameter.
 */
export async function isListingCursorBeyondTheEnd(
  pathname: string,
  search: URLSearchParams,
  executor: QueryExecutor = db,
): Promise<boolean> {
  if (!isCursorListing(pathname)) return false;
  const raw = requestedListingCursor(search);
  if (raw === null) return false;
  const request = normalizePublicFeedRequest({
    cursor: raw,
    kind: search.get("kind") ?? undefined,
    topic: search.get("topic") ?? undefined,
  });
  if (!request.cursor) return true;
  const rows = await buildPublicFeedEntriesQuery(executor, {
    ...request,
    pageSize: 1,
  }).execute();
  return rows.length === 0;
}
