import type { InterfaceLocale } from "@/lib/interface-localization";
import type {
  InterfaceMarket,
  InterfaceMarketResolutionSource,
} from "@/lib/interface-market";
import type { InterfaceRouteMode } from "@/lib/interface-route-policy";

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

export type LocalizationBrowserMarketCase =
  | "ukraine-uk-zero-control"
  | "bulgaria-bg-exactly-one-control"
  | "bulgaria-ru-exactly-one-control";

export type LocalizationBrowserControlOwnerId =
  | "site-shell-interface-language-control"
  | "raw-lifecycle-interface-language-control";

export interface LocalizationBrowserMarketCasePlan {
  id: LocalizationBrowserMarketCase;
  market: InterfaceMarket;
  locale: InterfaceLocale;
  routeLocale: InterfaceLocale | null;
  countryCode: "UA" | "BG";
  acceptLanguage: string;
  persistedMarket: InterfaceMarket;
  persistedLocale: InterfaceLocale;
  expectedMarketSource: Extract<
    InterfaceMarketResolutionSource,
    "route" | "country"
  >;
  expectedControlCount: 0 | 1;
}

export function resolveLocalizationBrowserMarketCase(
  marketCase: LocalizationBrowserMarketCase,
  routeMode: Exclude<InterfaceRouteMode, "non-ui">,
): LocalizationBrowserMarketCasePlan {
  if (marketCase === "ukraine-uk-zero-control") {
    return {
      id: marketCase,
      market: "ukraine",
      locale: "uk",
      routeLocale: null,
      countryCode: "UA",
      acceptLanguage: "ru",
      persistedMarket: "bulgaria",
      persistedLocale: "ru",
      expectedMarketSource: "country",
      expectedControlCount: 0,
    };
  }

  if (routeMode === "localized-link") {
    const locale =
      marketCase === "bulgaria-bg-exactly-one-control" ? "bg" : "ru";
    return {
      id: marketCase,
      market: "bulgaria",
      locale,
      routeLocale: locale,
      countryCode: "UA",
      acceptLanguage: "ru",
      persistedMarket: "ukraine",
      persistedLocale: locale === "bg" ? "ru" : "bg",
      expectedMarketSource: "route",
      expectedControlCount: 1,
    };
  }

  const locale = marketCase === "bulgaria-bg-exactly-one-control" ? "bg" : "ru";
  return {
    id: marketCase,
    market: "bulgaria",
    locale,
    routeLocale: null,
    countryCode: "BG",
    acceptLanguage: "ru",
    persistedMarket: "ukraine",
    persistedLocale: locale === "bg" ? "uk" : "ru",
    expectedMarketSource: "country",
    expectedControlCount: 1,
  };
}

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
  sourceFiles: readonly string[];
  marketCases: readonly LocalizationBrowserMarketCase[];
  expectedControlCountByMarket: Readonly<Record<InterfaceMarket, 0 | 1>>;
  controlOwnerId: LocalizationBrowserControlOwnerId;
  evidenceStatus: "browser-run-required";
}

export interface LocalizationDownstreamUiGate {
  id: string;
  issue: "OVE-202" | "OVE-206" | "OVE-207";
  requiredStates: readonly string[];
  adapterContract: string;
  status: "downstream-owned-real-ui" | "browser-backed";
  browserScenarioId: string | null;
  proofOwner: "owning-downstream-slice" | "OVE-202" | "OVE-206" | "OVE-207";
  blocksCurrentIssue: false;
}

export const OVE_202_BROWSER_SCENARIO_IDS = [
  "editor-clean-locale-transition",
  "editor-dirty-ime-transition",
  "editor-pending-serialization-transition",
  "inline-upload-in-flight-blocked",
  "inline-upload-resumable-transition",
  "inline-processing-failure-transition",
  "offline-draft-transition",
  "conflict-idempotency-transition",
  "ten-inline-capacity-transition",
  "ukraine-editor-zero-control",
] as const;

export {
  OVE_206_BROWSER_SCENARIO_IDS,
  OVE_206_PRIMARY_BROWSER_SCENARIO_ID,
} from "@/components/garden/journal-block-reorder";

const REQUIRED_VIEWPORTS = ["mobile-320", "desktop-1440"] as const;
const ALL_MARKET_CASES = [
  "ukraine-uk-zero-control",
  "bulgaria-bg-exactly-one-control",
  "bulgaria-ru-exactly-one-control",
] as const;

