import { connection } from "next/server";

import { searchCatalogSuggestionsForTypeaheadResult } from "@/server/catalog-repository";
import { answerCatalogTypeahead } from "@/server/catalog-typeahead-response";

/**
 * The picker's read (ADR-0026 D7): catalog identities of every kind the object
 * can have. GET only; the answer, its cache and its failure are
 * `answerCatalogTypeahead`'s.
 */
export async function GET(request: Request) {
  // The answer depends on the query string: never a prerendered response.
  await connection();
  return answerCatalogTypeahead(
    request,
    searchCatalogSuggestionsForTypeaheadResult,
  );
}
