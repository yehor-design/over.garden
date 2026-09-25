import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "./interface-localization";
import { buildAuthIntentResumeHref } from "./auth/auth-intent-contract";
import { buildSignInHref } from "./navigation/sign-in-href";
import { CATALOG_BROWSE_PATH } from "./public-catalog-browse";
import { localizedPath, stripLocalePrefix } from "./public-localization";

export type SiteShellNavigationKey =
  | "feed"
  | "catalogue"
  | "journals"
  | "communities"
  | "knowledge"
  | "garden"
  | "new-entry"
  | "followed-feed"
  | "notifications"
  | "bookmarks"
  | "lineage-claims"
  | "profile"
  | "you"
  | "sign-in";

export interface SiteShellNavigationItem {
  key: SiteShellNavigationKey;
  label: string;
  href: string;
  section: "public" | "personal" | "utility";
  match: "exact" | "prefix" | "never";
  matchPaths: readonly string[];
}

export interface SiteShellFooterLink {
  key: "privacy" | "support" | "first-publication-disclosure" | "catalogue";
  label: string;
  href: string;
}

export interface SiteShellNavigation {
  publicItems: SiteShellNavigationItem[];
  personalItems: SiteShellNavigationItem[];
  utilityItems: SiteShellNavigationItem[];
  exploreItems: SiteShellNavigationItem[];
  mobileItems: SiteShellNavigationItem[];
  /**
   * The one action of the shell (DESIGN.md §3.2, ADR-0031 D4). It lives in the
   * rail and nowhere else: the header rendered it a second time until this
   * rewrite, which is two primaries on one screen.
   */
  primaryAction: SiteShellNavigationItem;
  /**
   * The writing destination for this reader. During the shell migration it
   * selects an existing owned object through the inventory; the shared routed
   * composer replaces that bridge in its own delivery. Guests resume the same
   * destination through sign-in.
   */
  primaryActionHref: string;
  /** The sign-in screen, with the reader's current page as its return path. */
  signIn: SiteShellNavigationItem;
  searchHref: string;
  footerLinks: SiteShellFooterLink[];
  labels: {
    publicSection: string;
    personalSection: string;
    menuTitle: string;
    menuDescription: string;
    search: string;
    openMenu: string;
    closeMenu: string;
    account: string;
    openAccount: string;
    siteNavigation: string;
    mobileNavigation: string;
    footerNavigation: string;
    contextRail: string;
    accountRegion: string;
    contextTitle: string;
  };
}

/** Where a reader who presses the primary action ends up once signed in. */
/** The one composer every "New entry" opens (OVE-486). */
export const SITE_SHELL_COMPOSER_PATH = "/garden/new";

/**
 * The screen the editor owns on its own, where the tab bar would compete with
 * the composer's gutter, its `/` menu and its selection pill (ADR-0028). The
 * workspace at `/garden` is not one of these: the first-entry composer is one
 * section of a page that also carries navigation of its own.
 */
export function isSiteShellComposerRoute(pathname: string) {
  const path = normalizeSiteShellPath(pathname);
  // The edit screen and the one entry composer (OVE-486) are focused writing
  // surfaces: full height on a phone, no tab bar under the keyboard.
  return (
    /^\/garden\/entries\/[^/]+\/edit$/u.test(path) || path === "/garden/new"
  );
}

/**
 * The catalogue's addresses. `/objects`, `/species`, `/variety`, `/breed` and
 * `/col` are five spellings of one graph of 114,669 organisms, and the rail
 * offered a sixth name for it ("Living objects") as though it were something
 * else again. One entrance now; the addresses themselves are untouched, because
 * ADR-0029 says a redesign never moves a permalink. Merging the *pages* behind
 * them is `OVE-451`.
 */
/**
 * Every address the one catalogue entry lights up for (`OVE-451`).
 *
 * The menu has one catalogue item and it points at `/catalog`. The rest are
 * addresses under the same graph — an organism's own page in each of its three
 * route families, a living object's passport, `/objects` and the index at
 * `/species` while their 308s are still being followed — and a reader who is
 * on any of them is in the catalogue, so the item is marked current.
 */
