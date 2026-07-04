import { getPublicJournalEntryLookup } from "@/server/journal-repository";
import { getEngagementSummary } from "@/server/engagement-repository";

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
  request: Request,
  { params }: PublicJournalEntryRouteContext,
) {
  const { slug } = await params;
  const lookup = await getPublicJournalEntryLookup(slug);

  if (lookup.status === "gone") {
    return htmlResponse(
      renderGoneJournalEntryHtml(lookup.entry.publicSlug),
      410,
    );
  }

  if (lookup.status === "not_found") {
    return htmlResponse(renderNotFoundJournalEntryHtml(), 404);
  }

  const engagementTarget = {
    kind: "journal_entry" as const,
    ref: lookup.page.entry.publicSlug,
  };
  const engagement = await getEngagementSummary(engagementTarget);
  const engagementStatus = new URL(request.url).searchParams.get("engagement");

  return htmlResponse(
    renderPublicJournalEntryHtml(lookup.page, engagement, engagementStatus),
    200,
  );
}

function htmlResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
