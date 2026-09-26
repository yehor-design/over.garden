import "server-only";

import { CATALOG_TYPEAHEAD_MAX_QUERY_LENGTH } from "@/lib/garden/catalog-typeahead-contract";
import { isPublicLocale, type PublicLocale } from "@/lib/public-localization";
import type {
  CatalogSuggestion,
  CatalogTypeaheadSearchOptions,
  CatalogTypeaheadSearchResult,
} from "@/server/catalog-repository";

/**
 * The HTTP half of the picker's reads (ADR-0026 D7): the whole-catalogue
 * typeahead and the species step's standard-base search (OVE-524) answer the
 * same way. Public data only, in the requested locale and object kind, from
 * Postgres alone. It reads no cookie and no session, so the answer may sit in
 * a shared cache for a minute — the one exception to `AGENTS.md` hard rule 5,
 * made for these routes. A failure or a missed deadline answers 503 with no
 * cache, and the picker keeps its own-name outcome.
 */
export const PUBLIC_CATALOG_TYPEAHEAD_CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

export async function answerCatalogTypeahead(
  request: Request,
  search: (
    query: string,
    options: CatalogTypeaheadSearchOptions,
  ) => Promise<CatalogTypeaheadSearchResult>,
): Promise<Response> {
  const startedAt = performance.now();

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").slice(
    0,
    CATALOG_TYPEAHEAD_MAX_QUERY_LENGTH,
  );
  const kind = url.searchParams.get("kind");
  const localeParam = url.searchParams.get("locale") ?? "uk";
  if (kind !== "plant" && kind !== "animal") {
    return publicJson({ suggestions: [], state: "empty" }, 400, {
      "Cache-Control": "no-store",
      ...timingHeaders(startedAt, 0),
    });
  }
  const locale: PublicLocale = isPublicLocale(localeParam) ? localeParam : "uk";

  try {
    const result = await search(query, { objectKind: kind, locale });
    return publicJson(
      {
        suggestions: result.suggestions.map(serializeSuggestion),
        state: result.state,
      },
      200,
      {
        "Cache-Control": PUBLIC_CATALOG_TYPEAHEAD_CACHE_CONTROL,
        ...timingHeaders(startedAt, result.databaseMs),
      },
    );
  } catch {
    return publicJson({ suggestions: [], state: "unavailable" }, 503, {
      "Cache-Control": "no-store",
      "Retry-After": "5",
      ...timingHeaders(startedAt, 0),
    });
  }
}

/** Null fields are omitted: eight rows must fit in a kilobyte. */
function serializeSuggestion(suggestion: CatalogSuggestion) {
  return {
    id: suggestion.id,
    displayName: suggestion.displayName,
    kind: suggestion.kind,
    ...(suggestion.matchedName ? { matchedName: suggestion.matchedName } : {}),
    ...(suggestion.parentDisplayName
      ? { parentDisplayName: suggestion.parentDisplayName }
      : {}),
    ...(suggestion.publicPath ? { publicPath: suggestion.publicPath } : {}),
  };
}

function timingHeaders(startedAt: number, databaseMs: number) {
  const total = Math.max(0, performance.now() - startedAt).toFixed(2);
  return {
    "Server-Timing": `db;dur=${databaseMs.toFixed(2)}, total;dur=${total}`,
  };
}

function publicJson(
  body: unknown,
  status: number,
  headers: Record<string, string>,
) {
  return Response.json(body, { status, headers });
}
