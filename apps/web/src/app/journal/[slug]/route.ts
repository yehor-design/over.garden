import { getPublicJournalEntryLookup } from "@/server/journal-repository";
import { getEngagementSummary } from "@/server/engagement-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { getSiteShellSessionState } from "@/server/site-shell-session";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { normalizePublicJournalDirectoryReturnTo } from "@/lib/public-journal-directory-navigation";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";

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
  const [locale, shellSession, lookup] = await Promise.all([
    getRequestInterfaceLocale(),
    getSiteShellSessionState(),
    getPublicJournalEntryLookup(slug),
  ]);

  if (lookup.status === "gone") {
    return htmlResponse(
      renderGoneJournalEntryHtml(
        lookup.entry.publicSlug,
        locale,
        shellSession.isAuthenticated,
      ),
      410,
    );
  }

  if (lookup.status === "not_found") {
    return htmlResponse(
      renderNotFoundJournalEntryHtml(locale, shellSession.isAuthenticated),
      404,
    );
  }

  const engagementTarget = {
    kind: "journal_entry" as const,
    ref: lookup.page.entry.publicSlug,
  };
  const engagement = await getEngagementSummary(engagementTarget);
  const requestUrl = new URL(request.url);
  const engagementStatus = requestUrl.searchParams.get("engagement");
  const resumeAction = normalizeAuthIntentResumeAction(
    requestUrl.searchParams.get("authIntent") ?? undefined,
  );
  const resumeControl = normalizeAuthIntentResumeControl(
    requestUrl.searchParams.get("authControl") ?? undefined,
  );
  const directoryReturnTo = normalizePublicJournalDirectoryReturnTo(
    requestUrl.searchParams.get("from"),
    locale,
    Boolean(tryResolveVisualFixtureEnvironment(process.env)),
  );

  return htmlResponse(
    renderPublicJournalEntryHtml(
      lookup.page,
      engagement,
      engagementStatus,
      locale,
      shellSession.isAuthenticated,
      resumeAction,
      resumeControl,
      directoryReturnTo,
    ),
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
