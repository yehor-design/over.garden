import { connection } from "next/server";

import { isPublicLocale, type PublicLocale } from "@/lib/public-localization";
import {
  normalizePaletteQuery,
  PALETTE_MIN_QUERY_LENGTH,
  searchPublicPalette,
} from "@/server/public-palette-search";

/**
 * The command palette's read (DESIGN.md §5.2). `GET` only, public data only,
 * no cookie and no session — and `no-store` all the same: the one caching
 * exception in `AGENTS.md` rule 5 is the catalogue typeahead under
 * `/api/public/catalog/`, and this is a different route with a different job.
 *
 * A failure inside a group is already swallowed by the reader, so the palette
 * shows the groups that answered rather than nothing at all. A failure here is
 * a 503 and the palette says so; `/journals` and the catalogue are still there,
 * which is the point of the palette being an enhancement.
 */
export async function GET(request: Request) {
  // The answer depends on the query string: never a prerendered response.
  await connection();
  const startedAt = performance.now();

  const url = new URL(request.url);
  const query = normalizePaletteQuery(url.searchParams.get("q"));
  const localeParam = url.searchParams.get("locale") ?? "uk";
  const locale: PublicLocale = isPublicLocale(localeParam) ? localeParam : "uk";

  if (query.length < PALETTE_MIN_QUERY_LENGTH) {
    return paletteJson({ query, groups: [], state: "empty" }, 200, startedAt);
  }

  try {
    const result = await searchPublicPalette(query, { locale });
    return paletteJson(
      {
        ...result,
        state: result.groups.length > 0 ? "ready" : "empty",
      },
      200,
      startedAt,
    );
  } catch {
    return paletteJson(
      { query, groups: [], state: "unavailable" },
      503,
      startedAt,
      { "Retry-After": "5" },
    );
  }
}

function paletteJson(
  body: unknown,
  status: number,
  startedAt: number,
  extra: Record<string, string> = {},
) {
  const total = Math.max(0, performance.now() - startedAt).toFixed(2);
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Server-Timing": `total;dur=${total}`,
      ...extra,
    },
  });
}
