import { describe, expect, it } from "vitest";

import { VISUAL_FIXTURE_MANIFEST } from "@/lib/visual-fixtures/manifest";
import {
  browserSafeFixturePath,
  CORE_JOURNEY_ARCHETYPES,
  CORE_JOURNEY_REQUIRED_STATES,
  CORE_JOURNEY_SCENARIOS,
  CORE_JOURNEY_VIEWPORTS,
  type CoreJourneyFixtureCollection,
} from "./core-journey-matrix";

function idsFor(collection: CoreJourneyFixtureCollection): Set<string> {
  switch (collection) {
    case "main":
      return new Set(VISUAL_FIXTURE_MANIFEST.scenarios.map(({ id }) => id));
    case "passport":
      return new Set(
        VISUAL_FIXTURE_MANIFEST.passportEvidence.scenarios.map(({ id }) => id),
      );
    case "journal-entry":
      return new Set(
        VISUAL_FIXTURE_MANIFEST.journalEntryEvidence.scenarios.map(
          ({ id }) => id,
        ),
      );
    case "profile":
      return new Set(
        VISUAL_FIXTURE_MANIFEST.profileEvidence.scenarios.map(({ id }) => id),
      );
    case "workspace":
      return new Set(
        VISUAL_FIXTURE_MANIFEST.workspaceEvidence.scenarios.map(({ id }) => id),
      );
    case "creation":
      return new Set(
        VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios.map(({ id }) => id),
      );
    case "intent":
      return new Set(
        VISUAL_FIXTURE_MANIFEST.intentEvidence.scenarios.map(({ id }) => id),
      );
    case "social":
      return new Set(
        VISUAL_FIXTURE_MANIFEST.socialEvidence.scenarios.map(({ id }) => id),
      );
    case "community":
      return new Set(
        VISUAL_FIXTURE_MANIFEST.communityEvidence.scenarios.map(({ id }) => id),
      );
  }
}

describe("OVE-185 core journey matrix", () => {
  it("keeps the v8 scenario and route-viewport cardinality explicit", () => {
    expect(CORE_JOURNEY_SCENARIOS).toHaveLength(171);
    expect(
      CORE_JOURNEY_SCENARIOS.reduce(
        (count, scenario) => count + scenario.viewportIds.length,
        0,
      ),
    ).toBe(642);
  });

  it("covers every required archetype, state class, and viewport", () => {
    const archetypes = new Set(
      CORE_JOURNEY_SCENARIOS.map(({ archetype }) => archetype),
    );
    const states = new Set(
      CORE_JOURNEY_SCENARIOS.flatMap(({ states }) => states),
    );
    const viewportIds = new Set(
      CORE_JOURNEY_SCENARIOS.flatMap(({ viewportIds }) => viewportIds),
    );

    expect([...archetypes].sort()).toEqual([...CORE_JOURNEY_ARCHETYPES].sort());
    expect(
      CORE_JOURNEY_REQUIRED_STATES.filter((state) => !states.has(state)),
    ).toEqual([]);
    expect([...viewportIds].sort()).toEqual(
      CORE_JOURNEY_VIEWPORTS.map(({ id }) => id).sort(),
    );
  });

  it("keeps all routes tied to existing stable OVE-187 scenario ids", () => {
    for (const scenario of CORE_JOURNEY_SCENARIOS) {
      expect(
        idsFor(scenario.fixture.collection).has(scenario.fixture.scenarioId),
      ).toBe(true);
      expect(scenario.path.startsWith("/")).toBe(true);
      expect(scenario.viewportIds).toContain("mobile-320");
      expect(scenario.viewportIds).toContain("desktop-1440");
    }
  });

  it("keeps evidence paths local, redacted, and token-free", () => {
    for (const scenario of CORE_JOURNEY_SCENARIOS) {
      expect(scenario.path).not.toMatch(/^https?:\/\//);
      expect(scenario.path).not.toMatch(/@[^/]+\.[^/]+/);
      expect(scenario.path).not.toMatch(/[?&](token|intent|secret|key)=/i);
      expect(scenario.path).not.toMatch(/(latitude|longitude|coordinates)=/i);
      expect(scenario.path).not.toContain("quarantine/");
    }
  });

  it("encodes profile handles without changing their fixture identity", () => {
    expect(browserSafeFixturePath("/@demo_olena")).toBe("/%40demo_olena");
    expect(browserSafeFixturePath("/bg/@demo_mariya?view=objects")).toBe(
      "/bg/%40demo_mariya?view=objects",
    );
  });

  it("runs automated accessibility scans for every core archetype", () => {
    const axeArchetypes = new Set(
      CORE_JOURNEY_SCENARIOS.filter(({ runAxe }) => runAxe).map(
        ({ archetype }) => archetype,
      ),
    );

    expect([...axeArchetypes].sort()).toEqual(
      [...CORE_JOURNEY_ARCHETYPES].sort(),
    );
  });
});
