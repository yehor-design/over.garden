import {
  VISUAL_FIXTURE_MANIFEST,
  type VisualFixtureCommunityScenario,
  type VisualFixtureCreationScenarioEvidence,
  type VisualFixtureIntentScenario,
  type VisualFixtureJournalEntryScenarioEvidence,
  type VisualFixturePassportScenarioEvidence,
  type VisualFixtureProfileScenarioEvidence,
  type VisualFixtureScenario,
  type VisualFixtureSocialScenario,
  type VisualFixtureWorkspaceScenarioEvidence,
} from "@/lib/visual-fixtures/manifest";

export const CORE_JOURNEY_VIEWPORTS = [
  { id: "mobile-320", width: 320, height: 844 },
  { id: "mobile-360", width: 360, height: 800 },
  { id: "mobile-390", width: 390, height: 844 },
  {
    id: "zoom-200-reflow",
    width: 640,
    height: 900,
    reflowSourceWidth: 1280,
    zoomPercent: 200,
  },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "desktop-1024", width: 1024, height: 768 },
  { id: "desktop-1280", width: 1280, height: 900 },
  { id: "desktop-1440", width: 1440, height: 1000 },
] as const;

export type CoreJourneyViewportId =
  (typeof CORE_JOURNEY_VIEWPORTS)[number]["id"];

export const CORE_JOURNEY_ARCHETYPES = [
  "shell",
  "feed",
  "catalog",
  "journal-directory",
  "knowledge",
  "object-passport",
  "journal-entry",
  "profile",
  "workspace",
  "creation",
  "auth-intent",
  "social",
  "community",
] as const;

export type CoreJourneyArchetype = (typeof CORE_JOURNEY_ARCHETYPES)[number];

export const CORE_JOURNEY_EVIDENCE_SCENARIO_IDS = {
  shell: "shell:ove187-feed-typical",
  feed: "main:ove187-feed-typical",
  catalog: "main:ove187-catalog-page-size-plus-one",
  "journal-directory": "main:ove187-journal-directory-plus-one",
  knowledge: "main:ove187-knowledge-guide-dense",
  "object-passport": "passport:public-plant-dense",
  "journal-entry": "journal-entry:recent-mixed-gallery",
  profile: "profile:gardener-dense",
  workspace: "workspace:workspace-dense",
  creation: "creation:ove182-c005",
  "auth-intent": "intent:ove174-i001",
  social: "social:comments-dense",
  community: "community:ove184-community-typical",
} as const satisfies Record<CoreJourneyArchetype, string>;

export const CORE_JOURNEY_REQUIRED_STATES = [
  "empty",
  "typical",
  "dense",
  "long-text",
  "no-media",
  "mixed-media",
  "loading",
  "recoverable-error",
  "not-found",
  "gone",
  "guest",
  "authenticated",
  "pagination",
  "offline",
  "privacy",
  "moderation",
] as const;

export type CoreJourneyState =
  | (typeof CORE_JOURNEY_REQUIRED_STATES)[number]
  | "sparse"
  | "single"
  | "cancelled"
  | "invalid"
  | "blocked"
  | "archived";

export type CoreJourneyFixtureCollection =
  | "main"
  | "passport"
  | "journal-entry"
  | "profile"
  | "workspace"
  | "creation"
  | "intent"
  | "social"
  | "community";

export interface CoreJourneyScenario {
  id: string;
  archetype: CoreJourneyArchetype;
  states: readonly CoreJourneyState[];
  fixture: {
    collection: CoreJourneyFixtureCollection;
    scenarioId: string;
  };
  path: string;
  expectedStatus: 200 | 404 | 410;
  viewportIds: readonly CoreJourneyViewportId[];
  runAxe: boolean;
}

const BASE_VIEWPORT_IDS: readonly CoreJourneyViewportId[] = [
  "mobile-320",
  "desktop-1440",
];
const ALL_VIEWPORT_IDS = CORE_JOURNEY_VIEWPORTS.map(({ id }) => id);

