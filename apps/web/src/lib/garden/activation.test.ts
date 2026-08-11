import { describe, expect, it } from "vitest";

import {
  activationSurfaceKindForSource,
  normalizeActivationSourceParam,
  normalizeActivationSourceValue,
} from "./activation";

describe("garden activation attribution", () => {
  it("normalizes homepage and direct starts to enum-only sources", () => {
    expect(normalizeActivationSourceParam("homepage")).toBe("homepage");
    expect(normalizeActivationSourceParam(undefined)).toBe("direct_garden");
    expect(normalizeActivationSourceParam("direct-garden")).toBe(
      "direct_garden",
    );
  });

  it("requires a server-resolved catalog selection for public variety starts", () => {
    expect(
      normalizeActivationSourceParam("public-variety", {
        hasResolvedCatalogSelection: true,
      }),
    ).toBe("public_variety");
    expect(normalizeActivationSourceParam("public-variety")).toBe(
      "direct_garden",
    );
  });

  it("treats retired product-access invite sources as direct starts", () => {
    expect(normalizeActivationSourceParam("invited-cohort")).toBe(
      "direct_garden",
    );
    expect(normalizeActivationSourceValue("invited_cohort")).toBeNull();
  });

  it("rejects raw URLs and query strings from request payload attribution", () => {
    expect(normalizeActivationSourceValue("homepage")).toBe("homepage");
    expect(normalizeActivationSourceValue("public_variety")).toBe(
      "public_variety",
    );
    expect(normalizeActivationSourceValue("direct_garden")).toBe(
      "direct_garden",
    );
    expect(
      normalizeActivationSourceValue("https://over.garden/?source=homepage"),
    ).toBeNull();
    expect(normalizeActivationSourceValue("catalog=tomato")).toBeNull();
  });

  it("maps sources to bounded surface-kind enums", () => {
    expect(activationSurfaceKindForSource("homepage")).toBe("homepage");
    expect(activationSurfaceKindForSource("public_variety")).toBe("variety");
    expect(activationSurfaceKindForSource("direct_garden")).toBe("garden");
  });
});
