export const LOCALIZATION_RENDERED_OWNER_IDS = [
  "public-shell",
  "public-catalog",
  "public-journal",
  "public-knowledge",
  "public-profile",
  "social-community",
  "trust-auth",
  "workspace",
  "owner-object-lineage",
  "operator",
] as const;

export type LocalizationRenderedOwnerId =
  (typeof LOCALIZATION_RENDERED_OWNER_IDS)[number];

export const LOCALIZATION_REQUIRED_BROWSER_STATES = [
  "dense",
  "long-text",
  "recoverable-error",
  "offline",
  "unauthorized",
  "not-found",
  "gone",
] as const;

export type LocalizationRequiredBrowserState =
  (typeof LOCALIZATION_REQUIRED_BROWSER_STATES)[number];

export type LocalizationBrowserPathTransform =
  | "identity"
  | "community-moderation";

export interface LocalizationOwnerBrowserProbe {
  id: string;
  owner: LocalizationRenderedOwnerId;
  scenarioId: string | null;
  explicitPath?: string;
  pathTransform: LocalizationBrowserPathTransform;
  stateClasses: readonly LocalizationRequiredBrowserState[];
  viewportIds: readonly ["mobile-320", "desktop-1440"];
  expectedStatus?: 200 | 404 | 410;
  runAxe?: boolean;
}

const REQUIRED_VIEWPORTS = ["mobile-320", "desktop-1440"] as const;

export const LOCALIZATION_OWNER_BROWSER_PROBES: readonly LocalizationOwnerBrowserProbe[] =
  [
    {
      id: "public-shell-dense",
      owner: "public-shell",
      scenarioId: "main:ove187-feed-dense",
      pathTransform: "identity",
      stateClasses: ["dense"],
      viewportIds: REQUIRED_VIEWPORTS,
    },
    {
      id: "public-catalog-dense",
      owner: "public-catalog",
      scenarioId: "main:ove187-catalog-page-size-plus-one",
      pathTransform: "identity",
      stateClasses: ["dense"],
      viewportIds: REQUIRED_VIEWPORTS,
    },
    {
      id: "public-catalog-not-found",
      owner: "public-catalog",
      scenarioId: "passport:public-unpublished",
      pathTransform: "identity",
      stateClasses: ["not-found"],
      viewportIds: REQUIRED_VIEWPORTS,
    },
    {
      id: "public-journal-long",
      owner: "public-journal",
      scenarioId: "journal-entry:backdated-long",
      pathTransform: "identity",
      stateClasses: ["long-text"],
      viewportIds: REQUIRED_VIEWPORTS,
    },
    {
      id: "public-journal-gone",
      owner: "public-journal",
      scenarioId: "journal-entry:gone-410",
      pathTransform: "identity",
      stateClasses: ["gone"],
      viewportIds: REQUIRED_VIEWPORTS,
    },
    {
      id: "public-knowledge-error",
      owner: "public-knowledge",
      scenarioId: "main:ove187-knowledge-hub-error",
      pathTransform: "identity",
      stateClasses: ["recoverable-error"],
      viewportIds: REQUIRED_VIEWPORTS,
    },
    {
      id: "public-profile-dense",
      owner: "public-profile",
      scenarioId: "profile:gardener-dense",
      pathTransform: "identity",
      stateClasses: ["dense"],
      viewportIds: REQUIRED_VIEWPORTS,
    },
    {
      id: "social-community-moderation",
      owner: "social-community",
      scenarioId: "community:ove184-community-moderator",
      pathTransform: "identity",
      stateClasses: [],
      viewportIds: REQUIRED_VIEWPORTS,
    },
    {
      id: "trust-auth-intent",
      owner: "trust-auth",
      scenarioId: "intent:ove174-i001",
      pathTransform: "identity",
      stateClasses: [],
      viewportIds: REQUIRED_VIEWPORTS,
    },
    {
      id: "workspace-offline",
      owner: "workspace",
      scenarioId: "workspace:workspace-offline",
      pathTransform: "identity",
      stateClasses: ["offline"],
      viewportIds: REQUIRED_VIEWPORTS,
    },
    {
      id: "owner-object-dense",
      owner: "owner-object-lineage",
      scenarioId: "passport:owner-plant-dense",
      pathTransform: "identity",
      stateClasses: ["dense"],
      viewportIds: REQUIRED_VIEWPORTS,
    },
    {
      id: "operator-moderation",
      owner: "operator",
      scenarioId: "community:ove184-community-moderator",
      pathTransform: "community-moderation",
      stateClasses: [],
      viewportIds: REQUIRED_VIEWPORTS,
      expectedStatus: 200,
      runAxe: true,
    },
    {
      id: "operator-unauthorized",
      owner: "operator",
      scenarioId: null,
      explicitPath: "/admin",
      pathTransform: "identity",
      stateClasses: ["unauthorized"],
      viewportIds: REQUIRED_VIEWPORTS,
      expectedStatus: 200,
      runAxe: true,
    },
  ];
