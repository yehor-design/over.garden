import { getPublicJournalEntryLookup } from "@/server/journal-repository";

import {
  renderGoneJournalEntryHtml,
  renderNotFoundJournalEntryHtml,
  renderPublicJournalEntryHtml,
} from "./render";

export const dynamic = "force-dynamic";

interface PublicJournalEntryRouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(
  _request: Request,
  { params }: PublicJournalEntryRouteContext,
) {
  const { slug } = await params;
  const lookup = await getPublicJournalEntryLookup(slug);

  if (lookup.status === "gone") {
    return htmlResponse(renderGoneJournalEntryHtml(lookup.entry.publicSlug), 410);
  }

  if (lookup.status === "not_found") {
    return htmlResponse(renderNotFoundJournalEntryHtml(), 404);
  }

  return htmlResponse(renderPublicJournalEntryHtml(lookup.page), 200);
}

function htmlResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
