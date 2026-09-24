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
    expect(html).not.toMatch(/private|owner|email|location|objectId/i);
  });

  it("renders a localized noindex tombstone without object or caretaker payload", () => {
    const html = renderGonePublicObjectPassportHtml("uk");

    expect(html).toContain("Паспорт видалено");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    // A passport is a gardener's object: with no profile to lead to, the way
    // on is the journals, not the organism catalogue (OG-UX-019, OVE-478).
    expect(html).toContain('href="/journals"');
    expect(html).not.toContain('href="/catalog"');
    // The payload, not the constant stylesheet: its `@media` query is CSS.
    expect(html.replace(/<style>[\s\S]*?<\/style>/u, "")).not.toMatch(
      /objectId|owner|email|location|region|coordinates|journal body|media/i,
    );
  });

  it("leads to the gardener's other plants and animals while their profile answers", () => {
    const html = renderGonePublicObjectPassportHtml("bg", undefined, {
      handle: "yehor",
    });
    expect(html).toContain('href="/bg/@yehor#profile-objects"');
    expect(html).toContain("Растения и животни на @yehor");
    // One way on, never two.
    expect(html.match(/<main>[\s\S]*<\/main>/u)?.[0].match(/<a /gu)).toHaveLength(
      1,
    );
  });
});