const CATALOGUE_MATCH_PATHS = [
  "/catalog",
  "/objects",
  "/species",
  "/variety",
  "/breed",
  "/col",
  "/lineage/objects",
] as const;

export function getSiteShellNavigation(
  locale: InterfaceLocale,
  isAuthenticated: boolean,
  communitiesReady = false,
  /**
   * Where the reader is right now, so signing in returns them there instead of
   * to the workspace. Omitted, the link still works and falls back to `/garden`.
   */
  currentPath?: string,
): SiteShellNavigation {
  const copy = getInterfaceCopy(locale);
  const protectedHref = (path: string) =>
    isAuthenticated ? path : buildSignInHref({ returnTo: path });
  const publicItems: SiteShellNavigationItem[] = [
    item("feed", copy.navigation.feed, localizedPath(locale, "/"), "public", {
      match: "prefix",
      paths: ["/", "/feed", "/journals", "/journal"],
    }),
    item(
      "catalogue",
      copy.navigation.explore,
      localizedPath(locale, CATALOG_BROWSE_PATH),
      "public",
      {
        match: "prefix",
        paths: [
          ...CATALOGUE_MATCH_PATHS,
          "/communities",
          "/knowledge",
          "/guides",
          "/answers",
          "/topics",
          "/blog",
          "/markets",
        ],
      },
    ),
  ];
  const personalItems: SiteShellNavigationItem[] = [
    item(
      "garden",
      copy.navigation.myGarden,
      protectedHref("/garden"),
      "personal",
      {
        match: "prefix",
        paths: ["/garden"],
      },
    ),
    item(
      "notifications",
      copy.navigation.activity,
      protectedHref(localizedPath(locale, "/notifications")),
      "personal",
      {
        match: "prefix",
        paths: ["/notifications"],
      },
    ),
  ];
  const utilityItems: SiteShellNavigationItem[] = isAuthenticated
    ? [
        item(
          "bookmarks",
          copy.navigation.bookmarks,
          localizedPath(locale, "/bookmarks"),
          "utility",
        ),
        item(
          "lineage-claims",
          copy.navigation.lineageClaims,
          "/garden/lineage/claims",
          "utility",
        ),
      ]
    : [];
  const exploreItems: SiteShellNavigationItem[] = [
    item(
      "catalogue",
      copy.navigation.catalogue,
      localizedPath(locale, CATALOG_BROWSE_PATH),
      "public",
      { match: "prefix", paths: CATALOGUE_MATCH_PATHS },
    ),
    ...(communitiesReady
      ? [
          item(
            "communities",
            copy.navigation.communities,
            localizedPath(locale, "/communities"),
            "public",
            { match: "prefix", paths: ["/communities"] },
          ),
        ]
      : []),
    item(
      "knowledge",
      copy.navigation.knowledge,
      localizedPath(locale, "/knowledge"),
      "public",
      {
        match: "prefix",
        paths: [
          "/knowledge",
          "/guides",
          "/answers",
          "/topics",
          "/blog",
          "/markets",
        ],
      },
    ),
  ];

  // "Sign in" and "My garden" pointed at the same URL until OVE-378, and the
  // header then kept pointing at `/garden` for another day because it read this
  // item's *label* and hard-coded its own href. It is returned as a field now,
  // so a caller that wants the label gets the destination with it.
  const signInItem = item(
    "sign-in",
    copy.navigation.signIn,
    buildSignInHref({ returnTo: currentPath }),
    "utility",
  );
  const primaryActionHref = isAuthenticated
    ? SITE_SHELL_COMPOSER_PATH
    : buildSignInHref({
        returnTo: buildAuthIntentResumeHref({
          action: "create_entry",
          returnTo: SITE_SHELL_COMPOSER_PATH,
        }),
        intent: "create_entry",
      });
  const primaryAction = item(
    "new-entry",
    copy.shell.primaryAction,
    primaryActionHref,
    "personal",
  );
  const findItem = (key: SiteShellNavigationKey) =>
    [...publicItems, ...personalItems].find((entry) => entry.key === key);
  const garden = findItem("garden")!;
  const mobileItems = [
    findItem("feed")!,
    findItem("catalogue")!,
    primaryAction,
    { ...garden, label: copy.navigation.gardenShort },
    findItem("notifications")!,
  ];

  return {
    publicItems,
    personalItems,
    utilityItems,
    exploreItems,
    mobileItems,
    primaryAction,
    primaryActionHref,
    signIn: signInItem,
    searchHref: localizedPath(locale, "/journals"),
    footerLinks: [
      {
        key: "catalogue",
        label: copy.navigation.catalogue,
        href: localizedPath(locale, CATALOG_BROWSE_PATH),
      },
      {
        key: "privacy",
        label: copy.shell.privacy,
        href: localizedPath(locale, "/privacy"),
      },
      {
        key: "support",
        label: copy.shell.support,
        // Unprefixed in every language: the one address renders in the
        // reader's own language. `/bg/support` answered 404 when this link was
        // prefixed (found on production on 2026-09-21); the `[locale]` twin
        // added since (`OVE-476`) is `noindex` and not what this link names.
        href: "/support",
      },
      {
        key: "first-publication-disclosure",
        label: copy.shell.firstPublicationDisclosure,
        href: localizedPath(locale, "/first-publication-disclosure"),
      },
    ],
    labels: {
      publicSection: copy.shell.exploreSection,
      personalSection: copy.shell.mySection,
      menuTitle: copy.shell.menuTitle,
      menuDescription: copy.shell.menuDescription,
      search: copy.shell.search,
      openMenu: copy.shell.openMenu,
      closeMenu: copy.shell.closeMenu,
      account: copy.shell.account,
      openAccount: copy.shell.openAccount,
      siteNavigation: copy.shell.siteNavigation,
      mobileNavigation: copy.shell.mobileNavigation,
      footerNavigation: copy.shell.footerNavigation,
      contextRail: copy.shell.contextRail,
      accountRegion: copy.shell.accountRegion,
      contextTitle: copy.shell.contextTitle,
    },
  };
}