type BrowserProbeInput = Omit<
  LocalizationOwnerBrowserProbe,
  | "sourceFiles"
  | "marketCases"
  | "expectedControlCountByMarket"
  | "controlOwnerId"
  | "evidenceStatus"
> & {
  sourceFiles?: readonly string[];
  controlOwnerId?: LocalizationBrowserControlOwnerId;
};

function browserProbe(input: BrowserProbeInput): LocalizationOwnerBrowserProbe {
  return {
    ...input,
    sourceFiles: input.sourceFiles ?? [],
    marketCases: ALL_MARKET_CASES,
    expectedControlCountByMarket: { ukraine: 0, bulgaria: 1 },
    controlOwnerId:
      input.controlOwnerId ?? "site-shell-interface-language-control",
    evidenceStatus: "browser-run-required",
  };
}

export const LOCALIZATION_OWNER_BROWSER_PROBES: readonly LocalizationOwnerBrowserProbe[] =
  [
    browserProbe({
      id: "public-shell-dense",
      owner: "public-shell",
      scenarioId: "main:ove187-feed-dense",
      pathTransform: "identity",
      stateClasses: ["dense"],
      viewportIds: REQUIRED_VIEWPORTS,
    }),
    browserProbe({
      id: "public-catalog-dense",
      owner: "public-catalog",
      scenarioId: "main:ove187-catalog-page-size-plus-one",
      pathTransform: "identity",
      stateClasses: ["dense"],
      viewportIds: REQUIRED_VIEWPORTS,
    }),
    browserProbe({
      id: "public-journal-long",
      owner: "public-journal",
      scenarioId: "journal-entry:backdated-long",
      pathTransform: "identity",
      stateClasses: ["long-text"],
      viewportIds: REQUIRED_VIEWPORTS,
    }),
    browserProbe({
      id: "public-knowledge-error",
      owner: "public-knowledge",
      scenarioId: "main:ove187-knowledge-hub-error",
      pathTransform: "identity",
      stateClasses: ["recoverable-error"],
      viewportIds: REQUIRED_VIEWPORTS,
    }),
    browserProbe({
      id: "public-profile-dense",
      owner: "public-profile",
      scenarioId: "profile:gardener-dense",
      pathTransform: "identity",
      stateClasses: ["dense"],
      viewportIds: REQUIRED_VIEWPORTS,
    }),
    browserProbe({
      id: "social-community-moderation",
      owner: "social-community",
      scenarioId: "community:ove184-community-moderator",
      pathTransform: "identity",
      stateClasses: [],
      viewportIds: REQUIRED_VIEWPORTS,
    }),
    browserProbe({
      id: "trust-auth-intent",
      owner: "trust-auth",
      scenarioId: null,
      explicitPath: "/auth/help",
      pathTransform: "identity",
      stateClasses: [],
      viewportIds: REQUIRED_VIEWPORTS,
    }),
    browserProbe({
      id: "workspace-offline",
      owner: "workspace",
      scenarioId: "workspace:workspace-offline",
      pathTransform: "identity",
      stateClasses: ["offline"],
      viewportIds: REQUIRED_VIEWPORTS,
    }),
    browserProbe({
      id: "owner-object-dense",
      owner: "owner-object-lineage",
      scenarioId: "passport:owner-plant-dense",
      pathTransform: "identity",
      stateClasses: ["dense"],
      viewportIds: REQUIRED_VIEWPORTS,
    }),
    browserProbe({
      id: "operator-moderation",
      owner: "operator",
      scenarioId: "community:ove184-community-moderator",
      pathTransform: "community-moderation",
      stateClasses: [],
      viewportIds: REQUIRED_VIEWPORTS,
      expectedStatus: 200,
      runAxe: true,
    }),
    browserProbe({
      id: "operator-unauthorized",
      owner: "operator",
      scenarioId: null,
      explicitPath: "/admin",
      pathTransform: "identity",
      stateClasses: ["unauthorized"],
      viewportIds: REQUIRED_VIEWPORTS,
      expectedStatus: 200,
      runAxe: true,
    }),
    browserProbe({
      id: "raw-community-not-found",
      owner: "social-community",
      scenarioId: "community:ove184-community-unavailable",
      pathTransform: "identity",
      stateClasses: ["not-found"],
      viewportIds: REQUIRED_VIEWPORTS,
      expectedStatus: 404,
      runAxe: true,
      sourceFiles: ["src/lib/public-community-lifecycle.ts"],
      controlOwnerId: "raw-lifecycle-interface-language-control",
    }),
    browserProbe({
      id: "raw-profile-not-found",
      owner: "public-profile",
      scenarioId: "profile:removed-unavailable",
      pathTransform: "identity",
      stateClasses: ["not-found"],
      viewportIds: REQUIRED_VIEWPORTS,
      expectedStatus: 404,
      runAxe: true,
      sourceFiles: ["src/lib/public-profile-lifecycle.ts"],
      controlOwnerId: "raw-lifecycle-interface-language-control",
    }),
    browserProbe({
      id: "raw-object-not-found",
      owner: "public-catalog",
      scenarioId: "passport:public-unpublished",
      pathTransform: "identity",
      stateClasses: ["not-found"],
      viewportIds: REQUIRED_VIEWPORTS,
      expectedStatus: 404,
      runAxe: true,
      sourceFiles: ["src/lib/public-object-passport-lifecycle.ts"],
      controlOwnerId: "raw-lifecycle-interface-language-control",
    }),
    browserProbe({
      id: "raw-journal-gone",
      owner: "public-journal",
      scenarioId: "journal-entry:gone-410",
      pathTransform: "identity",
      stateClasses: ["gone"],
      viewportIds: REQUIRED_VIEWPORTS,
      expectedStatus: 410,
      runAxe: true,
      sourceFiles: ["src/lib/public-journal-entry-lifecycle.ts"],
      controlOwnerId: "raw-lifecycle-interface-language-control",
    }),
  ];

