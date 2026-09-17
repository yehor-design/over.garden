import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "./interface-localization";
import { buildAuthIntentResumeHref } from "./auth/auth-intent-contract";
import {
  buildSignInHref,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
} from "./navigation/sign-in-href";
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
  | "wishlist"
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
  mobileItems: SiteShellNavigationItem[];
  /**
   * The one action of the shell (DESIGN.md §3.2, ADR-0031 D4). It lives in the
   * rail and nowhere else: the header rendered it a second time until this
   * rewrite, which is two primaries on one screen.
   */
  primaryAction: SiteShellNavigationItem;
  /**
   * Where the primary action goes for *this* reader: the composer when they
   * have an account, the sign-in screen with the composer as its return path
   * when they do not. A reader who signs in from here lands on the composer,
   * not on the workspace around it — the extra press `OVE-378` removed once.
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

export type SiteShellRouteContextKey =
  | "feed"
  | "catalogue"
  | "journal"
  | "community"
  | "knowledge"
  | "garden"
  | "profile"
  | "generic";

export interface SiteShellRouteContext {
  key: SiteShellRouteContextKey;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}

/** Where a reader who presses the primary action ends up once signed in. */
export const SITE_SHELL_COMPOSER_PATH = "/garden#first-entry-composer";

/**
 * The screen the editor owns on its own, where the tab bar would compete with
 * the composer's gutter, its `/` menu and its selection pill (ADR-0028). The
 * workspace at `/garden` is not one of these: the first-entry composer is one
 * section of a page that also carries navigation of its own.
 */
