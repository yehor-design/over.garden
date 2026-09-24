import { rawGlyphSvg } from "@/components/icons/raw-glyphs";
import {
  OVER_GARDEN_LOGO_PATHS,
  OVER_GARDEN_LOGO_VIEWBOX,
} from "@/components/site-shell/over-garden-logo-paths";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  buildInterfaceLocaleChoiceTarget,
  getInterfaceRoutePolicy,
  INTERFACE_LOCALE_PREFERENCE_ENDPOINT,
  type InterfaceRouteSearchInput,
} from "@/lib/interface-route-policy";
import {
  INTERFACE_LOCALE_CHOICES,
  PUBLIC_LOCALE_CONFIG,
  type PublicLocale,
} from "@/lib/public-localization";

export interface PublicLifecycleRequestLocation {
  pathname: string;
  search?: InterfaceRouteSearchInput;
}

/**
 * The gardener a missing entry or passport was under, when their public
 * profile still answers. The proxy reads it only on the way to a 404 or 410,
 * so that the one next action keeps the reader with that gardener rather than
 * sending them to a directory (`OVE-478`).
 */
export interface PublicLifecycleAuthor {
  handle: string;
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
 *
 * It is drawn the way the shell is (DESIGN.md §3.2, `OVE-478`): the logo on a
 * light header, the page's one heading, one sentence and **one** next action
 * as the shell's primary button, and the language control in the footer —
 * the one place the shell keeps it (§6). It used to be the pre-redesign
 * chrome, a black bar with a green brand block, and in Ukrainian its language
 * menu had no styles at all: the native disclosure triangle and the three
 * options spilled open under it.
 *
 * The colours are the semantic tokens' values (`globals.css`, light theme),
 * written out because this document has no stylesheet to read them from.
 */
export function renderPublicLifecycleDocument(
  input: PublicLifecycleDocumentInput,
) {
  const languageControl = renderRawInterfaceLanguageControl(input);

  return `<!doctype html>
<html lang="${escapeAttribute(input.locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="referrer" content="no-referrer" />
    <title>${escapeHtml(input.title)} | OverGarden</title>
    <style>
      ${LIFECYCLE_DOCUMENT_STYLES}
      ${renderRawInterfaceLanguageControlStyles()}
    </style>
  </head>
  <body>
    <header>${renderRawLogo()}</header>
    <main>
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.description)}</p>
      <a href="${escapeAttribute(input.actionHref)}" rel="noreferrer" referrerpolicy="no-referrer">${escapeHtml(input.actionLabel)}</a>
    </main>
    <footer>${languageControl}</footer>
  </body>
</html>`;
}

/**
 * The light theme's semantic colours this document uses, each as the value
 * `globals.css` resolves the token to. The document has no stylesheet to read
 * them from, so they are written out once, here, with the token named beside
 * each; `public-lifecycle-document.test.ts` resolves every token through
 * `globals.css` and fails if one drifts.
 */
export const LIFECYCLE_DOCUMENT_PALETTE = {
  surface: { token: "--color-surface", value: "oklch(1 0 0)" },
  "surface-hover": {
    token: "--color-surface-hover",
    value: "oklch(0.955 0.004 150)",
  },
  line: { token: "--color-border", value: "oklch(0.917 0.005 150)" },
  "line-control": {
    token: "--color-border-control",
    value: "oklch(0.585 0.008 150)",
  },
  muted: { token: "--color-text-muted", value: "oklch(0.487 0.008 150)" },
  "action-hover": {
    token: "--color-action-hover",
    value: "oklch(0.395 0.008 150)",
  },
  heading: { token: "--color-text-heading", value: "oklch(0.285 0.007 150)" },
  text: { token: "--color-text", value: "oklch(0.205 0.006 150)" },
  action: { token: "--color-action", value: "oklch(0.205 0.006 150)" },
  "on-fill": { token: "--color-text-on-fill", value: "oklch(1 0 0)" },
} as const;

const PALETTE_DECLARATIONS = Object.entries(LIFECYCLE_DOCUMENT_PALETTE)
  .map(([name, { value }]) => `--${name}: ${value};`)
  .join(" ");

/** Radius-sm 0.5rem and radius-md 0.75rem; `text-h1` 26/32, and 32/38 from `md`. */
const LIFECYCLE_DOCUMENT_STYLES = `:root { ${PALETTE_DECLARATIONS} --font-overgarden-sans: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color-scheme: light; font-family: var(--font-overgarden-sans); font-optical-sizing: auto; font-synthesis: none; color: var(--text); background: var(--surface); }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; }
      button, input, select, textarea { font: inherit; }
      .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
      header { display: flex; min-height: 56px; align-items: center; border-bottom: 1px solid var(--line); padding: 0 16px; background: var(--surface); }
      [data-lifecycle-brand] { display: inline-flex; min-height: 44px; align-items: center; color: var(--action); }
      [data-lifecycle-brand] svg { display: block; width: auto; height: 28px; }
      main { flex: 1 0 auto; width: min(704px, 100%); margin: 0 auto; padding: 48px 20px; }
      h1 { margin: 0; color: var(--heading); font-size: 1.625rem; font-weight: 700; line-height: 2rem; overflow-wrap: anywhere; }
      @media (min-width: 48rem) { h1 { font-size: 2rem; line-height: 2.375rem; } }
      p { max-width: 42rem; margin: 12px 0 0; color: var(--muted); font-size: 1rem; line-height: 1.5rem; }
      main > a { display: inline-flex; min-height: 44px; max-width: 100%; align-items: center; margin-top: 24px; border-radius: 0.75rem; padding: 10px 16px; color: var(--on-fill); background: var(--action); font-size: 0.875rem; font-weight: 500; line-height: 1.25rem; text-decoration: none; overflow-wrap: anywhere; }
      main > a:hover { background: var(--action-hover); }
      main > a:focus-visible { outline: 2px solid var(--action); outline-offset: 2px; }
      footer { border-top: 1px solid var(--line); padding: 24px 20px; }`;

function renderRawLogo() {
  const paths = OVER_GARDEN_LOGO_PATHS.map((d) => `<path d="${d}"/>`).join("");
  return `<span data-lifecycle-brand><svg xmlns="http://www.w3.org/2000/svg" viewBox="${OVER_GARDEN_LOGO_VIEWBOX}" fill="currentColor" aria-hidden="true" focusable="false">${paths}</svg><span class="sr-only">OverGarden</span></span>`;
}

function renderRawInterfaceLanguageControl(
  input: Pick<PublicLifecycleDocumentInput, "locale" | "pathname" | "search">,
) {
  const copy = getInterfaceCopy(input.locale).shell;
  const routePolicy = getInterfaceRoutePolicy(input.pathname);
  const options = INTERFACE_LOCALE_CHOICES.map((locale) =>
    renderRawLanguageOption({
      currentLocale: input.locale,
      locale,
      pathname: input.pathname,
      search: input.search,
      localizedLink: routePolicy.mode === "localized-link",
    }),
  ).join("");
  const current = PUBLIC_LOCALE_CONFIG[input.locale];
  // No script. A tombstone is raw HTML with no React and no bundle, so the
  // language control here is exactly what it looks like: links on a localized
  // route, and a form post on an unprefixed one. The 110-line inline protocol
  // this replaces reimplemented the coordinator's flush, retry and pending
  // states for a page whose whole point is that nothing works on it any more.
  //
  // The trigger's name carries the language it shows (WCAG 2.5.3): a reader
  // who says what they see — "Українська" — reaches it by voice.
  return `<nav aria-label="${escapeAttribute(copy.languageControlLabel)}" data-interface-language-control-host="raw-lifecycle-interface-language-control">
      <details data-interface-language-control="true">
        <summary aria-label="${escapeAttribute(`${copy.languageControlTrigger}: ${current.label}`)}">${rawGlyphSvg("Translate", "data-lifecycle-glyph")}<span>${escapeHtml(current.label)}</span>${rawGlyphSvg("CaretDown", "data-lifecycle-glyph")}</summary>
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
  const content = `<span>${escapeHtml(config.label)}</span>${rawGlyphSvg("Check", "data-lifecycle-glyph")}`;

  if (input.localizedLink) {
    const target = buildInterfaceLocaleChoiceTarget({
      locale: input.locale,
      pathname: input.pathname,
      search: input.search,
    });
    if (!target) return "";
    return `<a ${commonAttributes} href="${escapeAttribute(target)}" hreflang="${config.htmlLang}" rel="noreferrer" referrerpolicy="no-referrer">${content}</a>`;
  }

  // Unprefixed route: the choice has nowhere to live but the cookie, so it is a
  // form post the browser can make without any JavaScript.
  //
  // No `returnTo`. A tombstone must not copy the identity of the thing that is
  // gone into its own markup, and the endpoint's fallback is the home page —
  // which is where a reader on a 410 is going anyway.
  return `<form method="post" action="${escapeAttribute(INTERFACE_LOCALE_PREFERENCE_ENDPOINT)}">
      <input type="hidden" name="locale" value="${escapeAttribute(input.locale)}" />
      <button ${commonAttributes} type="submit">${content}</button>
    </form>`;
}

/**
 * The footer's disclosure, drawn as the shell's `InterfaceLanguageControl`
 * is: a 44 px trigger with the Translate glyph and the current language, a
 * menu that opens upward from the footer, and a Check beside the chosen
 * option. Every glyph is Phosphor (`components/icons/raw-glyphs.ts`).
 */
function renderRawInterfaceLanguageControlStyles() {
  return `[data-interface-language-control-host] { display: flex; justify-content: flex-start; }
      [data-interface-language-control] { position: relative; }
      [data-interface-language-control] summary { display: inline-flex; min-height: 44px; cursor: pointer; list-style: none; align-items: center; gap: 6px; border: 1px solid var(--line-control); border-radius: 0.5rem; padding: 8px 12px; color: var(--text); background: var(--surface); font-size: 0.875rem; font-weight: 500; line-height: 1.25rem; }
      [data-interface-language-control] summary::-webkit-details-marker { display: none; }
      [data-interface-language-control] summary:hover { background: var(--surface-hover); }
      [data-interface-language-control][open] summary svg:last-child { transform: rotate(180deg); }
      [data-interface-language-menu] { position: absolute; z-index: 20; bottom: calc(100% + 6px); left: 0; display: grid; min-width: 176px; gap: 2px; border: 1px solid var(--line); border-radius: 0.75rem; padding: 4px; color: var(--text); background: var(--surface); box-shadow: 0 1px 2px oklch(0 0 0 / 0.04), 0 4px 12px oklch(0 0 0 / 0.08); }
      [data-interface-language-menu] form { display: contents; }
      [data-interface-language-option] { display: flex; min-height: 44px; width: 100%; cursor: pointer; align-items: center; justify-content: space-between; gap: 12px; border: 0; border-radius: 0.5rem; padding: 10px 12px; color: inherit; background: transparent; font: inherit; font-size: 0.875rem; line-height: 1.25rem; text-align: left; text-decoration: none; }
      [data-interface-language-option]:hover { background: var(--surface-hover); }
      [data-interface-language-option][aria-checked="true"] { font-weight: 600; }
      [data-interface-language-option][aria-checked="false"] [data-lifecycle-glyph] { visibility: hidden; }
      [data-interface-language-control] summary:focus-visible, [data-interface-language-option]:focus-visible { outline: 2px solid var(--action); outline-offset: 2px; }`;
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