export function isSiteShellItemActive(
  pathname: string,
  item: SiteShellNavigationItem,
) {
  if (item.match === "never") return false;

  const normalizedPath = normalizeSiteShellPath(pathname);
  if (normalizedPath.startsWith("/@")) {
    return (
      item.key === (normalizedPath.includes("/objects/") ? "catalogue" : "feed")
    );
  }
  return item.matchPaths.some((matchPath) =>
    item.match === "exact"
      ? normalizedPath === matchPath
      : normalizedPath === matchPath ||
        normalizedPath.startsWith(`${matchPath}/`),
  );
}

function item(
  key: SiteShellNavigationKey,
  label: string,
  href: string,
  section: SiteShellNavigationItem["section"],
  matching: {
    match: SiteShellNavigationItem["match"];
    paths: readonly string[];
  } = { match: "never", paths: [] },
): SiteShellNavigationItem {
  return {
    key,
    label,
    href,
    section,
    match: matching.match,
    matchPaths: matching.paths,
  };
}

/**
 * The address a reader is on, as the shell reasons about it: no locale prefix,
 * no trailing slash, `@` spelled as itself.
 *
 * A static document is prerendered at its *route's* path — `/bg/journals`, or
 * `/uk/@handle/post/3` behind the author-scoped rewrite — and hydrated at the
 * *browser's* path, `/journals` or `/@handle/post/3` (ADR-0032 D3). Every
 * rewrite the proxy performs is "`/{locale}` + the canonical address", so this
 * is the one spelling on which the prerender and the browser agree, and
 * everything the shell writes into HTML from the pathname goes through it.
 */
export function canonicalSiteShellPath(pathname: string) {
  return normalizeSiteShellPath(pathname);
}

