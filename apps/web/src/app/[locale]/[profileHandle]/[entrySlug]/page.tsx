import { redirectLegacyJournalEntry } from "@/app/legacy-journal-entry-route";
import {
  decodeRouteSegment,
  routeHandleSegment,
} from "@/lib/address/route-segments";

/**
 * `/@{handle}/{slug}` — an entry's address between 2026-09-12 and 2026-09-18,
 * its name under its author in the gardener's own alphabet. The entry lives at
 * `/@{handle}/post/{n}` now (ADR-0029 D9); the proxy answers a document
 * request with one 308, and this catches the client-side transition (see
 * `legacy-journal-entry-route.tsx`).
 *
 * The handle goes to the lookup rather than being checked afterwards: the name
 * is per author since `0073`, so the pair is the key, and the same slug under
 * another gardener's handle names a different entry or none.
 */
interface LegacyAuthorScopedEntryRouteProps {
  params: Promise<{
    locale: string;
    profileHandle: string;
    entrySlug: string;
  }>;
}

export default async function LegacyAuthorScopedEntryRoute({
  params,
}: LegacyAuthorScopedEntryRouteProps) {
  const { profileHandle, entrySlug } = await params;
  return redirectLegacyJournalEntry({
    slug: decodeRouteSegment(entrySlug),
    authorHandle: routeHandleSegment(profileHandle),
  });
}
