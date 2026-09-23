import { PublicEngagementPanel } from "@/app/engagement/public-engagement-panel";
import { readViewerLikeState } from "@/app/engagement/engagement-viewer";
import { OwnerEntryControlLink } from "@/components/public/public-journal-entry";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import type { PublicLocale } from "@/lib/public-localization";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getEngagementSummary } from "@/server/engagement-repository";
import { getOwnerJournalEntryControl } from "@/server/owner-journal-entry-control";
import { readGuestEngagementSummary } from "@/server/public-cache";
import { scopedToUser } from "@/server/request-scope";

/**
 * The two parts of an entry that are request data (ADR-0032 D2): who is
 * reading, and what the query string says. The entry itself is a static
 * document; these render behind boundaries of their own, below and beside the
 * article, so nothing a reader came for waits on them.
 *
 * They live beside the page rather than in it because a `page.tsx` may export
 * only what Next knows the name of.
 */

export type EntrySearchParams =
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

/** The panel for this reader: their like, their comments' controls, their cursor. */
export async function ViewerEngagementPanel({
  locale,
  target,
  returnTo,
  share,
  searchParams,
}: {
  locale: PublicLocale;
  target: { kind: "journal_entry"; ref: string };
  returnTo: string;
  /** The canonical permalink and title a share sends (`OVE-493`). */
  share: { url: string; title: string };
  searchParams: EntrySearchParams;
}) {
  const [query, session] = await Promise.all([
    searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS),
    getCurrentSession(),
  ]);
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const [engagement, likeState] = await Promise.all([
    scope
      ? getEngagementSummary(target, scope, {
          commentCursor: firstParam(query.cursor),
        })
      : readGuestEngagementSummary(target, firstParam(query.cursor) ?? null),
    readViewerLikeState(target),
  ]);

  return (
    <PublicEngagementPanel
      isAuthenticated={Boolean(userId)}
      locale={locale}
      target={target}
      summary={engagement}
      likeState={likeState}
      returnTo={returnTo}
      share={share}
      resumeAction={normalizeAuthIntentResumeAction(
        firstParam(query.authIntent) ?? undefined,
      )}
      resumeControl={normalizeAuthIntentResumeControl(
        firstParam(query.authControl) ?? undefined,
      )}
    />
  );
}

/** The way into the editor, for the one reader who owns this entry. */
export async function OwnerEntryControl({
  locale,
  publicSlug,
  publicPath,
}: {
  locale: PublicLocale;
  publicSlug: string;
  publicPath: string;
}) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const ownerControl = await getOwnerJournalEntryControl(
    scopedToUser(userId, getSessionId(session)),
    publicSlug,
  );
  if (!ownerControl) return null;

  return (
    <OwnerEntryControlLink
      managePath={`/garden/entries/${encodeURIComponent(ownerControl.entryId)}/edit?returnTo=${encodeURIComponent(publicPath)}`}
      label={getPublicJournalEntryCopy(locale).manageEntry}
    />
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
