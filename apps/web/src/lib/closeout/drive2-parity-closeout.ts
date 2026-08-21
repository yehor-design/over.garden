import { AUTH_INTENT_ACTIONS } from "@/lib/auth/auth-intent-contract";
import {
  CORE_JOURNEY_ARCHETYPES,
  CORE_JOURNEY_EVIDENCE_SCENARIO_IDS,
  CORE_JOURNEY_REQUIRED_STATES,
  CORE_JOURNEY_SCENARIOS,
  CORE_JOURNEY_VIEWPORTS,
  type CoreJourneyArchetype,
  type CoreJourneyScenario,
} from "@/lib/accessibility/core-journey-matrix";
import {
  VISUAL_FIXTURE_MANIFEST,
  VISUAL_FIXTURE_MANIFEST_HASH,
} from "@/lib/visual-fixtures/manifest";

export const DRIVE2_CLOSEOUT_REQUIRED_OBJECT_KINDS = [
  "plant",
  "animal",
] as const;

const REQUIRED_GUEST_JOURNEY_SCENARIOS = [
  "shell:ove187-feed-typical",
  "main:ove187-feed-typical",
  "main:ove187-catalog-page-size-plus-one",
  "main:ove187-journal-directory-default",
  "main:ove187-knowledge-hub-default",
  "community:ove184-community-typical",
  "passport:public-plant-dense",
  "journal-entry:recent-mixed-gallery",
  "profile:gardener-dense",
] as const;

const REQUIRED_AUTHENTICATED_JOURNEY_SCENARIOS = [
  "intent:ove174-i001",
  "intent:ove174-i002",
  "intent:ove174-i003",
  "intent:ove174-i005",
  "intent:ove174-i006",
  "workspace:workspace-dense",
  "passport:owner-plant-dense",
  "passport:owner-animal-typical",
  "passport:owner-bee-archived",
  "creation:ove182-c001",
  "creation:ove182-c002",
  "creation:ove182-c003",
  "creation:ove182-c012",
  "creation:ove182-c013",
  "creation:ove182-c014",
  "creation:ove182-c015",
  "journal-entry:owner-controls",
  "social:feed-dense",
  "social:notifications-dense",
  "community:ove184-community-member",
] as const;

const FORBIDDEN_EVIDENCE_PATH_PATTERNS = [
  /^https?:\/\//i,
  /@[^/]+\.[^/]+/,
  /[?&](?:token|intent|secret|key)=/i,
  /(?:latitude|longitude|coordinates)=/i,
  /quarantine\//i,
] as const;

type RequiredObjectKind =
  (typeof DRIVE2_CLOSEOUT_REQUIRED_OBJECT_KINDS)[number];

interface ArchetypeCoverage {
  scenarioCount: number;
  scenarioIds: string[];
  states: string[];
  viewportIds: string[];
  expectedStatuses: number[];
}

interface JourneyEvidence {
  scenarioId: string;
  archetype: CoreJourneyArchetype;
  path: string;
  expectedStatus: number;
}

export interface Drive2ParityCloseoutCoverage {
  schemaVersion: 1;
  issue: "OVE-186";
  evidenceClass: "local-deterministic-fixture";
  fixture: {
    version: string;
    manifestHash: string;
    namespace: string;
  };
  summary: {
    scenarioCount: number;
    routeViewportCheckCount: number;
    archetypeCount: number;
    stateCount: number;
    viewportCount: number;
  };
  archetypes: Record<CoreJourneyArchetype, ArchetypeCoverage>;
  fixtureCollections: Record<string, number>;
  objectKinds: RequiredObjectKind[];
  authIntentActions: string[];
  journeys: {
    guest: JourneyEvidence[];
    authenticated: JourneyEvidence[];
  };
  screenshotEvidence: Array<{
    archetype: CoreJourneyArchetype;
    scenarioId: string;
    viewportIds: ["mobile-320", "desktop-1440"];
  }>;
  routes: Array<{
    scenarioId: string;
    archetype: CoreJourneyArchetype;
    states: string[];
    fixtureCollection: string;
    fixtureScenarioId: string;
    path: string;
    expectedStatus: number;
    viewportIds: string[];
  }>;
  missing: {
    archetypes: string[];
    states: string[];
    viewports: string[];
    mobileDesktopArchetypes: string[];
    objectKinds: string[];
    authIntentActions: string[];
    guestJourneyScenarios: string[];
    authenticatedJourneyScenarios: string[];
    screenshotEvidenceArchetypes: string[];
    unsafeEvidencePaths: string[];
  };
}

