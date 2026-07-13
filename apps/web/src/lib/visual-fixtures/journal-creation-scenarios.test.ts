import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "./manifest";
import {
  resolveVisualJournalCreationResultScenario,
  resolveVisualJournalCreationScenario,
} from "./journal-creation-scenarios";

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

describe("visual journal creation scenarios", () => {
  it("resolves only a manifest-owned scenario for the requested flow", () => {
    const scenario = VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios[0];

    expect(
      resolveVisualJournalCreationScenario(
        scenario.id,
        scenario.flow,
        LOCAL_ENV,
      ),
    ).toBe(scenario);
    expect(
      resolveVisualJournalCreationScenario(
        scenario.id,
        scenario.flow === "first-entry" ? "follow-up" : "first-entry",
        LOCAL_ENV,
      ),
    ).toBeNull();
    expect(
      resolveVisualJournalCreationScenario("unknown", "first-entry", LOCAL_ENV),
    ).toBeNull();
    expect(
      resolveVisualJournalCreationScenario(scenario.id, scenario.flow, {
        ...LOCAL_ENV,
        VERCEL_ENV: "production",
      }),
    ).toBeNull();
  });

  it("resolves a result only for the scenario-owned readback object", () => {
    const scenario = VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios.find(
      (candidate) => candidate.expectedServerWrite,
    );
    expect(scenario).toBeDefined();

    expect(
      resolveVisualJournalCreationResultScenario(
        scenario!.id,
        scenario!.expectedObjectId,
        LOCAL_ENV,
      ),
    ).toBe(scenario);
    expect(
      resolveVisualJournalCreationResultScenario(
        scenario!.id,
        "00000000-0000-4000-8000-000000000999",
        LOCAL_ENV,
      ),
    ).toBeNull();
  });
});
