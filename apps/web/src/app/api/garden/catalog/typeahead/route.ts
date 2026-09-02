import { parseCatalogTypeaheadResponse } from "@/lib/garden/catalog-typeahead-contract";
import { requireCurrentRequestScope } from "@/server/auth-session";
import { searchCatalogSuggestionsForTypeaheadResult } from "@/server/catalog-repository";

export async function GET(request: Request) {
  await requireCurrentRequestScope();

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const kind = url.searchParams.get("kind");
  if (kind !== "plant" && kind !== "animal") {
    return Response.json(
      { suggestions: [], state: "empty" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const result = await searchCatalogSuggestionsForTypeaheadResult(query, {
    objectKind: kind,
  });

  return Response.json({
    suggestions: parseCatalogTypeaheadResponse({
      suggestions: result.suggestions,
    }),
    state: result.state,
  });
}
