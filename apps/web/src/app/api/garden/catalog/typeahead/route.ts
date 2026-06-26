import { requireCurrentRequestScope } from "@/server/auth-session";
import { searchCatalogSuggestions } from "@/server/catalog-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireCurrentRequestScope();

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const suggestions = await searchCatalogSuggestions(query);

  return Response.json({ suggestions });
}
