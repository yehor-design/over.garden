import { connection } from "next/server";

import { isPublicLocale, type PublicLocale } from "@/lib/public-localization";
import { CATALOG_TYPEAHEAD_MAX_QUERY_LENGTH } from "@/lib/garden/catalog-typeahead-contract";
import {
  searchCatalogSuggestionsForTypeaheadResult,
  type CatalogSuggestion,
} from "@/server/catalog-repository";
import {
  searchColUsages,
  type ColUsageRow,
} from "@/server/catalog-source/col-repository";

/**
 * The picker's read (ADR-0026 D7). Public data only: catalog identities, in
 * the requested locale and object kind, from Postgres alone. It reads no
 * cookie and no session, so the answer may sit in a shared cache for a minute
 * — the one exception to `AGENTS.md` hard rule 5, made for this route. GET
 * only; a failure or a missed deadline answers 503 with no cache, and the
 * composer falls back to the own-name outcome.
 */
export const PUBLIC_CATALOG_TYPEAHEAD_CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

export async function GET(request: Request) {
  // The answer depends on the query string: never a prerendered response.
  await connection();
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

  // The secondary path (ADR-0026 D7): the whole Catalogue of Life release
  // rather than canonical nodes. A row here is not a node — it carries a
  // `colId`, and picking it is what creates one.
  if (url.searchParams.get("scope") === "full") {
    try {
      const rows = await searchColUsages(query, { objectKind: kind });
      return publicJson(
        {
          suggestions: rows.map(serializeColUsage),
          state: rows.length > 0 ? "ready" : "empty",
          scope: "full",
        },
        200,
        {
          "Cache-Control": PUBLIC_CATALOG_TYPEAHEAD_CACHE_CONTROL,
          ...timingHeaders(startedAt, 0),
        },
      );
    } catch {
      return publicJson({ suggestions: [], state: "unavailable", scope: "full" }, 503, {
        "Cache-Control": "no-store",
        "Retry-After": "5",
        ...timingHeaders(startedAt, 0),
      });
    }
  }

  try {
    const result = await searchCatalogSuggestionsForTypeaheadResult(query, {
      objectKind: kind,
      locale,
    });
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

/** A checklist row as the picker reads it: an identifier, names, a rank. */
function serializeColUsage(row: ColUsageRow) {
  return {
    colId: row.colId,
    displayName: row.canonicalName,
    scientificName: row.scientificName,
    ...(row.rank ? { rank: row.rank } : {}),
    ...(row.acceptedName ? { acceptedName: row.acceptedName } : {}),
  };
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
