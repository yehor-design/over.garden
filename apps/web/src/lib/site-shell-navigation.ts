import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "./interface-localization";
import { localizedPath, stripLocalePrefix } from "./public-localization";

export type SiteShellNavigationKey =
  | "feed"
  | "living-objects"
  | "journals"
  | "communities"
  | "knowledge"
  | "garden"
  | "add-object"
  | "add-update"
  | "drafts"
  | "followed-feed"
  | "notifications"
  | "bookmarks"
  | "wishlist"
  | "lineage-claims"
  | "profile"
  | "sign-in";

export interface SiteShellNavigationItem {
  key: SiteShellNavigationKey;
  label: string;
  href: string;
  section: "public" | "personal" | "utility";
  match: "exact" | "prefix" | "never";
  matchPaths: readonly string[];
}

export interface SiteShellNavigation {
  publicItems: SiteShellNavigationItem[];
  personalItems: SiteShellNavigationItem[];
  mobileItems: SiteShellNavigationItem[];
  searchHref: string;
  labels: {
    publicSection: string;
    personalSection: string;
    menuTitle: string;
    menuDescription: string;
    search: string;
    openMenu: string;
    closeMenu: string;
    account: string;
    siteNavigation: string;
    mobileNavigation: string;
    contextTitle: string;
  };
}

export type SiteShellRouteContextKey =
  | "feed"
  | "living-object"
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

export function getSiteShellNavigation(
  locale: InterfaceLocale,
  isAuthenticated: boolean,
  communitiesReady = false,
): SiteShellNavigation {
  const copy = getInterfaceCopy(locale);
  const publicItems: SiteShellNavigationItem[] = [
    item("feed", copy.navigation.feed, localizedPath(locale, "/"), "public", {
      match: "exact",
      paths: ["/"],
    }),
    item(
      "living-objects",
      copy.navigation.livingObjects,
      localizedPath(locale, "/objects"),
      "public",
      {
        match: "prefix",
        paths: ["/objects", "/lineage/objects", "/garden/objects", "/variety"],
      },
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
          "add-object",
          copy.navigation.addObject,
          "/garden#first-entry-composer",
          "personal",
        ),
        item(
          "add-update",
          copy.navigation.addUpdate,
          "/garden#first-entry-composer",
          "personal",
        ),
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
        item(
          "profile",
          copy.navigation.profile,
          "/garden/profile",
          "personal",
          { match: "prefix", paths: ["/garden/profile"] },
        ),
      ]
    : [];

  const signInItem = item(
    "sign-in",
    copy.navigation.signIn,
    "/garden",
    "utility",
  );
  const findItem = (key: SiteShellNavigationKey) =>
    [...publicItems, ...personalItems].find((entry) => entry.key === key);
  const mobileKeys: SiteShellNavigationKey[] = isAuthenticated
    ? ["feed", "living-objects", "garden", "notifications", "profile"]
    : ["feed", "living-objects", "journals", "knowledge"];
  const mobileItems = mobileKeys.flatMap((key) => {
    const entry = findItem(key);
    return entry ? [entry] : [];
  });

  if (!isAuthenticated) mobileItems.push(signInItem);

  return {
    publicItems,
    personalItems,
    mobileItems,
    searchHref: localizedPath(locale, "/journals"),
    labels: {
      publicSection: copy.shell.exploreSection,
      personalSection: copy.shell.mySection,
      menuTitle: copy.shell.menuTitle,
      menuDescription: copy.shell.menuDescription,
      search: copy.shell.search,
      openMenu: copy.shell.openMenu,
      closeMenu: copy.shell.closeMenu,
      account: copy.shell.account,
      siteNavigation: copy.shell.siteNavigation,
      mobileNavigation: copy.shell.mobileNavigation,
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
      primaryHref: "/garden#first-entry-composer",
      primaryLabel: copy.navigation.addUpdate,
    };
  }

  if (
    normalizedPath.startsWith("/lineage/objects/") ||
    normalizedPath.startsWith("/garden/objects/") ||
    normalizedPath.startsWith("/variety/") ||
    normalizedPath.startsWith("/objects")
  ) {
    return {
      ...base,
      key: "living-object",
      title: copy.navigation.livingObjects,
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
      primaryLabel: copy.navigation.livingObjects,
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
      primaryLabel: copy.navigation.livingObjects,
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