export const LOCALIZATION_DOWNSTREAM_UI_PROOF_REQUIREMENTS = [
  {
    id: "structured-editor-and-inline-photos",
    issue: "OVE-202",
    requiredStates: [
      "editorjs-structured-editor",
      "cyrillic-ime-composition",
      "lossless-editor-serialization",
      "ten-inline-photos",
      "inline-photo-upload-in-flight",
      "save-conflict",
      "offline-recovery",
      "locale-transition-failed-flush",
    ],
  },
  {
    id: "accessible-block-reorder",
    issue: "OVE-206",
    requiredStates: [
      "pointer-block-reorder",
      "touch-block-reorder",
      "keyboard-block-reorder",
      "locale-transition-blocked-during-active-gesture",
      "committed-order-serialization",
      "focus-restoration",
      "reorder-announcement",
      "locale-transition-after-committed-reorder",
    ],
  },
  {
    id: "separate-cover",
    issue: "OVE-207",
    requiredStates: [
      "automatic-cover-selection",
      "explicit-inline-cover-selection",
      "separate-cover-upload",
      "cover-upload-in-flight",
      "separate-cover-upload-failure-retry",
      "selected-image-removal",
      "ten-inline-plus-one-cover",
      "locale-transition-with-cover",
    ],
  },
] as const satisfies ReadonlyArray<
  Pick<LocalizationDownstreamUiGate, "id" | "issue" | "requiredStates">
>;

export const LOCALIZATION_DOWNSTREAM_UI_GATES: readonly LocalizationDownstreamUiGate[] =
  LOCALIZATION_DOWNSTREAM_UI_PROOF_REQUIREMENTS.map((requirement) => {
    const base = {
      id: requirement.id,
      issue: requirement.issue,
      requiredStates: requirement.requiredStates,
      adapterContract: "owner-composer-drafts" as const,
      blocksCurrentIssue: false as const,
    };
    if (requirement.issue === "OVE-202") {
      return {
        ...base,
        status: "browser-backed" as const,
        browserScenarioId: "editor-clean-locale-transition",
        proofOwner: "OVE-202" as const,
      };
    }
    if (requirement.issue === "OVE-206") {
      return {
        ...base,
        status: "browser-backed" as const,
        browserScenarioId: "pointer-commit-immediate-transition",
        proofOwner: "OVE-206" as const,
      };
    }
    if (requirement.issue === "OVE-207") {
      return {
        ...base,
        status: "browser-backed" as const,
        browserScenarioId: "locale-transition-with-cover",
        proofOwner: "OVE-207" as const,
      };
    }
    return {
      ...base,
      status: "downstream-owned-real-ui" as const,
      browserScenarioId: null,
      proofOwner: "owning-downstream-slice" as const,
    };
  });