const FULL_RESPONSIVE_SCENARIOS = new Set([
  "shell:ove187-feed-typical",
  "main:ove187-feed-dense",
  "main:ove187-feed-loading",
  "main:ove187-feed-error",
  "main:ove187-catalog-zero-results",
  "main:ove187-catalog-pagination",
  "main:ove187-catalog-loading",
  "main:ove187-catalog-error",
  "main:ove187-journal-directory-default",
  "main:ove187-journal-directory-page-two",
  "main:ove187-journal-directory-loading",
  "main:ove187-journal-directory-error",
  "main:ove187-knowledge-hub-default",
  "main:ove187-knowledge-answer-long",
  "main:ove187-knowledge-hub-loading",
  "main:ove187-knowledge-hub-error",
  "passport:public-plant-long-name",
  "passport:public-plant-dense",
  "passport:public-animal-typical",
  "journal-entry:recent-mixed-gallery",
  "journal-entry:backdated-long",
  "journal-entry:gone-410",
  "profile:long-fields",
  "profile:gardener-dense",
  "workspace:workspace-guest",
  "workspace:workspace-dense",
  "workspace:workspace-offline",
  "workspace:workspace-loading",
  "workspace:workspace-error",
  "creation:ove182-c004",
  "creation:ove182-c005",
  "creation:ove182-c007",
  "creation:ove182-c008",
  "creation:ove182-c009",
  "creation:ove182-c013",
  "intent:ove174-i001",
  "intent:ove174-i007",
  "intent:ove174-i011",
  "intent:ove174-i013",
  "social:comments-dense",
  "social:feed-dense",
  "social:notifications-dense",
  "social:bookmarks-dense",
  "social:wishlist-dense",
  "community:ove184-community-dense",
  "community:ove184-community-moderator",
  "community:ove184-community-blocked",
  "community:ove184-community-loading",
  "community:ove184-community-error",
  "community:ove184-community-unavailable",
]);

const AXE_SCENARIOS = new Set(FULL_RESPONSIVE_SCENARIOS);

function viewportIdsFor(id: string): readonly CoreJourneyViewportId[] {
  return FULL_RESPONSIVE_SCENARIOS.has(id)
    ? ALL_VIEWPORT_IDS
    : BASE_VIEWPORT_IDS;
}

function scenario(
  value: Omit<CoreJourneyScenario, "viewportIds" | "runAxe">,
): CoreJourneyScenario {
  return {
    ...value,
    viewportIds: viewportIdsFor(value.id),
    runAxe: AXE_SCENARIOS.has(value.id),
  };
}

function stateFromText(value: string): CoreJourneyState[] {
  const states = new Set<CoreJourneyState>();

  if (/empty|zero/.test(value)) states.add("empty");
  if (/sparse|minus-one/.test(value)) states.add("sparse");
  if (
    /typical|default|active|variety|species|breed|filtered|corrected/.test(
      value,
    )
  ) {
    states.add("typical");
  }
  if (/dense|page-size-plus-one/.test(value)) states.add("dense");
  if (/long/.test(value)) states.add("long-text");
  if (/loading/.test(value)) states.add("loading");
  if (/error/.test(value)) states.add("recoverable-error");
  if (/pagination|page-two|page-2|exhausted|page-size/.test(value)) {
    states.add("pagination");
  }
  if (/missing|unavailable|private|removed/.test(value)) {
    states.add("not-found");
  }
  if (/gone/.test(value)) states.add("gone");
  if (/blocked/.test(value)) states.add("blocked");
  if (states.size === 0) states.add("typical");

  return [...states];
}

function mainArchetype(fixture: VisualFixtureScenario): CoreJourneyArchetype {
  if (fixture.kind.startsWith("public-feed")) return "feed";
  if (fixture.kind.startsWith("public-catalog")) return "catalog";
  if (fixture.kind.startsWith("public-journal-directory")) {
    return "journal-directory";
  }
  if (fixture.kind.startsWith("public-knowledge")) return "knowledge";
  throw new Error(`Unsupported main accessibility fixture: ${fixture.id}`);
}

function mainScenario(fixture: VisualFixtureScenario): CoreJourneyScenario {
  const archetype = mainArchetype(fixture);
  const id = `main:${fixture.id}`;
  const states = stateFromText(`${fixture.kind} ${fixture.id}`);

  if (
    ["feed", "catalog", "journal-directory", "knowledge"].includes(archetype)
  ) {
    states.push("guest");
  }
  if (fixture.id === "ove187-feed-dense") states.push("mixed-media");
  if (fixture.id === "ove187-catalog-empty") states.push("no-media");

  return scenario({
    id,
    archetype,
    states: [...new Set(states)],
    fixture: { collection: "main", scenarioId: fixture.id },
    path: fixture.path,
    expectedStatus: fixture.expectedStatus,
  });
}

