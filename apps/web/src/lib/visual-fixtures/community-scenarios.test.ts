import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "./manifest";
import { resolveVisualCommunityScenario } from "./community-scenarios";

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

describe("visual community scenario resolver", () => {
  it("resolves only exact manifest scenarios", () => {
    const scenario = VISUAL_FIXTURE_MANIFEST.communityEvidence.scenarios.find(
      (candidate) => candidate.id === "ove184-community-dense",
    );

    expect(
      resolveVisualCommunityScenario("ove184-community-dense", LOCAL_ENV),
    ).toEqual(scenario);
    expect(resolveVisualCommunityScenario("unknown", LOCAL_ENV)).toBeNull();
  });

  it("fails closed when fixtures are disabled or Production is detected", () => {
    expect(
      resolveVisualCommunityScenario("ove184-community-dense", {}),
    ).toBeNull();
    expect(
      resolveVisualCommunityScenario("ove184-community-dense", {
        ...LOCAL_ENV,
        VERCEL_ENV: "production",
      }),
    ).toBeNull();
  });
});
