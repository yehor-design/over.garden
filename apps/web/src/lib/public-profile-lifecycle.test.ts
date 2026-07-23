import { describe, expect, it } from "vitest";

import {
  matchPublicProfilePath,
  renderGonePublicProfileHtml,
  renderNotFoundPublicProfileHtml,
} from "./public-profile-lifecycle";

describe("public profile HTTP lifecycle", () => {
  it("matches exact root and localized handle documents", () => {
    expect(matchPublicProfilePath("/@demo_olena")).toBe("demo_olena");
    expect(matchPublicProfilePath("/%40demo_olena")).toBe("demo_olena");
    expect(matchPublicProfilePath("/bg/@demo_mariya/")).toBe("demo_mariya");
    expect(matchPublicProfilePath("/bg/%40demo_mariya/")).toBe("demo_mariya");
    expect(matchPublicProfilePath("/ru/@demo_danylo")).toBe("demo_danylo");
    expect(matchPublicProfilePath("/@demo_olena/journals")).toBeNull();
    expect(matchPublicProfilePath("/garden/profile")).toBeNull();
    expect(matchPublicProfilePath("/@person@example.com")).toBeNull();
  });

  it("renders one generic localized 404 for missing, private, and removed profiles", () => {
    const html = renderNotFoundPublicProfileHtml("bg");

    expect(html).toContain("Профилът не е намерен");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain('href="/bg"');
    expect(html).toContain('font-family: "Google Sans"');
    expect(html.match(/rel="preload"/gu)).toHaveLength(1);
    expect(html.replace("noindex, nofollow", "")).not.toMatch(
      /private|removed|blocked|owner|email|userId|location|region|follow|report/i,
    );
  });

  it.each([
    ["uk", "Профіль більше недоступний", 'href="/"'],
    ["bg", "Профилът вече не е достъпен", 'href="/bg"'],
    ["ru", "Профиль больше недоступен", 'href="/ru"'],
  ] as const)(
    "renders a generic localized 410 for a retired %s handle",
    (locale, title, homeLink) => {
      const html = renderGonePublicProfileHtml(locale);

      expect(html).toContain(title);
      expect(html).toContain('name="robots" content="noindex, nofollow"');
      expect(html).toContain(homeLink);
      expect(html).not.toContain("former_garden");
      expect(html).not.toContain("current_garden");
      expect(html).not.toContain('http-equiv="refresh"');
      expect(html).not.toMatch(/email|userId|owner|redirect|location/i);
    },
  );
});
