import { db } from "@/db";
import { buildEnqueueCatalogFuzzyDuplicateQaRefreshJobQuery } from "./entity-resolution-qa-repository";

export async function enqueueCatalogFuzzyDuplicateQaRefresh() {
  return buildEnqueueCatalogFuzzyDuplicateQaRefreshJobQuery(
    db,
  ).executeTakeFirstOrThrow();
}
