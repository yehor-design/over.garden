import { describe, expect, it } from "vitest";

import {
  assertPlantNetImplementationSha,
  assertPlantNetProofEnvironment,
  assertPlantNetRuntimeEnabled,
  parsePlantNetBenchmarkManifest,
  PlantNetProofContractError,
  redactedBenchmarkPlan,
} from "./plantnet-species-proof";

const MANIFEST = {
  schemaVersion: "ove269.plantnet-benchmark.v1",
  rightsCleanOperatorFixtures: true,
  excludesProductionGardenerData: true,
  cases: [
    {
      id: "ua-operator-leaf",
      market: "ua",
      organ: "leaf",
      fixturePath: "fixtures/ua-leaf.jpg",
      fixtureSha256: "a".repeat(64),
      minimumCandidateCount: 1,
    },
    {
      id: "bg-operator-flower",
      market: "bg",
      organ: "flower",
      fixturePath: "fixtures/bg-flower.png",
      fixtureSha256: "b".repeat(64),
      minimumCandidateCount: 2,
    },
  ],
};

describe("Pl@ntNet proof contract", () => {
  it("admits only rights-clean UA and BG fixture plans and emits no paths or hashes", () => {
    const manifest = parsePlantNetBenchmarkManifest(MANIFEST);
    expect(redactedBenchmarkPlan(manifest)).toEqual({
      schemaVersion: "ove269.plantnet-benchmark.v1",
      class: "rights_clean_fixture_plan",
      caseCount: 2,
      markets: ["bg", "ua"],
      productGardenerDataExcluded: true,
      externalCalls: 0,
    });
    expect(JSON.stringify(redactedBenchmarkPlan(manifest))).not.toContain(
      "fixtures/",
    );
  });

  it.each([
    { ...MANIFEST, cases: MANIFEST.cases.slice(0, 1) },
    {
      ...MANIFEST,
      cases: [
        { ...MANIFEST.cases[0], fixturePath: "../owner-photo.jpg" },
        MANIFEST.cases[1],
      ],
    },
    { ...MANIFEST, excludesProductionGardenerData: false },
  ])("fails closed for an unsafe benchmark manifest", (input) => {
    expect(() => parsePlantNetBenchmarkManifest(input)).toThrow(
      PlantNetProofContractError,
    );
  });

  it("requires exact production confirmation, an exact SHA, and an enabled secret-backed capability", () => {
    expect(() =>
      assertPlantNetProofEnvironment({
        environment: "production",
        confirmEnvironment: "production",
        allowExternalCall: false,
      }),
    ).toThrow("production_confirmation_required");
    expect(() => assertPlantNetImplementationSha("not-a-sha")).toThrow(
      "implementation_sha_invalid",
    );
    expect(() =>
      assertPlantNetRuntimeEnabled({
        PLANTNET_SPECIES_IDENTIFICATION_ENABLED: "true",
      }),
    ).toThrow("feature_not_enabled");
  });
});
