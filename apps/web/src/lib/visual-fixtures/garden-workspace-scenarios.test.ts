import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "./manifest";
import { resolveVisualGardenWorkspaceScenario } from "./garden-workspace-scenarios";

const LOCAL_ENV = {
  VISUAL_FIXTURES_ENABLED: "true",
  VISUAL_FIXTURES_TARGET: "local",
  VISUAL_FIXTURES_DATABASE: "overgarden",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/overgarden",
  R2_ENDPOINT: "http://127.0.0.1:9000",
  R2_PUBLIC_BASE_URL: "http://127.0.0.1:9000/public",
  PUBLIC_SITE_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
} as const;

describe("visual garden workspace scenarios", () => {
  it("resolves only a manifest-owned scenario in a fail-closed fixture environment", () => {
    const scenario = resolveVisualGardenWorkspaceScenario("dense", LOCAL_ENV);

    expect(scenario).toBe(
      VISUAL_FIXTURE_MANIFEST.workspaceEvidence.scenarios.find(
        (candidate) => candidate.state === "dense",
      ),
    );
    expect(
      resolveVisualGardenWorkspaceScenario("unknown", LOCAL_ENV),
    ).toBeNull();
    expect(
      resolveVisualGardenWorkspaceScenario("dense", {
        ...LOCAL_ENV,
        VISUAL_FIXTURES_ENABLED: "false",
      }),
    ).toBeNull();
    expect(
      resolveVisualGardenWorkspaceScenario("dense", {
        ...LOCAL_ENV,
        VERCEL_ENV: "production",
      }),
    ).toBeNull();
  });

  it("keeps every visual state on the real /garden route", () => {
    for (const scenario of VISUAL_FIXTURE_MANIFEST.workspaceEvidence
      .scenarios) {
      expect(scenario.path).toBe(
        `/garden?visualWorkspace=${encodeURIComponent(scenario.state)}`,
      );
      expect(scenario.viewportTargets).toEqual(["desktop", "mobile-320"]);
    }
  });
});