/** `<html data-shell-section="journals">`: see `siteShellDocumentBootScript`. */
export const SITE_SHELL_SECTION_ATTRIBUTE = "data-shell-section";

/**
 * Which navigation item an address lights up, as data: the same `match` and
 * `matchPaths` the rendered items carry, read off one navigation so the two
 * cannot drift. Language-independent — the paths are canonical.
 */
export function siteShellSectionMatchers() {
  const navigation = getSiteShellNavigation("uk", true, true);
  return [...navigation.publicItems, ...navigation.personalItems]
    .filter((entry) => entry.match !== "never")
    .map((entry) => ({
      key: entry.key,
      match: entry.match,
      paths: [...entry.matchPaths],
    }));
}

/** The key of the navigation item an address belongs to, if any. */
export function resolveSiteShellSection(
  pathname: string,
): SiteShellNavigationKey | null {
  const normalizedPath = normalizeSiteShellPath(pathname);
  if (normalizedPath.startsWith("/@"))
    return normalizedPath.includes("/objects/") ? "catalogue" : "feed";
  for (const entry of siteShellSectionMatchers()) {
    const matched = entry.paths.some((matchPath) =>
      entry.match === "exact"
        ? normalizedPath === matchPath
        : normalizedPath === matchPath ||
          normalizedPath.startsWith(`${matchPath}/`),
    );
    if (matched) return entry.key;
  }
  return null;
}

/** A secondary bar is decided before paint, never inserted after hydration. */
export function resolveSiteShellSecondary(
  pathname: string,
): "feed" | "catalogue" | null {
  const path = normalizeSiteShellPath(pathname);
  if (["/", "/feed", "/journals"].includes(path)) return "feed";
  return resolveSiteShellSection(path) === "catalogue" ? "catalogue" : null;
}

/**
 * Marks the current navigation item before the first paint (ADR-0032 D3).
 *
 * A static document does not read its address on the server, so the item's
 * `aria-current` arrives with hydration. What a reader *sees* must not: on a
 * phone on a slow connection that is seconds after the page is on screen. This
 * runs inline in the document's first bytes, says on `<html>` which section
 * the address belongs to, and `globals.css` draws the current item from that.
 */
export function siteShellDocumentBootScript(): string {
  const matchers = JSON.stringify(
    siteShellSectionMatchers().map((entry) => [
      entry.key,
      entry.match === "exact" ? 1 : 0,
      entry.paths,
    ]),
  );

  return (
    `(function(){try{var p=location.pathname.replace(/^\\/(?:uk|bg|ru)(?=\\/|$)/,"")||"/";` +
    `p=p.replace(/^\\/%40/i,"/@");if(p.length>1&&p.charAt(p.length-1)==="/")p=p.slice(0,-1);` +
    `function s(k){document.documentElement.setAttribute("${SITE_SHELL_SECTION_ATTRIBUTE}",k);var n=k==="catalogue"?k:(["/","/feed","/journals"].indexOf(p)!==-1?"feed":"");if(n)document.documentElement.setAttribute("data-shell-secondary",n);else document.documentElement.removeAttribute("data-shell-secondary")}` +
    `if(p.indexOf("/@")===0){s(p.indexOf("/objects/")!==-1?"catalogue":"feed");return}` +
    `var m=${matchers};for(var i=0;i<m.length;i++){for(var j=0;j<m[i][2].length;j++){var q=m[i][2][j];` +
    `if(p===q||(!m[i][1]&&p.indexOf(q+"/")===0)){s(m[i][0]);return}}}` +
    `}catch(e){}})()`
  );
}

function normalizeSiteShellPath(pathname: string) {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  const { path } = stripLocalePrefix(pathOnly);
  const browserDecodedProfilePath = path.replace(/^\/%40/i, "/@");

  if (
    browserDecodedProfilePath.length > 1 &&
    browserDecodedProfilePath.endsWith("/")
  ) {
    return browserDecodedProfilePath.slice(0, -1);
  }
  return browserDecodedProfilePath;
}
