import { describe, expect, it } from "vitest";

import { PUBLIC_LOCALES } from "@/lib/public-localization";

import { getLegalAcceptanceCopy } from "./legal-acceptance-copy";

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, shape(inner)]),
    );
  }
  return typeof value;
}

describe("the acceptance copy", () => {
  it("says the same things in every language", () => {
    const reference = shape(getLegalAcceptanceCopy("uk"));
    for (const locale of PUBLIC_LOCALES) {
      expect(shape(getLegalAcceptanceCopy(locale)), locale).toEqual(reference);
    }
  });

  it("reads as one sentence around the three document links", () => {
    for (const locale of PUBLIC_LOCALES) {
      const { consent } = getLegalAcceptanceCopy(locale);
      const sentence = Object.values(consent).join("");
      expect(sentence, locale).toMatch(/^\S.*\.$/u);
      expect(sentence, locale).not.toMatch(/\s{2}/u);
    }
  });

  it("never switches a cookie on for the reader", () => {
    for (const locale of PUBLIC_LOCALES) {
      const { screen } = getLegalAcceptanceCopy(locale);
      // Accepting the terms is one thing; the two cookie choices are others.
      expect(screen.cookiesLead.length, locale).toBeGreaterThan(40);
      expect(screen.accept, locale).not.toMatch(/cookie|бисквит/iu);
    }
  });
});
