import { describe, expect, it } from "vitest";

import { PUBLIC_LOCALES } from "./public-localization";
import {
  isUnknownLocalizedPath,
  isUnknownRootPath,
} from "./root-route-segments";
import {
  getSiteShellNavigation,
  resolveSiteShellSection,
  isSiteShellComposerRoute,
  isSiteShellItemActive,
} from "./site-shell-navigation";

describe("site shell navigation contract", () => {
  it("builds a guest-open Ukrainian public route set without My data", () => {
    const navigation = getSiteShellNavigation("uk", false);

    expect(
      navigation.publicItems.map(({ key, label, href }) => ({
        key,
        label,
        href,
      })),
    ).toEqual([
      { key: "feed", label: "Стрічка", href: "/" },
      { key: "catalogue", label: "Огляд", href: "/catalog" },
    ]);
    expect(navigation.personalItems.map((item) => item.key)).toEqual([
      "garden",
      "notifications",
    ]);
    expect(
      navigation.personalItems.every((item) =>
        item.href.startsWith("/auth/sign-in"),
      ),
    ).toBe(true);
    expect(navigation.searchHref).toBe("/journals");
    expect(JSON.stringify(navigation)).not.toMatch(
      /email|userId|sessionId|owner|draftCount/i,
    );
  });

  it("gives the catalogue one entrance for every address it answers on", () => {
    // `/objects`, `/species`, `/variety`, `/breed` and `/col` are five
    // spellings of one graph, and the rail named it a sixth way. ADR-0031 D8
    // merges the entrance; ADR-0029 keeps every address. The entrance is
    // `/catalog` since `OVE-451`, and the old index addresses 308 to it —
    // but the item still lights up on them, because a reader following one of
    // those redirects is in the catalogue.
    const navigation = getSiteShellNavigation("uk", false);
    const catalogue = navigation.publicItems.filter((item) =>
      ["/catalog", "/objects", "/species", "/variety", "/breed", "/col"].some(
        (path) => isSiteShellItemActive(path, item),
      ),
    );

    expect(catalogue).toHaveLength(1);
    expect(catalogue[0]?.key).toBe("catalogue");
    for (const path of [
      "/catalog",
      "/catalog?kingdom=fungi",
      "/objects",
      "/objects/moss",
      "/species",
      "/species/rosa-canina",
      "/variety/tomato",
      "/breed/karpatka",
      "/col/3W4WV",
      "/lineage/objects/object-1",
    ]) {
      expect(
        catalogue[0] && isSiteShellItemActive(path, catalogue[0]),
        `${path} should light the catalogue entrance`,
      ).toBe(true);
    }
  });

  it("carries exactly one primary action, and it is New entry", () => {
    const guest = getSiteShellNavigation("uk", false);
    const member = getSiteShellNavigation("uk", true);

    for (const navigation of [guest, member]) {
      expect(navigation.primaryAction.key).toBe("new-entry");
      expect(navigation.primaryAction.label).toBe("Новий запис");
      // The action is not a rail item as well: one primary per screen region
      // (DESIGN.md §4.4). It used to be two, one of them in the header.
      expect(
        [...navigation.publicItems, ...navigation.personalItems].some(
          (item) => item.key === "new-entry",
        ),
      ).toBe(false);
    }

    // Signed in it is the composer. Signed out it is the sign-in screen with
    // the composer as its return, so the reader lands on the thing they
    // pressed rather than on the workspace around it.
    expect(member.primaryActionHref).toBe("/garden/new");
    expect(guest.primaryActionHref).toContain("/auth/sign-in?next=");
    expect(guest.primaryActionHref).toContain("intent=create_entry");
    expect(decodeURIComponent(guest.primaryActionHref)).toContain(
      "/garden/new?authIntent=create_entry",
    );
    expect(guest.primaryAction.href).toBe(guest.primaryActionHref);
  });

  it("gives the tab bar five slots in one order, and Sign in is not one", () => {
    for (const isAuthenticated of [false, true]) {
      const navigation = getSiteShellNavigation("uk", isAuthenticated, true);
      expect(navigation.mobileItems.map((item) => item.key)).toEqual([
        "feed",
        "catalogue",
        "new-entry",
        "garden",
        "notifications",
      ]);
      expect(
        navigation.mobileItems.some((item) => item.key === "sign-in"),
      ).toBe(false);
    }
  });

  it("keeps protected mobile jobs visible and preserves the intended sign-in return", () => {
    const guest = getSiteShellNavigation("bg", false);
    const member = getSiteShellNavigation("bg", true);
    expect(guest.mobileItems[3].label).toBe("Градина");
    expect(guest.mobileItems[3].href).toBe("/auth/sign-in");
    expect(member.mobileItems[3].href).toBe("/garden");
    expect(member.mobileItems[4].href).toBe("/bg/notifications");
  });

  it("knows the one screen the editor owns on its own", () => {
    expect(isSiteShellComposerRoute("/garden/entries/abc-1/edit")).toBe(true);
    expect(isSiteShellComposerRoute("/garden/entries/abc-1/edit/")).toBe(true);
    // The one entry composer is a focused writing surface too (OVE-486).
    expect(isSiteShellComposerRoute("/garden/new")).toBe(true);
    // The workspace is not the composer: it is a page with navigation of its
    // own that happens to carry the first-entry composer as one section.
    expect(isSiteShellComposerRoute("/garden")).toBe(false);
    expect(isSiteShellComposerRoute("/garden#inventory")).toBe(false);
    expect(isSiteShellComposerRoute("/garden/entries/abc-1")).toBe(false);
  });

  it("names the footer's five links and localizes each one that has a twin", () => {
    expect(
      getSiteShellNavigation("bg", false).footerLinks.map(
        ({ key, href }) => [key, href] as const,
      ),
    ).toEqual([
      ["catalogue", "/bg/catalog"],
      ["terms", "/bg/terms"],
      ["privacy", "/bg/privacy"],
      ["cookies", "/bg/cookies"],
      // `/support` has no prefixed twin: it renders in the reader's language
      // at its one address, and `/bg/support` is a 404.
      ["support", "/support"],
    ]);
  });

  it("draws only addresses the proxy serves, in every language", () => {
    // This file pinned `/bg/support` for four days while the proxy answered it
    // 404 by design (`LOCALE_ROUTE_SEGMENTS`). A string in a test cannot see
    // that; asking the proxy's own classification can.
    for (const locale of PUBLIC_LOCALES) {
      for (const signedIn of [false, true]) {
        const navigation = getSiteShellNavigation(locale, signedIn, true);
        const hrefs = [
          ...navigation.publicItems,
          ...navigation.personalItems,
          ...navigation.utilityItems,
          ...navigation.exploreItems,
          ...navigation.mobileItems,
          navigation.primaryAction,
          navigation.signIn,
          ...navigation.footerLinks,
        ].map(({ href }) => href);
        hrefs.push(navigation.primaryActionHref, navigation.searchHref);

        for (const href of hrefs) {
          const pathname = href.split(/[?#]/, 1)[0] ?? href;
          expect(
            isUnknownLocalizedPath(pathname) || isUnknownRootPath(pathname),
            `${locale} ${signedIn ? "gardener" : "guest"}: ${href}`,
          ).toBe(false);
        }
      }
    }
  });

  it("gives every landmark the shell renders an accessible name", () => {
    const { labels } = getSiteShellNavigation("uk", true);

    for (const label of [
      labels.siteNavigation,
      labels.personalSection,
      labels.mobileNavigation,
      labels.footerNavigation,
      labels.contextRail,
      labels.accountRegion,
    ]) {
      expect(label.length).toBeGreaterThan(0);
    }
    // Two landmarks that read the same is the defect this replaces.
    expect(
      new Set([
        labels.siteNavigation,
        labels.personalSection,
        labels.mobileNavigation,
        labels.footerNavigation,
      ]).size,
    ).toBe(4);
  });

  it("adds communities to public navigation only after the server readiness gate passes", () => {
    const hidden = getSiteShellNavigation("uk", false, false);
    const ready = getSiteShellNavigation("uk", false, true);

    expect(hidden.exploreItems.some((item) => item.key === "communities")).toBe(
      false,
    );
    expect(
      ready.exploreItems.find((item) => item.key === "communities"),
    ).toMatchObject({
      label: "Спільноти",
      href: "/communities",
      matchPaths: ["/communities"],
    });
    expect(ready.mobileItems).toHaveLength(5);
  });

  it("adds localized My navigation without prefixing private routes", () => {
    const navigation = getSiteShellNavigation("bg", true);

    expect(navigation.publicItems.map((item) => item.href)).toEqual([
      "/bg",
      "/bg/catalog",
    ]);
    expect(navigation.searchHref).toBe("/bg/journals");
    expect(
      navigation.personalItems.map(({ key, label, href }) => ({
        key,
        label,
        href,
      })),
    ).toEqual([
      { key: "garden", label: "Моята градина", href: "/garden" },
      {
        key: "notifications",
        label: "Известия",
        href: "/bg/notifications",
      },
    ]);
    // The profile moved to the account block at the foot of the rail, which is
    // where every product with a rail puts it.
    expect(
      navigation.personalItems.some((item) => item.key === "profile"),
    ).toBe(false);
  });

  it("matches active routes after removing locale prefixes and hashes", () => {
    const navigation = getSiteShellNavigation("ru", true);
    const catalogue = navigation.publicItems.find(
      (item) => item.key === "catalogue",
    );
    const knowledge = navigation.exploreItems.find(
      (item) => item.key === "knowledge",
    );
    const garden = navigation.personalItems.find(
      (item) => item.key === "garden",
    );

    expect(
      catalogue && isSiteShellItemActive("/ru/variety/tomato", catalogue),
    ).toBe(true);
    expect(
      catalogue &&
        isSiteShellItemActive("/lineage/objects/object-1", catalogue),
    ).toBe(true);
    expect(
      knowledge &&
        isSiteShellItemActive(
          "/ru/guides/start-a-living-plant-record",
          knowledge,
        ),
    ).toBe(true);
    expect(garden && isSiteShellItemActive("/garden", garden)).toBe(true);
    expect(garden && isSiteShellItemActive("/garden#inventory", garden)).toBe(
      true,
    );
    expect(
      navigation.primaryAction &&
        isSiteShellItemActive("/garden#inventory", navigation.primaryAction),
    ).toBe(false);
  });

  it("assigns owned descendants to Garden and public reading to its own job", () => {
    for (const path of [
      "/garden/objects/id",
      "/garden/spaces/id",
      "/garden/entries/id/edit",
      "/garden/catalog/queue",
    ])
      expect(resolveSiteShellSection(path)).toBe("garden");
    for (const path of [
      "/@yehor",
      "/@yehor/post/11",
      "/bg/%40yehor/post/11",
      "/journals",
      "/feed",
    ])
      expect(resolveSiteShellSection(path)).toBe("feed");
    for (const path of [
      "/@yehor/objects/tomato",
      "/catalog",
      "/communities/tomato",
      "/bg/knowledge",
    ])
      expect(resolveSiteShellSection(path)).toBe("catalogue");
  });
});
