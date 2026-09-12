import "server-only";

import type { Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  paginatedListingPageSize,
  requestedListingPage,
} from "@/lib/public-listing-pagination";
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