export function buildDrive2ParityCloseoutCoverage(
  options: { scenarios?: readonly CoreJourneyScenario[] } = {},
): Drive2ParityCloseoutCoverage {
  const scenarios = options.scenarios ?? CORE_JOURNEY_SCENARIOS;
  const scenarioById = new Map(
    scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const observedStates = new Set(scenarios.flatMap(({ states }) => states));
  const observedViewports = new Set(
    scenarios.flatMap(({ viewportIds }) => viewportIds),
  );
  const archetypes = Object.fromEntries(
    CORE_JOURNEY_ARCHETYPES.map((archetype) => [
      archetype,
      buildArchetypeCoverage(archetype, scenarios),
    ]),
  ) as Record<CoreJourneyArchetype, ArchetypeCoverage>;
  const observedObjectKinds = new Set([
    ...VISUAL_FIXTURE_MANIFEST.objects.map(({ objectKind }) => objectKind),
    ...VISUAL_FIXTURE_MANIFEST.passportEvidence.scenarios.map(
      ({ objectKind }) => objectKind,
    ),
    ...VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios.map(
      ({ objectKind }) => objectKind,
    ),
  ]);
  const observedAuthActions = new Set(
    VISUAL_FIXTURE_MANIFEST.intentEvidence.scenarios.map(
      ({ action }) => action,
    ),
  );
  const fixtureCollections = Object.fromEntries(
    [...new Set(scenarios.map(({ fixture }) => fixture.collection))]
      .sort()
      .map((collection) => [
        collection,
        scenarios.filter(({ fixture }) => fixture.collection === collection)
          .length,
      ]),
  );

  return {
    schemaVersion: 1,
    issue: "OVE-186",
    evidenceClass: "local-deterministic-fixture",
    fixture: {
      version: VISUAL_FIXTURE_MANIFEST.version,
      manifestHash: VISUAL_FIXTURE_MANIFEST_HASH,
      namespace: VISUAL_FIXTURE_MANIFEST.namespace,
    },
    summary: {
      scenarioCount: scenarios.length,
      routeViewportCheckCount: scenarios.reduce(
        (count, scenario) => count + scenario.viewportIds.length,
        0,
      ),
      archetypeCount: CORE_JOURNEY_ARCHETYPES.filter(
        (archetype) => archetypes[archetype].scenarioCount > 0,
      ).length,
      stateCount: observedStates.size,
      viewportCount: observedViewports.size,
    },
    archetypes,
    fixtureCollections,
    objectKinds: DRIVE2_CLOSEOUT_REQUIRED_OBJECT_KINDS.filter((kind) =>
      observedObjectKinds.has(kind),
    ),
    authIntentActions: AUTH_INTENT_ACTIONS.filter((action) =>
      observedAuthActions.has(action),
    ),
    journeys: {
      guest: journeyEvidence(REQUIRED_GUEST_JOURNEY_SCENARIOS, scenarioById),
      authenticated: journeyEvidence(
        REQUIRED_AUTHENTICATED_JOURNEY_SCENARIOS,
        scenarioById,
      ),
    },
    screenshotEvidence: CORE_JOURNEY_ARCHETYPES.flatMap((archetype) => {
      const scenarioId = CORE_JOURNEY_EVIDENCE_SCENARIO_IDS[archetype];
      const evidenceScenario = scenarioById.get(scenarioId);
      return evidenceScenario
        ? [
            {
              archetype,
              scenarioId,
              viewportIds: ["mobile-320", "desktop-1440"] as [
                "mobile-320",
                "desktop-1440",
              ],
            },
          ]
        : [];
    }),
    routes: scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      archetype: scenario.archetype,
      states: [...scenario.states],
      fixtureCollection: scenario.fixture.collection,
      fixtureScenarioId: scenario.fixture.scenarioId,
      path: scenario.path,
      expectedStatus: scenario.expectedStatus,
      viewportIds: [...scenario.viewportIds],
    })),
    missing: {
      archetypes: CORE_JOURNEY_ARCHETYPES.filter(
        (archetype) => archetypes[archetype].scenarioCount === 0,
      ),
      states: CORE_JOURNEY_REQUIRED_STATES.filter(
        (state) => !observedStates.has(state),
      ),
      viewports: CORE_JOURNEY_VIEWPORTS.map(({ id }) => id).filter(
        (id) => !observedViewports.has(id),
      ),
      mobileDesktopArchetypes: CORE_JOURNEY_ARCHETYPES.filter((archetype) => {
        const viewportIds = archetypes[archetype].viewportIds;
        return (
          !viewportIds.includes("mobile-320") ||
          !viewportIds.includes("desktop-1440")
        );
      }),
      objectKinds: DRIVE2_CLOSEOUT_REQUIRED_OBJECT_KINDS.filter(
        (kind) => !observedObjectKinds.has(kind),
      ),
      authIntentActions: AUTH_INTENT_ACTIONS.filter(
        (action) => !observedAuthActions.has(action),
      ),
      guestJourneyScenarios: REQUIRED_GUEST_JOURNEY_SCENARIOS.filter(
        (id) => !scenarioById.has(id),
      ),
      authenticatedJourneyScenarios:
        REQUIRED_AUTHENTICATED_JOURNEY_SCENARIOS.filter(
          (id) => !scenarioById.has(id),
        ),
      screenshotEvidenceArchetypes: CORE_JOURNEY_ARCHETYPES.filter(
        (archetype) => {
          const scenario = scenarioById.get(
            CORE_JOURNEY_EVIDENCE_SCENARIO_IDS[archetype],
          );
          return (
            !scenario ||
            scenario.archetype !== archetype ||
            !scenario.viewportIds.includes("mobile-320") ||
            !scenario.viewportIds.includes("desktop-1440")
          );
        },
      ),
      unsafeEvidencePaths: scenarios
        .filter(({ path }) =>
          FORBIDDEN_EVIDENCE_PATH_PATTERNS.some((pattern) =>
            pattern.test(path),
          ),
        )
        .map(({ id }) => id),
    },
  };
}

