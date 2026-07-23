import { describe, expect, it } from "vitest";

import {
  matchPublicObjectPassportPath,
  renderGonePublicObjectPassportHtml,
  renderNotFoundPublicObjectPassportHtml,
} from "./public-object-passport-lifecycle";

describe("public object passport HTTP lifecycle", () => {
  it("matches every exact passport document so malformed IDs receive a hard 404", () => {
    expect(
      matchPublicObjectPassportPath(
        "/lineage/objects/00000000-0000-4000-8000-000000000101",
      ),
    ).toBe("00000000-0000-4000-8000-000000000101");
    expect(
      matchPublicObjectPassportPath(
        "/bg/lineage/objects/00000000-0000-4000-8000-000000000101",
      ),
    ).toBe("00000000-0000-4000-8000-000000000101");
    expect(
      matchPublicObjectPassportPath(
        "/ru/lineage/objects/00000000-0000-4000-8000-000000000101/",
      ),
    ).toBe("00000000-0000-4000-8000-000000000101");
    expect(
      matchPublicObjectPassportPath("/lineage/objects/private-label"),
    ).toBe("private-label");
    expect(
      matchPublicObjectPassportPath(
        "/garden/objects/00000000-0000-4000-8000-000000000101",
      ),
    ).toBeNull();
    expect(
      matchPublicObjectPassportPath(
        "/lineage/objects/00000000-0000-4000-8000-000000000101/extra",
      ),
    ).toBeNull();
  });

  it("renders the same generic 404 for unknown and unpublished passports", () => {
    const html = renderNotFoundPublicObjectPassportHtml("bg");
    expect(html).toContain("Паспортът не е намерен");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain('font-family: "Google Sans"');
    expect(html.match(/rel="preload"/gu)).toHaveLength(1);
    expect(html).not.toMatch(/private|owner|email|location|objectId/i);
  });

  it("renders a localized noindex tombstone without object or caretaker payload", () => {
    const html = renderGonePublicObjectPassportHtml("uk");

    expect(html).toContain("Паспорт видалено");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain('href="/objects"');
    expect(html).not.toMatch(
      /objectId|owner|email|location|region|coordinates|journal body|media/i,
    );
  });
});