function passportScenario(
  fixture: VisualFixturePassportScenarioEvidence,
): CoreJourneyScenario {
  const states = new Set<CoreJourneyState>([
    fixture.access === "guest-public" ? "guest" : "authenticated",
    ...stateFromText(`${fixture.id} ${fixture.timelineState}`),
  ]);
  if (fixture.mediaState === "none") states.add("no-media");
  if (fixture.mediaState === "gallery") states.add("mixed-media");
  if (fixture.expectedStatus === 404) states.add("not-found");
  if (fixture.expectedStatus === 410) states.add("gone");

  return scenario({
    id: `passport:${fixture.id}`,
    archetype: "object-passport",
    states: [...states],
    fixture: { collection: "passport", scenarioId: fixture.id },
    path: fixture.path,
    expectedStatus: fixture.expectedStatus,
  });
}

function journalEntryScenario(
  fixture: VisualFixtureJournalEntryScenarioEvidence,
): CoreJourneyScenario {
  const states = new Set<CoreJourneyState>([
    fixture.access === "guest" ? "guest" : "authenticated",
    ...stateFromText(`${fixture.id} ${fixture.contentLength}`),
  ]);
  if (fixture.mediaState === "none") states.add("no-media");
  if (fixture.mediaState === "mixed-gallery") states.add("mixed-media");
  if (fixture.expectedStatus === 404) states.add("not-found");
  if (fixture.expectedStatus === 410) states.add("gone");

  return scenario({
    id: `journal-entry:${fixture.id}`,
    archetype: "journal-entry",
    states: [...states],
    fixture: { collection: "journal-entry", scenarioId: fixture.id },
    path: fixture.path,
    expectedStatus: fixture.expectedStatus,
  });
}

function profileScenario(
  fixture: VisualFixtureProfileScenarioEvidence,
): CoreJourneyScenario {
  const states = new Set<CoreJourneyState>([
    fixture.access === "guest" ? "guest" : "authenticated",
    ...stateFromText(`${fixture.id} ${fixture.contentState}`),
  ]);
  if (!fixture.expectedAvatar) states.add("no-media");
  if (fixture.expectedStatus === 404) states.add("not-found");

  return scenario({
    id: `profile:${fixture.id}`,
    archetype: "profile",
    states: [...states],
    fixture: { collection: "profile", scenarioId: fixture.id },
    path: fixture.path,
    expectedStatus: fixture.expectedStatus,
  });
}

function workspaceScenario(
  fixture: VisualFixtureWorkspaceScenarioEvidence,
): CoreJourneyScenario {
  const states = new Set<CoreJourneyState>([
    fixture.state === "guest" ? "guest" : "authenticated",
    ...stateFromText(fixture.state),
  ]);
  if (fixture.state === "offline") states.add("offline");

  return scenario({
    id: `workspace:${fixture.id}`,
    archetype: "workspace",
    states: [...states],
    fixture: { collection: "workspace", scenarioId: fixture.id },
    path: fixture.path,
    expectedStatus: 200,
  });
}

function creationScenario(
  fixture: VisualFixtureCreationScenarioEvidence,
): CoreJourneyScenario {
  const states = new Set<CoreJourneyState>([
    "authenticated",
    ...stateFromText(`${fixture.flow} ${fixture.state}`),
  ]);
  if (fixture.state === "unknown-long") states.add("long-text");
  if (fixture.state === "media") states.add("mixed-media");
  if (fixture.state === "privacy") states.add("privacy");
  if (fixture.state === "offline") states.add("offline");
  if (fixture.state === "error") states.add("recoverable-error");
  if (fixture.state === "cancel") states.add("cancelled");

  return scenario({
    id: `creation:${fixture.id}`,
    archetype: "creation",
    states: [...states],
    fixture: { collection: "creation", scenarioId: fixture.id },
    path: fixture.startPath,
    expectedStatus: fixture.expectedStatus,
  });
}

