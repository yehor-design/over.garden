import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  buildLocalizedInterfaceTarget,
  getInterfaceRoutePolicy,
  INTERFACE_LOCALE_PREFERENCE_ENDPOINT,
  type InterfaceRouteSearchInput,
} from "@/lib/interface-route-policy";
import {
  BULGARIA_PUBLIC_LOCALES,
  PUBLIC_LOCALE_CONFIG,
  type PublicLocale,
} from "@/lib/public-localization";

export interface PublicLifecycleRequestLocation {
  pathname: string;
  search?: InterfaceRouteSearchInput;
}

export interface PublicLifecycleDocumentInput extends PublicLifecycleRequestLocation {
  locale: InterfaceLocale;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}

/**
 * Render the application-owned raw 404/410 document used by Proxy lifecycle
 * lookups. These responses bypass React and therefore own their complete
 * market-aware language control here rather than delegating to SiteShell.
 */
export function renderPublicLifecycleDocument(
  input: PublicLifecycleDocumentInput,
) {
  const languageControl = renderRawInterfaceLanguageControl(input);
  const languageControlStyles =
    input.locale === "uk" ? "" : renderRawInterfaceLanguageControlStyles();

  return `<!doctype html>
<html lang="${escapeAttribute(input.locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="referrer" content="no-referrer" />
    <title>${escapeHtml(input.title)} | OverGarden</title>
    <style>
      :root { --fg: rgb(23 23 23); --bg: rgb(255 255 255); --brand: rgb(47 125 50); --muted: rgb(102 102 102); --line: rgb(212 212 212); --font-overgarden-sans: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color-scheme: light; font-family: var(--font-overgarden-sans); font-optical-sizing: auto; font-synthesis: none; color: var(--fg); background: var(--bg); }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; }
      button, input, select, textarea { font: inherit; }
      header { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px 0 20px; color: var(--bg); background: var(--fg); font-weight: 700; }
      header > span { display: inline-flex; min-height: 56px; align-items: center; padding: 0 18px; background: var(--brand); }
      main { width: min(760px, 100%); margin: 0 auto; padding: 40px 20px; }
      h1 { margin: 0; font-size: 2rem; line-height: 1.15; }
      p { max-width: 42rem; margin: 16px 0 0; color: var(--muted); line-height: 1.65; }
      main > a { display: inline-flex; margin-top: 24px; border: 1px solid var(--line); border-radius: 6px; padding: 10px 14px; color: inherit; font-weight: 650; text-decoration: none; }
      main > a:hover { border-color: var(--brand); color: var(--brand); }
      ${languageControlStyles}
    </style>
  </head>
  <body>
    <header><span>OverGarden</span>${languageControl}</header>
    <main>
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.description)}</p>
      <a href="${escapeAttribute(input.actionHref)}" rel="noreferrer" referrerpolicy="no-referrer">${escapeHtml(input.actionLabel)}</a>
    </main>
  </body>
</html>`;
}

function renderRawInterfaceLanguageControl(
  input: Pick<PublicLifecycleDocumentInput, "locale" | "pathname" | "search">,
) {
  if (input.locale === "uk") return "";

  const copy = getInterfaceCopy(input.locale).shell;
  const routePolicy = getInterfaceRoutePolicy(input.pathname);
  const options = BULGARIA_PUBLIC_LOCALES.map((locale) =>
    renderRawLanguageOption({
      currentLocale: input.locale,
      locale,
      pathname: input.pathname,
      search: input.search,
      localizedLink: routePolicy.mode === "localized-link",
    }),
  ).join("");
  // No script. A tombstone is raw HTML with no React and no bundle, so the
  // language control here is exactly what it looks like: links on a localized
  // route, and a form post on an unprefixed one. The 110-line inline protocol
  // this replaces reimplemented the coordinator's flush, retry and pending
  // states for a page whose whole point is that nothing works on it any more.
  return `<nav aria-label="${escapeAttribute(copy.languageControlLabel)}" data-interface-language-control-host="raw-lifecycle-interface-language-control">
      <details data-interface-language-control="true">
        <summary aria-label="${escapeAttribute(copy.languageControlTrigger)}">${escapeHtml(PUBLIC_LOCALE_CONFIG[input.locale].label)}</summary>
        <div role="menu" data-interface-language-menu>${options}</div>
      </details>
    </nav>`;
}

