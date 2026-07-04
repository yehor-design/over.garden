import { requireCurrentRequestScope } from "@/server/auth-session";
import { searchJournalMentionSuggestions } from "@/server/journal-mention-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const scope = await requireCurrentRequestScope();
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const suggestions = await searchJournalMentionSuggestions(scope, query);

  return Response.json({ suggestions });
}
