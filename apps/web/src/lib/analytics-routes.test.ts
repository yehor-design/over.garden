import { describe, expect, it } from "vitest";

import {
  ANALYTICS_CONSENT_ATTRIBUTE,
  ANALYTICS_CONSENT_STORAGE_KEY,
  ANALYTICS_ROUTE_ATTRIBUTE,
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
  it("agrees with the component's own rule about which paths are measured", () => {
    for (const pathname of [
      "/",
      "/bg",
      "/blog",
      "/ru/blog/field-note",
      "/guides/start-a-living-plant-record",
      "/markets/ukraine",
      "/journals",
      "/garden",
      "/@yehor/post/3",
      "/species/solanum-lycopersicum",
      "/blogger",
    ]) {
      expect(
        boot(pathname, null).get(ANALYTICS_ROUTE_ATTRIBUTE) === "true",
        pathname,
      ).toBe(isAnalyticsRoute(pathname));
    }
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
    const attributes = boot("/blog", "throws");
    expect(attributes.get(ANALYTICS_CONSENT_ATTRIBUTE)).toBe("undecided");
    expect(attributes.get(ANALYTICS_ROUTE_ATTRIBUTE)).toBe("true");
  });
});
