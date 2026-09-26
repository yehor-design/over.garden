import { connection } from "next/server";

import { searchStandardSpeciesForTypeahead } from "@/server/catalog-repository";
import { answerCatalogTypeahead } from "@/server/catalog-typeahead-response";

/**
 * The species step's read (OVE-524, ADR-0035 D3): species of the standard
 * base, of the object's kind, by every name the base holds — and nothing else
 * in the catalogue. Its statement reads the base alone, so its work does not
 * grow with the query and the first search after a cold start answers
 * (`STANDARD_SPECIES_TYPEAHEAD_DEADLINE_MS`). GET only; the answer, its cache
 * and its failure are `answerCatalogTypeahead`'s.
 */
export async function GET(request: Request) {
  // The answer depends on the query string: never a prerendered response.
  await connection();
  return answerCatalogTypeahead(request, searchStandardSpeciesForTypeahead);
}
