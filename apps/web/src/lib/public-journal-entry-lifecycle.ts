import { matchAddressPath } from "@/lib/address/match-address-path";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  renderPublicLifecycleDocument,
  type PublicLifecycleRequestLocation,
} from "@/lib/public-lifecycle-document";
import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import { localizedPath } from "@/lib/public-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import {
  MISSING_ADDRESS_SLUG,
  MISSING_ENTRY_NUMBER,
  publicJournalEntryPath,
} from "@/lib/garden/public-paths";

/**
 * The slug of a flat `/journal/{slug}` request, the entry's first address and
 * a 308 ever since. `/@{handle}/{slug}` and `/@{handle}/post/{n}` are matched
 * by `matchAuthorScopedPath`, which knows every shape under an author.
 */
export function matchPublicJournalEntryPath(pathname: string) {
  return matchAddressPath("journalEntry", pathname);
}

export function renderGonePublicJournalEntryHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
) {
  const copy = getPublicSurfaceCopy(locale).journal;
  return renderLifecycleDocument(
    locale,
    copy.entryRemoved,
    copy.entryRemovedDescription,
    location,
  );
}

export function renderNotFoundPublicJournalEntryHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
) {
  const copy = getPublicSurfaceCopy(locale).journal;
  return renderLifecycleDocument(
    locale,
    copy.entryNotFound,
    copy.entryNotFoundDescription,
    location,
  );
}

function renderLifecycleDocument(
  locale: InterfaceLocale,
  title: string,
  description: string,
  location?: PublicLifecycleRequestLocation,
) {
  const journalsPath = localizedPath(locale, "/journals");
  const linkLabel = getPublicJournalEntryCopy(locale).journals;

  return renderPublicLifecycleDocument({
    locale,
    pathname:
      location?.pathname ??
      publicJournalEntryPath(MISSING_ADDRESS_SLUG, MISSING_ENTRY_NUMBER),
    search: location?.search,
    title,
    description,
    actionHref: journalsPath,
    actionLabel: linkLabel,
  });
}