function intentScenario(
  fixture: VisualFixtureIntentScenario,
): CoreJourneyScenario {
  const states = new Set<CoreJourneyState>([
    fixture.state === "already_authenticated" ? "authenticated" : "guest",
    ...stateFromText(fixture.state),
  ]);
  if (fixture.state === "cancel") states.add("cancelled");
  if (fixture.state === "invalid" || fixture.state === "expired") {
    states.add("invalid");
  }

  return scenario({
    id: `intent:${fixture.id}`,
    archetype: "auth-intent",
    states: [...states],
    fixture: { collection: "intent", scenarioId: fixture.id },
    path: fixture.startPath,
    expectedStatus: fixture.expectedStatus,
  });
}

function socialScenario(
  fixture: VisualFixtureSocialScenario,
): CoreJourneyScenario {
  const states = new Set<CoreJourneyState>([
    fixture.actorId ? "authenticated" : "guest",
    ...stateFromText(`${fixture.surface} ${fixture.state}`),
  ]);
  if (fixture.state === "nested-long-moderated") {
    states.add("long-text");
    states.add("moderation");
  }
  if (fixture.state === "blocked") states.add("blocked");
  if (fixture.expectedStatus === 410) states.add("gone");

  return scenario({
    id: `social:${fixture.id}`,
    archetype: "social",
    states: [...states],
    fixture: { collection: "social", scenarioId: fixture.id },
    path: fixture.path,
    expectedStatus: fixture.expectedStatus,
  });
}

function communityScenario(
  fixture: VisualFixtureCommunityScenario,
): CoreJourneyScenario {
  const states = new Set<CoreJourneyState>([
    fixture.actorRole === "guest" ? "guest" : "authenticated",
    ...stateFromText(fixture.state),
  ]);
  if (
    [
      "moderator",
      "pending-report",
      "removed-content",
      "closed-discussion",
      "closed-participation",
    ].includes(fixture.state)
  ) {
    states.add("moderation");
  }
  if (fixture.state === "archived") states.add("archived");
  if (fixture.state === "blocked" || fixture.state === "banned") {
    states.add("blocked");
  }
  if (fixture.expectedStatus === 404) states.add("not-found");

  return scenario({
    id: `community:${fixture.id}`,
    archetype: "community",
    states: [...states],
    fixture: { collection: "community", scenarioId: fixture.id },
    path: fixture.path,
    expectedStatus: fixture.expectedStatus,
  });
}

const mainScenarios = VISUAL_FIXTURE_MANIFEST.scenarios.filter((fixture) =>
  [
    "public-feed",
    "public-catalog",
    "public-journal-directory",
    "public-knowledge",
  ].some((prefix) => fixture.kind.startsWith(prefix)),
);
const shellFixture = VISUAL_FIXTURE_MANIFEST.scenarios.find(
  ({ id }) => id === "ove187-feed-typical",
);

if (!shellFixture) {
  throw new Error("OVE-185 requires the OVE-187 typical feed shell fixture.");
}

export const CORE_JOURNEY_SCENARIOS: readonly CoreJourneyScenario[] = [
  scenario({
    id: "shell:ove187-feed-typical",
    archetype: "shell",
    states: ["typical", "guest"],
    fixture: { collection: "main", scenarioId: shellFixture.id },
    path: shellFixture.path,
    expectedStatus: shellFixture.expectedStatus,
  }),
  ...mainScenarios.map(mainScenario),
  ...VISUAL_FIXTURE_MANIFEST.passportEvidence.scenarios.map(passportScenario),
  ...VISUAL_FIXTURE_MANIFEST.journalEntryEvidence.scenarios.map(
    journalEntryScenario,
  ),
  ...VISUAL_FIXTURE_MANIFEST.profileEvidence.scenarios.map(profileScenario),
  ...VISUAL_FIXTURE_MANIFEST.workspaceEvidence.scenarios.map(workspaceScenario),
  ...VISUAL_FIXTURE_MANIFEST.creationEvidence.scenarios.map(creationScenario),
  ...VISUAL_FIXTURE_MANIFEST.intentEvidence.scenarios.map(intentScenario),
  ...VISUAL_FIXTURE_MANIFEST.socialEvidence.scenarios.map(socialScenario),
  ...VISUAL_FIXTURE_MANIFEST.communityEvidence.scenarios.map(communityScenario),
];

export function browserSafeFixturePath(path: string): string {
  return path.replace(/(^|\/)@/g, "$1%40");
}
