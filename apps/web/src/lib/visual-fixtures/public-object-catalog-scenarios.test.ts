import { describe, expect, it } from "vitest";

import { resolveVisualFixturePublicObjectCatalogMode } from "./public-object-catalog-scenarios";

const enabledEnv = {
  VISUAL_FIXTURES_ENABLED: "true",
  VISUAL_FIXTURES_TARGET: "local",
  VISUAL_FIXTURES_DATABASE: "overgarden_visual",
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1/overgarden_visual",
  R2_ENDPOINT: "http://127.0.0.1:9000",
  R2_PUBLIC_BASE_URL: "http://127.0.0.1:9000/overgarden",
};

describe("visual fixture public object catalog scenarios", () => {
  it.each(["loading", "error"] as const)(
    "enables the %s state only inside the isolated fixture environment",
    (mode) => {
      expect(
        resolveVisualFixturePublicObjectCatalogMode(
          { __visualObjects: mode },
          enabledEnv,
        ),
      ).toBe(mode);
      expect(
        resolveVisualFixturePublicObjectCatalogMode(
          { __visualObjects: mode },
          {},
        ),
      ).toBeNull();
    },
  );

  it("rejects unknown and repeated scenario parameters", () => {
    expect(
      resolveVisualFixturePublicObjectCatalogMode(
        { __visualObjects: "ready" },
        enabledEnv,
      ),
    ).toBeNull();
    expect(
      resolveVisualFixturePublicObjectCatalogMode(
        { __visualObjects: ["loading", "error"] },
        enabledEnv,
      ),
    ).toBeNull();
  });
});
