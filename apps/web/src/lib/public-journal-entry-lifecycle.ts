import { matchAddressPath } from "@/lib/address/match-address-path";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  renderPublicLifecycleDocument,
  type PublicLifecycleAuthor,
  type PublicLifecycleRequestLocation,
} from "@/lib/public-lifecycle-document";
import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import { localizedPath } from "@/lib/public-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import {
  MISSING_ADDRESS_SLUG,
  MISSING_ENTRY_NUMBER,
  publicJournalEntryPath,
  publicProfilePath,
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
  author?: PublicLifecycleAuthor | null,
) {
  const copy = getPublicSurfaceCopy(locale).journal;
  return renderLifecycleDocument(
    locale,
    copy.entryRemoved,
    copy.entryRemovedDescription,
    location,
    author,
  );
}

export function renderNotFoundPublicJournalEntryHtml(
  locale: InterfaceLocale,
  location?: PublicLifecycleRequestLocation,
  author?: PublicLifecycleAuthor | null,
) {
  const copy = getPublicSurfaceCopy(locale).journal;
  return renderLifecycleDocument(
    locale,
    copy.entryNotFound,
    copy.entryNotFoundDescription,
    location,
    author,
  );
}

/**
 * The one way on: the author's other entries when their profile still
 * answers — the reader came for this gardener — and the journals directory
 * when it does not, or when the address never named anyone (`OVE-478`).
 */
function renderLifecycleDocument(
  locale: InterfaceLocale,
  title: string,
  description: string,
  location?: PublicLifecycleRequestLocation,
  author?: PublicLifecycleAuthor | null,
) {
  const copy = getPublicJournalEntryCopy(locale);
  const action = author
    ? {
        actionHref: `${publicProfilePath(locale, author.handle)}#profile-entries`,
        actionLabel: copy.authorEntries.replace("{handle}", author.handle),
      }
    : {
        actionHref: localizedPath(locale, "/journals"),
        actionLabel: copy.journals,
      };

  return renderPublicLifecycleDocument({
    locale,
    pathname:
      location?.pathname ??
      publicJournalEntryPath(MISSING_ADDRESS_SLUG, MISSING_ENTRY_NUMBER),
    search: location?.search,
    title,
    description,
    ...action,
  });
}
