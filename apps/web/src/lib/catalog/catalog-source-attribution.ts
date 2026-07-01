import { EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE } from "./eu-official-journal-common-catalogue";

export const EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_ATTRIBUTION =
  "Source: Official Journal of the European Union / EUR-Lex. Normalized by OverGarden." as const;

export const EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_CAVEAT =
  "The EU Plant Variety Portal has no legal value; the Official Journal is the legally binding Common Catalogue source." as const;

export interface CatalogSourceAttributionCredit {
  sourceSlug: string;
  sourceName: string;
  sourceUrl: string;
  attributionText: string | null;
}

export function catalogSourceAttributionSummary(
  credit: CatalogSourceAttributionCredit,
) {
  if (credit.sourceSlug === EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug) {
    return EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_ATTRIBUTION;
  }

  return `Source: ${credit.sourceName}. Normalized by OverGarden.`;
}

export function catalogSourceAttributionCaveat(
  credit: CatalogSourceAttributionCredit,
) {
  if (credit.sourceSlug === EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug) {
    return EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_UI_CAVEAT;
  }

  return null;
}
