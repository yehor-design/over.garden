import { requireCurrentRequestScope } from "@/server/auth-session";
import {
  searchCatalogSuggestions,
  searchCatalogSuggestionsWithMeili,
} from "@/server/catalog-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireCurrentRequestScope();

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const suggestions = await safeSearchCatalogSuggestions(query);

  return Response.json({ suggestions });
}

async function safeSearchCatalogSuggestions(query: string) {
  try {
    return await searchCatalogSuggestionsWithMeili(query);
  } catch {
    return searchCatalogSuggestions(query);
  }
}
