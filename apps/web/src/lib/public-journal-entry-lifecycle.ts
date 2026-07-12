import type { InterfaceLocale } from "@/lib/interface-localization";
import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import { localizedPath, stripLocalePrefix } from "@/lib/public-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";

const PUBLIC_JOURNAL_ENTRY_PATH = /^\/journal\/([^/]+)\/?$/i;

export function matchPublicJournalEntryPath(pathname: string) {
  const basePath = stripLocalePrefix(pathname).path;
  return PUBLIC_JOURNAL_ENTRY_PATH.exec(basePath)?.[1] ?? null;
}

export function renderGonePublicJournalEntryHtml(locale: InterfaceLocale) {
  const copy = getPublicSurfaceCopy(locale).journal;
  return renderLifecycleDocument(
    locale,
    copy.entryRemoved,
    copy.entryRemovedDescription,
  );
}

export function renderNotFoundPublicJournalEntryHtml(locale: InterfaceLocale) {
  const copy = getPublicSurfaceCopy(locale).journal;
  return renderLifecycleDocument(
    locale,
    copy.entryNotFound,
    copy.entryNotFoundDescription,
  );
}

function renderLifecycleDocument(
  locale: InterfaceLocale,
  title: string,
  description: string,
) {
  const journalsPath = localizedPath(locale, "/journals");
  const linkLabel = getPublicJournalEntryCopy(locale).journals;

  return `<!doctype html>
<html lang="${escapeAttribute(locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(title)} | OverGarden</title>
    <style>
      :root { --fg: rgb(23 23 23); --bg: rgb(255 255 255); --brand: rgb(47 125 50); --muted: rgb(102 102 102); --line: rgb(212 212 212); color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; }
      header { height: 56px; display: flex; align-items: center; padding: 0 20px; color: var(--bg); background: var(--fg); font-weight: 700; }
      header span { display: inline-flex; height: 56px; align-items: center; padding: 0 18px; background: var(--brand); }
      main { width: min(760px, 100%); margin: 0 auto; padding: 40px 20px; }
      h1 { margin: 0; font-size: 2rem; line-height: 1.15; }
      p { max-width: 42rem; margin: 16px 0 0; color: var(--muted); line-height: 1.65; }
      a { display: inline-flex; margin-top: 24px; border: 1px solid var(--line); border-radius: 6px; padding: 10px 14px; color: inherit; font-weight: 650; text-decoration: none; }
      a:hover { border-color: var(--brand); color: var(--brand); }
    </style>
  </head>
  <body>
    <header><span>OverGarden</span></header>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <a href="${escapeAttribute(journalsPath)}">${escapeHtml(linkLabel)}</a>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