export function isSiteShellComposerRoute(pathname: string) {
  return /^\/garden\/entries\/[^/]+\/edit$/u.test(
    normalizeSiteShellPath(pathname),
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
const CATALOGUE_MATCH_PATHS = [
  "/objects",
  "/species",
  "/variety",
  "/breed",
  "/col",
  "/lineage/objects",
  "/garden/objects",
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
  const publicItems: SiteShellNavigationItem[] = [
    item("feed", copy.navigation.feed, localizedPath(locale, "/"), "public", {
      match: "exact",
      paths: ["/"],
    }),
    item(
      "catalogue",
      copy.navigation.catalogue,
      localizedPath(locale, "/objects"),
      "public",
      { match: "prefix", paths: CATALOGUE_MATCH_PATHS },
    ),
    item(
      "journals",
      copy.navigation.journals,
      localizedPath(locale, "/journals"),
      "public",
      {
        match: "prefix",
        paths: ["/journals", "/journal"],
      },
    ),
    ...(communitiesReady
      ? [
          item(
            "communities" as const,
            copy.navigation.communities,
            localizedPath(locale, "/communities"),
            "public" as const,
            {
              match: "prefix" as const,
              paths: ["/communities"],
            },
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

  const personalItems: SiteShellNavigationItem[] = isAuthenticated
    ? [
        item("garden", copy.navigation.myGarden, "/garden", "personal", {
          match: "exact",
          paths: ["/garden"],
        }),
        item(
          "followed-feed",
          copy.navigation.followedFeed,
          localizedPath(locale, "/feed"),
          "personal",
          { match: "exact", paths: ["/feed"] },
        ),
        item(
          "notifications",
          copy.navigation.notifications,
          localizedPath(locale, "/notifications"),
          "personal",
          { match: "prefix", paths: ["/notifications"] },
        ),
        item(
          "bookmarks",
          copy.navigation.bookmarks,
          localizedPath(locale, "/bookmarks"),
          "personal",
          { match: "prefix", paths: ["/bookmarks"] },
        ),
        item(
          "wishlist",
          copy.navigation.wishlist,
          localizedPath(locale, "/wishlist"),
          "personal",
          { match: "prefix", paths: ["/wishlist"] },
        ),
        item(
          "lineage-claims",
          copy.navigation.lineageClaims,
          "/garden/lineage/claims",
          "personal",
          { match: "prefix", paths: ["/garden/lineage/claims"] },
        ),
      ]
    : [];

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
          returnTo: "/garden",
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
  // The fifth slot is identity, not authentication. A tab bar that spends a
  // slot on "Sign in" has four slots for a product whose whole purpose is
  // gardeners publishing, and no place at all for publishing (ADR-0031 D4).
  const youItem = item(
    "you",
    copy.navigation.you,
    isAuthenticated ? "/garden/profile" : signInItem.href,
    "personal",
    isAuthenticated
      ? { match: "prefix", paths: ["/garden/profile"] }
      : // The destination is spelled in one module and read here, never
        // written again: a second spelling is how the header once pointed a
        // reader at `/garden` while reading its label from this file.
        { match: "prefix", paths: [SIGN_IN_PATH, SIGN_UP_PATH] },
  );
  // Five slots, in this order, at every width below `lg` and in both states.
  const mobileItems = [
    findItem("feed"),
    findItem("catalogue"),
    primaryAction,
    findItem("journals"),
    youItem,
  ].flatMap((entry) => (entry ? [entry] : []));

  return {
    publicItems,
    personalItems,
    mobileItems,
    primaryAction,
    primaryActionHref,
    signIn: signInItem,
    searchHref: localizedPath(locale, "/journals"),
    footerLinks: [
      {
        key: "catalogue",
        label: copy.navigation.catalogue,
        href: localizedPath(locale, "/objects"),
      },
      {
        key: "privacy",
        label: copy.shell.privacy,
        href: localizedPath(locale, "/privacy"),
      },
      {
        key: "support",
        label: copy.shell.support,
        href: localizedPath(locale, "/support"),
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
  return item.matchPaths.some((matchPath) =>
    item.match === "exact"
      ? normalizedPath === matchPath
      : normalizedPath === matchPath ||
        normalizedPath.startsWith(`${matchPath}/`),
  );
}

export function getSiteShellRouteContext(
  pathname: string,
  locale: InterfaceLocale,
): SiteShellRouteContext {
  const normalizedPath = normalizeSiteShellPath(pathname);
  const copy = getInterfaceCopy(locale);
  const publicHref = (path: string) => localizedPath(locale, path);
  const base = {
    description: copy.shell.contextDescription,
    secondaryHref: publicHref("/privacy"),
    secondaryLabel: copy.shell.privacy,
  };

  if (normalizedPath === "/garden") {
    return {
      ...base,
      key: "garden",
      title: copy.navigation.myGarden,
      primaryHref: SITE_SHELL_COMPOSER_PATH,
      primaryLabel: copy.shell.primaryAction,
    };
  }

  if (
    CATALOGUE_MATCH_PATHS.some(
      (matchPath) =>
        normalizedPath === matchPath ||
        normalizedPath.startsWith(`${matchPath}/`),
    )
  ) {
    return {
      ...base,
      key: "catalogue",
      title: copy.navigation.catalogue,
      primaryHref: publicHref("/journals"),
      primaryLabel: copy.navigation.journals,
    };
  }

  if (
    normalizedPath === "/communities" ||
    normalizedPath.startsWith("/communities/")
  ) {
    return {
      ...base,
      key: "community",
      title: copy.navigation.communities,
      primaryHref: publicHref("/journals"),
      primaryLabel: copy.navigation.journals,
    };
  }

  if (
    normalizedPath.startsWith("/journal/") ||
    normalizedPath.startsWith("/journals")
  ) {
    return {
      ...base,
      key: "journal",
      title: copy.navigation.journals,
      primaryHref: publicHref("/objects"),
      primaryLabel: copy.navigation.catalogue,
    };
  }

  if (
    normalizedPath.startsWith("/knowledge") ||
    normalizedPath.startsWith("/guides/") ||
    normalizedPath.startsWith("/answers/") ||
    normalizedPath.startsWith("/topics/") ||
    normalizedPath.startsWith("/blog") ||
    normalizedPath.startsWith("/markets/")
  ) {
    return {
      ...base,
      key: "knowledge",
      title: copy.navigation.knowledge,
      primaryHref: publicHref("/journals"),
      primaryLabel: copy.navigation.journals,
    };
  }

  if (normalizedPath.startsWith("/@")) {
    return {
      ...base,
      key: "profile",
      title: copy.navigation.profile,
      primaryHref: publicHref("/objects"),
      primaryLabel: copy.navigation.catalogue,
    };
  }

  if (normalizedPath === "/") {
    return {
      ...base,
      key: "feed",
      title: copy.navigation.feed,
      primaryHref: publicHref("/journals"),
      primaryLabel: copy.navigation.journals,
    };
  }

  return {
    ...base,
    key: "generic",
    title: copy.shell.contextTitle,
    primaryHref: "/garden",
    primaryLabel: copy.shell.startJournal,
  };
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
