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
  publicJournalEntryPath,
} from "@/lib/garden/public-paths";

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
      localizedPath(locale, publicJournalEntryPath(MISSING_ADDRESS_SLUG)),
    search: location?.search,
    title,
    description,
    actionHref: journalsPath,
    actionLabel: linkLabel,
  });
}
