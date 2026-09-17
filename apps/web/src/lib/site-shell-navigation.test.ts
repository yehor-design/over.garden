import { describe, expect, it } from "vitest";

import {
  getSiteShellNavigation,
  getSiteShellRouteContext,
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
      { key: "catalogue", label: "Каталог", href: "/objects" },
      { key: "journals", label: "Журнали", href: "/journals" },
      { key: "knowledge", label: "Знання", href: "/knowledge" },
    ]);
    expect(navigation.personalItems).toEqual([]);
    expect(navigation.searchHref).toBe("/journals");
    expect(JSON.stringify(navigation)).not.toMatch(
      /email|userId|sessionId|owner|draftCount/i,
    );
  });

  it("gives the catalogue one entrance for the five addresses it answers on", () => {
    // `/objects`, `/species`, `/variety`, `/breed` and `/col` are five
    // spellings of one graph, and the rail named it a sixth way. ADR-0031 D8
    // merges the entrance; ADR-0029 keeps every address.
    const navigation = getSiteShellNavigation("uk", false);
    const catalogue = navigation.publicItems.filter((item) =>
      ["/objects", "/species", "/variety", "/breed", "/col"].some((path) =>
        isSiteShellItemActive(path, item),
      ),
    );

    expect(catalogue).toHaveLength(1);
    expect(catalogue[0]?.key).toBe("catalogue");
    for (const path of [
      "/objects",
      "/objects/moss",
      "/species",
      "/species/rosa-canina",
      "/variety/tomato",
      "/breed/karpatka",
      "/col/3W4WV",
      "/lineage/objects/object-1",
      "/garden/objects/object-1",
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
    expect(member.primaryActionHref).toBe("/garden#first-entry-composer");
    expect(guest.primaryActionHref).toContain("/auth/sign-in?next=");
    expect(guest.primaryActionHref).toContain("intent=create_entry");
    expect(decodeURIComponent(guest.primaryActionHref)).toContain(
      "first-entry-composer",
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
        "journals",
        "you",
      ]);
      expect(
        navigation.mobileItems.some((item) => item.key === "sign-in"),
      ).toBe(false);
    }
  });

  it("makes the fifth slot identity, and sign-in only the way there", () => {
    const guest = getSiteShellNavigation("uk", false, false, "/journals");
    const member = getSiteShellNavigation("uk", true);
    const slot = (navigation: ReturnType<typeof getSiteShellNavigation>) =>
      navigation.mobileItems.find((item) => item.key === "you")!;

    expect(slot(guest).label).toBe("Ви");
    expect(slot(guest).href).toBe("/auth/sign-in?next=%2Fjournals");
    expect(slot(member).href).toBe("/garden/profile");
    expect(isSiteShellItemActive("/garden/profile", slot(member))).toBe(true);
    expect(isSiteShellItemActive("/auth/sign-in", slot(guest))).toBe(true);
  });

  it("knows the one screen the editor owns on its own", () => {
    expect(isSiteShellComposerRoute("/garden/entries/abc-1/edit")).toBe(true);
    expect(isSiteShellComposerRoute("/garden/entries/abc-1/edit/")).toBe(true);
    // The workspace is not the composer: it is a page with navigation of its
    // own that happens to carry the first-entry composer as one section.
    expect(isSiteShellComposerRoute("/garden")).toBe(false);
    expect(isSiteShellComposerRoute("/garden#first-entry-composer")).toBe(
      false,
    );
    expect(isSiteShellComposerRoute("/garden/entries/abc-1")).toBe(false);
  });

  it("names the footer's four links and localizes each one", () => {
    expect(
      getSiteShellNavigation("bg", false).footerLinks.map(
        ({ key, href }) => [key, href] as const,
      ),
    ).toEqual([
      ["catalogue", "/bg/objects"],
      ["privacy", "/bg/privacy"],
      ["support", "/bg/support"],
      ["first-publication-disclosure", "/bg/first-publication-disclosure"],
    ]);
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

    expect(hidden.publicItems.some((item) => item.key === "communities")).toBe(
      false,
    );
    expect(
      ready.publicItems.find((item) => item.key === "communities"),
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
      "/bg/objects",
      "/bg/journals",
      "/bg/knowledge",
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
        key: "followed-feed",
        label: "Следвани записи",
        href: "/bg/feed",
      },
      {
        key: "notifications",
        label: "Известия",
        href: "/bg/notifications",
      },
      { key: "bookmarks", label: "Отметки", href: "/bg/bookmarks" },
      { key: "wishlist", label: "Желани", href: "/bg/wishlist" },
      {
        key: "lineage-claims",
        label: "Заявки за произход",
        href: "/garden/lineage/claims",
      },
    ]);
    // The profile moved to the account block at the foot of the rail, which is
    // where every product with a rail puts it.
    expect(navigation.personalItems.some((item) => item.key === "profile")).toBe(
      false,
    );
  });

  it("matches active routes after removing locale prefixes and hashes", () => {
    const navigation = getSiteShellNavigation("ru", true);
    const catalogue = navigation.publicItems.find(
      (item) => item.key === "catalogue",
    );
    const knowledge = navigation.publicItems.find(
      (item) => item.key === "knowledge",
    );
    const garden = navigation.personalItems.find(
      (item) => item.key === "garden",
    );

    expect(
      catalogue && isSiteShellItemActive("/ru/variety/tomato", catalogue),
    ).toBe(true);
    expect(
      catalogue && isSiteShellItemActive("/lineage/objects/object-1", catalogue),
    ).toBe(true);
    expect(
      knowledge &&
        isSiteShellItemActive(
          "/ru/guides/start-a-living-plant-record",
          knowledge,
        ),
    ).toBe(true);
    expect(garden && isSiteShellItemActive("/garden", garden)).toBe(true);
    expect(
      garden && isSiteShellItemActive("/garden#first-entry-composer", garden),
    ).toBe(true);
    expect(
      navigation.primaryAction &&
        isSiteShellItemActive(
          "/garden#first-entry-composer",
          navigation.primaryAction,
        ),
    ).toBe(false);
  });

  it("maps representative routes to contextual rail variants", () => {
    expect(getSiteShellRouteContext("/", "uk").key).toBe("feed");
    expect(getSiteShellRouteContext("/journal/entry-1", "uk").key).toBe(
      "journal",
    );
    expect(getSiteShellRouteContext("/lineage/objects/object-1", "uk").key).toBe(
      "catalogue",
    );
    expect(getSiteShellRouteContext("/garden/objects/object-1", "uk").key).toBe(
      "catalogue",
    );
    expect(getSiteShellRouteContext("/species/rosa-canina", "uk").key).toBe(
      "catalogue",
    );
    expect(getSiteShellRouteContext("/garden", "bg")).toMatchObject({
      key: "garden",
      title: "Моята градина",
      primaryHref: "/garden#first-entry-composer",
    });
    expect(getSiteShellRouteContext("/%40green_thumb", "uk").key).toBe(
      "profile",
    );
    expect(getSiteShellRouteContext("/bg/%40green_thumb", "bg").key).toBe(
      "profile",
    );
  });
});
