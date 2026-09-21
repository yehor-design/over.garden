import { describe, expect, it } from "vitest";

import {
  ANALYTICS_CONSENT_ATTRIBUTE,
  ANALYTICS_CONSENT_STORAGE_KEY,
  analyticsDocumentBootScript,
  isAnalyticsRoute,
} from "./analytics-routes";

/** Runs the inline script the way a document does, against stand-ins. */
function boot(pathname: string, stored: string | null | "throws") {
  const attributes = new Map<string, string>();
  const run = new Function(
    "document",
    "location",
    "localStorage",
    analyticsDocumentBootScript(),
  );
  run(
    {
      documentElement: {
        setAttribute: (name: string, value: string) =>
          attributes.set(name, value),
      },
    },
    { pathname },
    {
      getItem: (key: string) => {
        if (stored === "throws") throw new Error("storage denied");
        return key === ANALYTICS_CONSENT_STORAGE_KEY ? stored : null;
      },
    },
  );
  return attributes;
}

describe("what a document says about analytics before it paints (ADR-0032 D7)", () => {
  it("owes the notice on every page, measured or not, until the reader answers", () => {
    // The owner, 2026-09-21: the notice used to be owed only on the measured
    // paths, so it vanished the moment a reader left `/`. The script says one
    // thing now — the answer — and says it identically on every address.
    for (const pathname of [
      "/",
      "/bg",
      "/blog",
      "/ru/blog/field-note",
      "/guides/start-a-living-plant-record",
      "/markets/ukraine",
      "/journals",
      "/garden",
      "/garden/entries/new",
      "/auth/sign-in",
      "/@yehor/post/3",
      "/species/solanum-lycopersicum",
      "/blogger",
    ]) {
      expect(Object.fromEntries(boot(pathname, null)), pathname).toEqual({
        [ANALYTICS_CONSENT_ATTRIBUTE]: "undecided",
      });
      expect(Object.fromEntries(boot(pathname, "declined")), pathname).toEqual({
        [ANALYTICS_CONSENT_ATTRIBUTE]: "declined",
      });
    }
    // The measured paths are still a closed set — for the tags, not the notice.
    expect(isAnalyticsRoute("/journals")).toBe(false);
    expect(isAnalyticsRoute("/blog")).toBe(true);
  });

  it("reads the stored answer, and owes nothing to a value it does not know", () => {
    expect(boot("/", "accepted").get(ANALYTICS_CONSENT_ATTRIBUTE)).toBe(
      "accepted",
    );
    expect(boot("/", "declined").get(ANALYTICS_CONSENT_ATTRIBUTE)).toBe(
      "declined",
    );
    expect(boot("/", null).get(ANALYTICS_CONSENT_ATTRIBUTE)).toBe("undecided");
    expect(boot("/", "yes please").get(ANALYTICS_CONSENT_ATTRIBUTE)).toBe(
      "undecided",
    );
  });

  it("survives a browser that refuses storage", () => {
    const attributes = boot("/journals", "throws");
    expect(attributes.get(ANALYTICS_CONSENT_ATTRIBUTE)).toBe("undecided");
  });
});
