import { redirectLegacyJournalEntry } from "@/app/legacy-journal-entry-route";
import { decodeRouteSegment } from "@/lib/address/route-segments";

/**
 * `/{locale}/journal/{slug}` — an entry's first address, with a locale prefix
 * it never needed. The proxy answers a document request with one 308; this
 * catches the client-side transition (see `legacy-journal-entry-route.tsx`).
 */
interface LegacyLocalizedJournalEntryRouteProps {
  params: Promise<{ locale: string; slug: string }>;
}

export default async function LegacyLocalizedJournalEntryRoute({
  params,
}: LegacyLocalizedJournalEntryRouteProps) {
  const { slug } = await params;
  return redirectLegacyJournalEntry({
    slug: decodeRouteSegment(slug),
    authorHandle: null,
  });
}
