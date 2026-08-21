import { LOCALIZATION_OWNER_BROWSER_PROBES } from "@/lib/localization/localization-browser-matrix";

export interface LocalizationAvailabilityInput {
  missing: {
    ownerViewportProof: readonly string[];
    ownerScenarioProof: readonly string[];
    requiredStates: readonly string[];
    [kind: string]: readonly string[];
  };
  browserProbeIds: readonly string[];
}

export function classifyLocalizationCoverageAvailability(
  input: LocalizationAvailabilityInput,
): {
  serveClass: "exact" | "probe_missing";
  warningCount: number;
  warningKinds: Array<"ownerViewportProof" | "ownerScenarioProof">;
} {
  const missingProbeWarnings = input.missing.ownerViewportProof.filter(
    (value) =>
      /:(?:missing-browser-probe|missing-raw-browser-probe)$/u.test(value),
  );
  const warningCount = missingProbeWarnings.length;
  const warningKinds: Array<"ownerViewportProof" | "ownerScenarioProof"> =
    warningCount > 0 ? ["ownerViewportProof"] : [];
  const observedProbeIds = new Set(input.browserProbeIds);
  const statesOwnedByMissingProbes = new Set<string>(
    LOCALIZATION_OWNER_BROWSER_PROBES.filter(
      ({ id }) => !observedProbeIds.has(id),
    ).flatMap(({ stateClasses }) => stateClasses),
  );
  const failures = Object.entries(input.missing).flatMap(([kind, values]) => {
    if (kind === "ownerViewportProof") {
      return values
        .filter((value) => !missingProbeWarnings.includes(value))
        .map((value) => `${kind}:${value}`);
    }
    if (kind === "requiredStates" && warningCount > 0) {
      return values
        .filter((value) => !statesOwnedByMissingProbes.has(value))
        .map((value) => `${kind}:${value}`);
    }
    return values.map((value) => `${kind}:${value}`);
  });
  if (failures.length > 0) {
    throw new Error(
      `OVE-205 localization coverage is incomplete: ${failures.join(", ")}`,
    );
  }

  return warningCount > 0
    ? { serveClass: "probe_missing", warningCount, warningKinds }
    : { serveClass: "exact", warningCount: 0, warningKinds: [] };
}
