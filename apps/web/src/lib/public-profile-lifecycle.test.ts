import { describe, expect, it } from "vitest";

import {
  matchPublicProfilePath,
  renderNotFoundPublicProfileHtml,
} from "./public-profile-lifecycle";

describe("public profile HTTP lifecycle", () => {
  it("matches exact root and localized handle documents", () => {
    expect(matchPublicProfilePath("/@demo_olena")).toBe("demo_olena");
    expect(matchPublicProfilePath("/bg/@demo_mariya/")).toBe("demo_mariya");
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
    expect(html.replace("noindex, nofollow", "")).not.toMatch(
      /private|removed|blocked|owner|email|userId|location|region|follow|report/i,
    );
  });
});
