import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  renderPublicLifecycleDocument,
  type PublicLifecycleRequestLocation,
} from "@/lib/public-lifecycle-document";
import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import { localizedPath, stripLocalePrefix } from "@/lib/public-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";

const PUBLIC_JOURNAL_ENTRY_PATH = /^\/journal\/([^/]+)\/?$/i;

export function matchPublicJournalEntryPath(pathname: string) {
  const basePath = stripLocalePrefix(pathname).path;
  return PUBLIC_JOURNAL_ENTRY_PATH.exec(basePath)?.[1] ?? null;
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
    pathname: location?.pathname ?? localizedPath(locale, "/journal/missing"),
    search: location?.search,
    title,
    description,
    actionHref: journalsPath,
    actionLabel: linkLabel,
  });
}
