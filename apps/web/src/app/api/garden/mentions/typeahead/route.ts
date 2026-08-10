import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";
import { searchJournalMentionSuggestions } from "@/server/journal-mention-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    return documentMutationAdmissionResponse(admission);
  }
  const scope = admission.scope;
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const suggestions = await searchJournalMentionSuggestions(scope, query);

  return Response.json(
    {
      suggestions: suggestions.map((suggestion) => ({
        kind: suggestion.kind,
        id: suggestion.id,
        label: suggestion.label,
        insertText: suggestion.insertText,
        detail: suggestion.detail,
        disambiguationLabel: suggestion.disambiguationLabel,
        catalogKind: suggestion.catalogKind ?? null,
      })),
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