function renderRawLanguageOption(input: {
  currentLocale: InterfaceLocale;
  locale: PublicLocale;
  pathname: string;
  search?: InterfaceRouteSearchInput;
  localizedLink: boolean;
}) {
  const config = PUBLIC_LOCALE_CONFIG[input.locale];
  const selected = input.locale === input.currentLocale;
  const commonAttributes = `data-interface-language-option data-interface-locale="${input.locale}" lang="${escapeAttribute(config.htmlLang)}" role="menuitemradio" aria-checked="${selected ? "true" : "false"}"`;

  if (input.localizedLink) {
    const target = buildLocalizedInterfaceTarget({
      locale: input.locale,
      pathname: input.pathname,
      search: input.search,
    });
    if (!target) return "";
    return `<a ${commonAttributes} href="${escapeAttribute(target)}" hreflang="${config.htmlLang}" rel="noreferrer" referrerpolicy="no-referrer">${escapeHtml(config.label)}</a>`;
  }

  // Unprefixed route: the choice has nowhere to live but the cookie, so it is a
  // form post the browser can make without any JavaScript.
  //
  // No `returnTo`. A tombstone must not copy the identity of the thing that is
  // gone into its own markup, and the endpoint's fallback is the home page —
  // which is where a reader on a 410 is going anyway.
  return `<form method="post" action="${escapeAttribute(INTERFACE_LOCALE_PREFERENCE_ENDPOINT)}" style="display:inline">
      <input type="hidden" name="locale" value="${escapeAttribute(input.locale)}" />
      <button ${commonAttributes} type="submit">${escapeHtml(config.label)}</button>
    </form>`;
}

function renderRawInterfaceLanguageControlStyles() {
  return `[data-interface-language-control-host] { display: flex; max-width: min(24rem, calc(100vw - 10rem)); align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; padding-block: 8px; }
      [data-interface-language-control] { position: relative; font-weight: 500; }
      [data-interface-language-control] summary { display: inline-flex; min-height: 40px; max-width: min(138px, 40vw); cursor: pointer; list-style: none; align-items: center; gap: 6px; overflow: hidden; border: 1px solid rgb(255 255 255 / 35%); border-radius: 6px; padding: 7px 10px; white-space: nowrap; text-overflow: ellipsis; }
      [data-interface-language-control] summary::-webkit-details-marker { display: none; }
      [data-interface-language-control] summary::after { content: "▾"; font-size: 0.75rem; }
      [data-interface-language-control][open] summary::after { transform: rotate(180deg); }
      [data-interface-language-control] summary[aria-disabled="true"] { cursor: not-allowed; opacity: 0.72; }
      [data-interface-language-menu] { position: absolute; z-index: 20; top: calc(100% + 6px); right: 0; display: grid; min-width: 168px; gap: 2px; border: 1px solid var(--line); border-radius: 7px; padding: 4px; color: var(--fg); background: var(--bg); box-shadow: 0 12px 32px rgb(0 0 0 / 18%); }
      [data-interface-language-option] { display: flex; min-height: 42px; width: 100%; cursor: pointer; align-items: center; justify-content: space-between; border: 0; border-radius: 5px; padding: 9px 10px; color: inherit; background: transparent; font: inherit; text-align: left; text-decoration: none; }
      [data-interface-language-option]:hover { background: rgb(0 0 0 / 7%); }
      [data-interface-language-control] summary:focus-visible, [data-interface-language-option]:focus-visible, [data-interface-language-recovery]:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
      [data-interface-language-option]:focus-visible { background: rgb(0 0 0 / 7%); }
      [data-interface-language-option][aria-checked="true"]::after { content: "✓"; font-weight: 700; }
      [data-interface-language-recovery] { min-height: 40px; cursor: pointer; border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; color: var(--fg); background: var(--bg); font: inherit; }
      [data-interface-language-status] { flex: 1 0 100%; max-width: 24rem; color: inherit; font-size: 0.8125rem; font-weight: 500; line-height: 1.4; overflow-wrap: anywhere; text-align: right; }
      [data-interface-language-status]:empty { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }`;
}

export function escapeHtml(value: string) {
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
