import { describe, expect, it } from "vitest";

import {
  publicCardMediaAltText,
  publicMediaAltText,
} from "@/lib/public-media-alt";

/**
 * There were three fallbacks before this, two of them on one page:
 * `alt="Томат - Sep 1, 1"` above the fold and `alt="Томат - Sep 1 1"` in the
 * body. A number describes nothing, and two formats for one rule is a defect
 * by itself.
 */
describe("the sentence a photograph is described by", () => {
  it("prefers the gardener's caption", () => {
    expect(
      publicMediaAltText(
        { caption: "Перша китиця", altText: "щось інше" },
        "Перший урожай",
      ),
    ).toBe("Перша китиця");
  });

  it("falls back to the stored alt text of an older row", () => {
    expect(
      publicMediaAltText({ caption: null, altText: "Стиглі томати" }, "Урожай"),
    ).toBe("Стиглі томати");
  });

  it("falls back to the entry's title, never to a number", () => {
    const alt = publicMediaAltText({ caption: null, altText: null }, "Урожай");
    expect(alt).toBe("Урожай");
    expect(alt).not.toMatch(/\d/u);
  });

  it("treats whitespace as absence", () => {
    expect(
      publicMediaAltText({ caption: "   ", altText: "  " }, "  Урожай  "),
    ).toBe("Урожай");
  });

  it("gives every photo in an entry the same fallback", () => {
    const title = "Перший урожай після спеки";
    const photos = [
      { caption: null, altText: null },
      { caption: null, altText: null },
      { caption: null, altText: null },
    ];
    const alts = photos.map((photo) => publicMediaAltText(photo, title));
    expect(new Set(alts).size).toBe(1);
  });
});

/**
 * OG-UX-029: a card's photograph sits beside the entry's own linked title, so
 * repeating the title made a screen reader say it twice and described nothing.
 */
describe("the sentence a card's photograph is described by", () => {
  it("carries the gardener's own description", () => {
    expect(
      publicCardMediaAltText({ caption: "Жовті плями на нижньому листі" }),
    ).toBe("Жовті плями на нижньому листі");
  });

  it("is decorative without one, never the title again", () => {
    expect(publicCardMediaAltText({})).toBe("");
    expect(publicCardMediaAltText({ caption: "  ", altText: null })).toBe("");
  });

  it("falls back to the stored alt text of an older row", () => {
    expect(publicCardMediaAltText({ altText: "Стиглі томати" })).toBe(
      "Стиглі томати",
    );
  });
});
