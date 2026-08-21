import type { Ove330ServeClass } from "@/lib/media/presentation-contract";

export interface CatalogAvailabilitySuggestion {
  id: string;
  displayName: string;
  canonicalName: string;
  serveClass?: Ove330ServeClass;
}

export function catalogMeiliServeClass(
  hit: unknown,
  suggestion: CatalogAvailabilitySuggestion,
  query: string,
): Ove330ServeClass | null {
  const normalizedQuery = normalizeAvailabilityText(query);
  const exactTextMatch = isRecord(hit)
    ? [hit.normalizedName, hit.displayName, hit.canonicalName].some((value) =>
        textMatches(value, normalizedQuery),
      )
    : textMatches(suggestion.displayName, normalizedQuery) ||
      textMatches(suggestion.canonicalName, normalizedQuery);

  if (!exactTextMatch) {
    return hasMeiliRankingEvidence(hit) ? "low_confidence" : null;
  }
  return suggestion.serveClass === "generated" ? "generated" : "exact";
}

export function classifyHomonymousCatalogSuggestions<
  T extends CatalogAvailabilitySuggestion & { serveClass: Ove330ServeClass },
>(suggestions: readonly T[]): T[] {
  const idsByName = new Map<string, Set<string>>();
  for (const suggestion of suggestions) {
    const key = normalizeAvailabilityText(suggestion.displayName);
    if (!key) continue;
    const ids = idsByName.get(key) ?? new Set<string>();
    ids.add(suggestion.id);
    idsByName.set(key, ids);
  }

  return suggestions.map((suggestion) => {
    const ids = idsByName.get(
      normalizeAvailabilityText(suggestion.displayName),
    );
    return ids && ids.size > 1
      ? ({ ...suggestion, serveClass: "homonymous" } as T)
      : suggestion;
  });
}

function hasMeiliRankingEvidence(hit: unknown) {
  if (!isRecord(hit)) return false;
  const details = hit._rankingScoreDetails;
  if (!isRecord(details)) return false;
  const typo = details.typo;
  const exactness = details.exactness;
  return (
    (isRecord(typo) &&
      typeof typo.typoCount === "number" &&
      Number.isFinite(typo.typoCount)) ||
    (isRecord(exactness) &&
      typeof exactness.maxMatchingWords === "number" &&
      Number.isFinite(exactness.maxMatchingWords))
  );
}

function textMatches(value: unknown, normalizedQuery: string) {
  return (
    typeof value === "string" &&
    normalizeAvailabilityText(value).includes(normalizedQuery)
  );
}

function normalizeAvailabilityText(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 120).toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
