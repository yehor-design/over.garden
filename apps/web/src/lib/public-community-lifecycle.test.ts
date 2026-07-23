import { describe, expect, it } from "vitest";

import {
  matchPublicCommunityPath,
  renderNotFoundPublicCommunityHtml,
} from "./public-community-lifecycle";

describe("public community lifecycle contract", () => {
  it("matches only localized and root community detail paths", () => {
    expect(matchPublicCommunityPath("/communities/observation-and-care")).toBe(
      "observation-and-care",
    );
    expect(
      matchPublicCommunityPath("/bg/communities/observation-and-care/"),
    ).toBe("observation-and-care");
    expect(matchPublicCommunityPath("/communities")).toBeNull();
    expect(matchPublicCommunityPath("/communities/not_valid")).toBeNull();
  });

  it("renders localized noindex copy without reflecting request input", () => {
    const html = renderNotFoundPublicCommunityHtml("bg");

    expect(html).toContain("Общността не е намерена");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
    expect(html).toContain('href="/bg/communities"');
    expect(html).toContain('font-family: "Google Sans"');
    expect(html.match(/rel="preload"/gu)).toHaveLength(1);
    expect(html).not.toMatch(/journal|email|latitude|longitude|session/i);
  });
});