export function assertDrive2ParityCloseoutCoverage(
  report: Drive2ParityCloseoutCoverage,
): void {
  const failures = Object.entries(report.missing).flatMap(([kind, values]) =>
    values.map((value) => `${kind}:${value}`),
  );
  if (failures.length > 0) {
    throw new Error(
      `OVE-186 closeout coverage is incomplete: ${failures.join(", ")}`,
    );
  }
}

/** OVE-330: surface OVE-227 parity drift without blocking the closeout run. */
export function assertDrive2PublicSearchParityGate(input: {
  zeroGap: boolean;
  counts: {
    missing: number;
    extraneous: number;
    stale: number;
    unsafe_schema: number;
    duplicate: number;
    invalid_id: number;
    overdue: number;
    terminal_failure: number;
  };
}): { serveClass: "exact" | "seam_unmet"; blockingCount: number } {
  const blocking =
    input.counts.missing +
    input.counts.extraneous +
    input.counts.stale +
    input.counts.unsafe_schema +
    input.counts.duplicate +
    input.counts.invalid_id +
    input.counts.overdue +
    input.counts.terminal_failure;
  const blockingCount = Math.max(blocking, input.zeroGap ? 0 : 1);
  return blockingCount > 0
    ? { serveClass: "seam_unmet", blockingCount }
    : { serveClass: "exact", blockingCount: 0 };
}

function buildArchetypeCoverage(
  archetype: CoreJourneyArchetype,
  scenarios: readonly CoreJourneyScenario[],
): ArchetypeCoverage {
  const matches = scenarios.filter(
    (scenario) => scenario.archetype === archetype,
  );
  return {
    scenarioCount: matches.length,
    scenarioIds: matches.map(({ id }) => id),
    states: uniqueSorted(matches.flatMap(({ states }) => states)),
    viewportIds: uniqueSorted(
      matches.flatMap(({ viewportIds }) => viewportIds),
    ),
    expectedStatuses: uniqueSorted(
      matches.map(({ expectedStatus }) => expectedStatus),
    ),
  };
}

function journeyEvidence(
  requiredIds: readonly string[],
  scenarioById: ReadonlyMap<string, CoreJourneyScenario>,
): JourneyEvidence[] {
  return requiredIds.flatMap((scenarioId) => {
    const scenario = scenarioById.get(scenarioId);
    return scenario
      ? [
          {
            scenarioId,
            archetype: scenario.archetype,
            path: scenario.path,
            expectedStatus: scenario.expectedStatus,
          },
        ]
      : [];
  });
}

function uniqueSorted<T extends number | string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
}
