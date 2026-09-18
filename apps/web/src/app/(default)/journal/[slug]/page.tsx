import { redirectLegacyJournalEntry } from "@/app/legacy-journal-entry-route";
import { decodeRouteSegment } from "@/lib/address/route-segments";

/**
 * `/journal/{slug}` — an entry's first address: a flat, global namespace that
 * forced twelve hexadecimal characters of the publish id into every URL. The
 * proxy answers a document request with one 308; this catches the client-side
 * transition (see `legacy-journal-entry-route.tsx`).
 */
interface LegacyJournalEntryRouteProps {
  params: Promise<{ slug: string }>;
}

export default async function LegacyJournalEntryRoute({
  params,
}: LegacyJournalEntryRouteProps) {
  const { slug } = await params;
  return redirectLegacyJournalEntry({
    slug: decodeRouteSegment(slug),
    authorHandle: null,
  });
}
