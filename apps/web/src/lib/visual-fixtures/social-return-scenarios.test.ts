import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "./manifest";
import { resolveVisualSocialScenario } from "./social-return-scenarios";

const LOCAL_ENV = {
  VISUAL_FIXTURES_ENABLED: "true",
  VISUAL_FIXTURES_TARGET: "local",
  VISUAL_FIXTURES_DATABASE: "overgarden",
  DATABASE_URL: "postgresql://overgarden:secret@localhost:5432/overgarden",
  R2_ENDPOINT: "http://localhost:9000",
  R2_PUBLIC_BASE_URL: "http://localhost:9000/overgarden-public",
  PUBLIC_SITE_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
} as const;

describe("visual social scenario resolver", () => {
  it("resolves only a manifest scenario for the requested surface", () => {
    const scenario = VISUAL_FIXTURE_MANIFEST.socialEvidence.scenarios.find(
      (candidate) => candidate.id === "feed-dense",
    );
    expect(
      resolveVisualSocialScenario("feed-dense", "feed", LOCAL_ENV),
    ).toEqual(scenario);
    expect(
      resolveVisualSocialScenario("feed-dense", "notifications", LOCAL_ENV),
    ).toBeNull();
    expect(
      resolveVisualSocialScenario("unknown", "feed", LOCAL_ENV),
    ).toBeNull();
  });

  it("fails closed when fixtures are disabled or Production is detected", () => {
    expect(resolveVisualSocialScenario("feed-dense", "feed", {})).toBeNull();
    expect(
      resolveVisualSocialScenario("feed-dense", "feed", {
        ...LOCAL_ENV,
        VERCEL_ENV: "production",
      }),
    ).toBeNull();
  });
});
