import { describe, expect, it } from "vitest";

import {
  getSiteShellNavigation,
  getSiteShellRouteContext,
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
      {
        key: "living-objects",
        label: "Живі об'єкти",
        href: "/objects",
      },
      { key: "journals", label: "Журнали", href: "/journals" },
      { key: "knowledge", label: "Знання", href: "/knowledge" },
    ]);
    expect(navigation.personalItems).toEqual([]);
    expect(navigation.searchHref).toBe("/journals");
    expect(navigation.mobileItems.map((item) => item.key)).toEqual([
      "feed",
      "living-objects",
      "journals",
      "knowledge",
      "sign-in",
    ]);
    expect(JSON.stringify(navigation)).not.toMatch(
      /email|userId|sessionId|owner|draftCount/i,
    );
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
        key: "add-object",
        label: "Добавяне на обект",
        href: "/garden#first-entry-composer",
      },
      {
        key: "add-update",
        label: "Нов запис",
        href: "/garden#first-entry-composer",
      },
      { key: "drafts", label: "Чернови", href: "/garden#drafts" },
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
      { key: "profile", label: "Профил", href: "/garden/profile" },
    ]);
    expect(navigation.mobileItems.map((item) => item.key)).toEqual([
      "feed",
      "living-objects",
      "garden",
      "notifications",
      "profile",
    ]);
  });

  it("matches active routes after removing locale prefixes and hashes", () => {
    const navigation = getSiteShellNavigation("ru", true);
    const objects = navigation.publicItems.find(
      (item) => item.key === "living-objects",
    );
    const knowledge = navigation.publicItems.find(
      (item) => item.key === "knowledge",
    );
    const garden = navigation.personalItems.find(
      (item) => item.key === "garden",
    );
    const addObject = navigation.personalItems.find(
      (item) => item.key === "add-object",
    );

    expect(
      objects && isSiteShellItemActive("/ru/variety/tomato", objects),
    ).toBe(true);
    expect(
      objects && isSiteShellItemActive("/lineage/objects/object-1", objects),
    ).toBe(true);
    expect(
      objects && isSiteShellItemActive("/garden/objects/object-1", objects),
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
      addObject &&
        isSiteShellItemActive("/garden#first-entry-composer", addObject),
    ).toBe(false);
  });

  it("maps representative routes to contextual rail variants", () => {
    expect(getSiteShellRouteContext("/", "uk").key).toBe("feed");
    expect(getSiteShellRouteContext("/journal/entry-1", "uk").key).toBe(
      "journal",
    );
    expect(
      getSiteShellRouteContext("/lineage/objects/object-1", "uk").key,
    ).toBe("living-object");
    expect(getSiteShellRouteContext("/garden/objects/object-1", "uk").key).toBe(
      "living-object",
    );
    expect(getSiteShellRouteContext("/garden", "bg")).toMatchObject({
      key: "garden",
      title: "Моята градина",
      primaryHref: "/garden#first-entry-composer",
    });
  });
});
