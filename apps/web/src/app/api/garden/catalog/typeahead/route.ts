import { parseCatalogTypeaheadResponse } from "@/lib/garden/catalog-typeahead-contract";
import { requireCurrentRequestScope } from "@/server/auth-session";
import { searchCatalogSuggestionsForTypeahead } from "@/server/catalog-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireCurrentRequestScope();

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const suggestions = await searchCatalogSuggestionsForTypeahead(query);

  return Response.json({
    suggestions: parseCatalogTypeaheadResponse({ suggestions }),
  });
}
