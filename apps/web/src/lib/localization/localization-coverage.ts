import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

import {
  CORE_JOURNEY_REQUIRED_STATES,
  CORE_JOURNEY_SCENARIOS,
  type CoreJourneyScenario,
} from "@/lib/accessibility/core-journey-matrix";
import {
  LOCALIZATION_OWNER_BROWSER_PROBES,
  LOCALIZATION_DOWNSTREAM_UI_GATES,
  LOCALIZATION_DOWNSTREAM_UI_PROOF_REQUIREMENTS,
  LOCALIZATION_RENDERED_OWNER_IDS,
  LOCALIZATION_REQUIRED_BROWSER_STATES,
  type LocalizationDownstreamUiGate,
  type LocalizationOwnerBrowserProbe,
  type LocalizationRenderedOwnerId,
} from "@/lib/localization/localization-browser-matrix";
import {
  DEFAULT_INTERFACE_MARKET,
  INTERFACE_MARKET_CONFIG,
  INTERFACE_MARKETS,
  type InterfaceMarket,
  type InterfaceMarketResolutionSource,
} from "@/lib/interface-market";
import {
  getInterfaceRoutePolicy,
  INTERFACE_ROUTE_POLICIES,
  type InterfaceRouteMode,
} from "@/lib/interface-route-policy";
import { getCommunityCopy } from "@/lib/community-copy";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import { getStructuredJournalComposerLabels } from "@/lib/structured-journal-composer-copy";
import { getOwnerMediaFocalPanelCopy } from "@/lib/media/owner-media-focal-copy";
import { getLocalizedCoarseRegionOptions } from "@/lib/garden/regions";
import { getInterfaceCopy } from "@/lib/interface-localization";
import { getLivingObjectPassportCopy } from "@/lib/living-object-passport";
import { getOperatorCopy } from "@/lib/operator-copy";
import { getOperatorCurationCopy } from "@/lib/operator-curation-copy";
import { getOperatorErasureCopy } from "@/lib/operator-erasure-copy";
import { getOperatorPilotCopy } from "@/lib/operator-pilot-copy";
import { getOperatorSmokeCopy } from "@/lib/operator-smoke-copy";
import { getOwnerLineageCopy } from "@/lib/owner-lineage-copy";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";
import { getPublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import { getPublicJournalEntryCopy } from "@/lib/public-journal-entry-copy";
import { getPublicKnowledgeCopy } from "@/lib/public-knowledge-copy";
import { getPublicObjectCatalogCopy } from "@/lib/public-object-catalog-copy";
import { getPublicProfileCopy } from "@/lib/public-profile-copy";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import { PUBLIC_LOCALES, type PublicLocale } from "@/lib/public-localization";
import { getSocialSurfaceCopy } from "@/lib/social-surface-copy";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import {
  getLocalizedHomeContent,
  getLocalizedRouteChrome,
} from "@/server/public-localized-content";
import {
  VISUAL_FIXTURE_MANIFEST,
  VISUAL_FIXTURE_MANIFEST_HASH,
} from "@/lib/visual-fixtures/manifest";

export type LocalizationRouteClassification =
  | "public-localized"
  | "signed-in-selected-locale"
  | "explicit-operator-locale"
  | "redirect-only"
  | "api-non-ui"
  | "internal-fixture";

export type LocalizationOwnerId =
  | LocalizationRenderedOwnerId
  | "internal-fixture"
  | "non-ui";

export const LOCALIZATION_SURFACE_KINDS = [
  "page",
  "route-handler",
  "layout",
  "loading",
  "error",
  "not-found",
  "global-error",
  "raw-lifecycle",
] as const;

export type LocalizationSurfaceKind =
  (typeof LOCALIZATION_SURFACE_KINDS)[number];

export type LocalizationRoutePolicyResolution =
  | "exact-source-path"
  | "current-request-path";

export type LocalizationControlOwnerId =
  | "site-shell-interface-language-control"
  | "raw-lifecycle-interface-language-control";

export type LocalizationDirtyPolicyId =
  | "shared-locale-change-coordinator"
  | "terminal-state-no-dirty-work";

export interface LocalizationRegisteredRenderedProfile {
  marketProfileId: "market-first-ove205";
  marketSources: readonly InterfaceMarketResolutionSource[];
  fallbackMarket: InterfaceMarket;
  allowedLocalesByMarket: Readonly<
    Record<InterfaceMarket, readonly PublicLocale[]>
  >;
  defaultLocaleByMarket: Readonly<Record<InterfaceMarket, PublicLocale>>;
  routePolicyResolution: LocalizationRoutePolicyResolution;
  routePolicyProbePath: string | null;
  routePolicyId: string | "central-policy-for-current-request-path";
  switchMode: InterfaceRouteMode | "current-request-path";
  safeQueryKeys: readonly string[] | "central-policy-for-current-request-path";
  preserveClientFragment: boolean | "central-policy-for-current-request-path";
  ukraineControl: {
    expectedCount: 0;
    ownerId: null;
  };
  bulgariaControl: {
    expectedCount: 1;
    ownerId: LocalizationControlOwnerId;
  };
  dirtyPolicyId: LocalizationDirtyPolicyId;
  dirtyParticipantIds: readonly string[];
  authVariants: readonly string[];
  roleVariants: readonly string[];
  failureVariants: readonly string[];
  rawVariants: readonly string[];
  browserScenarioIds: readonly string[];
}

export interface LocalizationRouteRegistration {
  sourceFile: string;
  routePattern: string;
  surfaceKind: LocalizationSurfaceKind;
  classification: LocalizationRouteClassification;
  owner: LocalizationOwnerId;
  renderedProfile: LocalizationRegisteredRenderedProfile | null;
}

interface LocalizationOwnerContract {
  rendered: boolean;
  authVariants: readonly string[];
  roleVariants: readonly string[];
  stateClasses: readonly string[];
  copyNamespaces: readonly string[];
  scenarioIds: readonly string[];
  focusedTests: readonly string[];
}

export interface LocalizationCopyNamespace {
  id: string;
  sourceFile: string;
  load: (locale: PublicLocale) => unknown;
}

export type LocalizationLiteralKind =
  | "jsx-text"
  | "jsx-expression"
  | "aria-label"
  | "aria-description"
  | "title"
  | "placeholder"
  | "alt"
  | "metadata-title"
  | "metadata-description";

export type LocalizationAllowlistReason =
  | "brand"
  | "provider-name"
  | "scientific-name"
  | "catalog-content"
  | "user-content"
  | "url-or-identifier"
  | "diagnostic"
  | "internal-fixture";

export interface LocalizationLiteralAllowlistEntry {
  sourceFile: string;
  kind: LocalizationLiteralKind;
  value: string;
  reason: LocalizationAllowlistReason;
  rationale: string;
}

export interface LocalizationAuthoredSource {
  sourceFile: string;
  source: string;
}

export type LocalizationCoverageDisposition =
  | "preserved-baseline"
  | "ove171-closed-delta"
  | "ove205-corrective-delta";

export interface LocalizationClosedDelta {
  id: string;
  owner: LocalizationRenderedOwnerId;
  sourceFiles: readonly string[];
  proof: string;
}

const REQUIRED_DECLARED_STATES = [
  "success",
  "validation",
  "unauthorized",
  "archived",
  "dialog",
  "menu",
  "tooltip",
  "toast",
] as const;

const REQUIRED_SURFACE_KINDS: readonly LocalizationSurfaceKind[] = [
  "page",
  "route-handler",
  "layout",
  "loading",
  "error",
  "not-found",
  "global-error",
  "raw-lifecycle",
];

const OVE205_MARKET_SOURCES = [
  "route",
  "country",
  "persisted",
  "fallback",
] as const satisfies readonly InterfaceMarketResolutionSource[];

const RAW_LIFECYCLE_RENDERER_MODULES = [
  "src/lib/public-community-lifecycle.ts",
  "src/lib/public-profile-lifecycle.ts",
  "src/lib/public-object-passport-lifecycle.ts",
  "src/lib/public-journal-entry-lifecycle.ts",
] as const;

const RAW_LIFECYCLE_SUPPORT_MODULES = [
  "src/lib/public-lifecycle-document.ts",
] as const;

const OVE205_EXPECTED_NEW_APP_MODULES = [
  "src/app/api/interface/context/route.ts",
  "src/app/api/interface/locale/route.ts",
  "src/app/global-error.tsx",
] as const;

const OVE171_NEWLY_CLOSED_ROUTE_MODULES = new Set([
  "src/app/[locale]/answers/[slug]/page.tsx",
  "src/app/[locale]/blog/[slug]/page.tsx",
  "src/app/[locale]/blog/page.tsx",
  "src/app/[locale]/guides/[slug]/page.tsx",
  "src/app/[locale]/journal/[slug]/page.tsx",
  "src/app/[locale]/markets/[market]/page.tsx",
  "src/app/[locale]/topics/[slug]/page.tsx",
  "src/app/garden/page.tsx",
  "src/app/garden/profile/page.tsx",
  "src/app/lineage/objects/[objectId]/page.tsx",
]);

const OVE171_CLOSED_DELTAS: readonly LocalizationClosedDelta[] = [
  {
    id: "fallback-and-missing-route-metadata",
    owner: "public-shell",
    sourceFiles: [
      "src/app/layout.tsx",
      "src/app/[locale]/answers/[slug]/page.tsx",
      "src/app/[locale]/blog/[slug]/page.tsx",
      "src/app/[locale]/blog/page.tsx",
      "src/app/[locale]/guides/[slug]/page.tsx",
      "src/app/[locale]/journal/[slug]/page.tsx",
      "src/app/[locale]/markets/[market]/page.tsx",
      "src/app/[locale]/topics/[slug]/page.tsx",
    ],
    proof: "localized metadata tests plus authored-copy AST gate",
  },
  {
    id: "workspace-wishlist-and-profile-copy",
    owner: "workspace",
    sourceFiles: [
      "src/app/garden/page.tsx",
      "src/app/garden/profile/page.tsx",
      "src/lib/garden-workspace-copy.ts",
    ],
    proof: "exact locale-key parity and route regression tests",
  },
  {
    id: "lineage-write-boundary-copy",
    owner: "owner-object-lineage",
    sourceFiles: ["src/app/lineage/objects/[objectId]/page.tsx"],
    proof: "focused localized lineage route test",
  },
  {
    id: "public-catalog-accessibility-copy",
    owner: "public-catalog",
    sourceFiles: [
      "src/components/public/public-object-catalog.tsx",
      "src/lib/public-object-catalog-copy.ts",
    ],
    proof: "typed copy parity and browser accessibility matrix",
  },
  {
    id: "sheet-close-accessible-name",
    owner: "public-shell",
    sourceFiles: ["src/components/ui/sheet.tsx"],
    proof: "typed required label and keyboard browser proof",
  },
  {
    id: "owner-and-edge-browser-proof",
    owner: "operator",
    sourceFiles: [
      "src/lib/localization/localization-browser-matrix.ts",
      "scripts/verify-responsive-accessibility.ts",
    ],
    proof: `${LOCALIZATION_OWNER_BROWSER_PROBES.length} fail-closed probes at 320px and 1440px`,
  },
];

const OVE205_CORRECTIVE_DELTAS: readonly LocalizationClosedDelta[] = [
  {
    id: "market-first-central-policy",
    owner: "public-shell",
    sourceFiles: [
      "src/lib/interface-market.ts",
      "src/lib/interface-route-policy.ts",
      "src/app/api/interface/context/route.ts",
      "src/app/api/interface/locale/route.ts",
    ],
    proof:
      "central market and route-policy IDs plus non-UI preference/context endpoints",
  },
  {
    id: "complete-rendered-state-discovery",
    owner: "public-shell",
    sourceFiles: [
      "src/app/layout.tsx",
      "src/app/loading.tsx",
      "src/app/error.tsx",
      "src/app/not-found.tsx",
      "src/app/global-error.tsx",
    ],
    proof:
      "schema-v3 exact page/layout/loading/error/not-found/global-error inventory",
  },
  {
    id: "raw-lifecycle-renderer-coverage",
    owner: "public-shell",
    sourceFiles: [
      ...RAW_LIFECYCLE_RENDERER_MODULES,
      ...RAW_LIFECYCLE_SUPPORT_MODULES,
    ],
    proof:
      "four explicit raw HTML lifecycle registrations and dedicated browser contracts",
  },
  {
    id: "market-control-and-dirty-profiles",
    owner: "workspace",
    sourceFiles: [
      "src/lib/interface-locale-change-coordinator.ts",
      "src/lib/localization/localization-browser-matrix.ts",
    ],
    proof:
      "UA zero-control, BG exactly-one control, central switch policy, and shared dirty coordinator profiles",
  },
];

const LOCALIZATION_OWNER_CONTRACTS: Record<
  LocalizationOwnerId,
  LocalizationOwnerContract
> = {
  "public-shell": {
    rendered: true,
    authVariants: ["guest", "authenticated"],
    roleVariants: ["reader", "gardener"],
    stateClasses: [
      "loading",
      "empty",
      "dense",
      "pagination",
      "recoverable-error",
    ],
    copyNamespaces: [
      "interface",
      "public-surface",
      "public-home",
      "public-route-chrome",
    ],
    scenarioIds: ["shell:ove187-feed-typical", "main:ove187-feed-dense"],
    focusedTests: ["src/app/page.test.tsx"],
  },
  "public-catalog": {
    rendered: true,
    authVariants: ["guest", "authenticated"],
    roleVariants: ["reader", "gardener"],
    stateClasses: [
      "empty",
      "dense",
      "no-media",
      "pagination",
      "not-found",
      "gone",
    ],
    copyNamespaces: ["public-object-catalog", "living-object-passport"],
    scenarioIds: [
      "main:ove187-catalog-page-size-plus-one",
      "passport:public-plant-dense",
    ],
    focusedTests: ["src/app/objects/page.test.tsx"],
  },
  "public-journal": {
    rendered: true,
    authVariants: ["guest", "authenticated"],
    roleVariants: ["reader", "gardener"],
    stateClasses: [
      "empty",
      "dense",
      "long-text",
      "mixed-media",
      "pagination",
      "not-found",
      "gone",
    ],
    copyNamespaces: ["public-journal-directory", "public-journal-entry"],
    scenarioIds: [
      "main:ove187-journal-directory-plus-one",
      "journal-entry:recent-mixed-gallery",
    ],
    focusedTests: ["src/app/journals/page.test.tsx"],
  },
  "public-knowledge": {
    rendered: true,
    authVariants: ["guest", "authenticated"],
    roleVariants: ["reader", "gardener"],
    stateClasses: [
      "empty",
      "dense",
      "long-text",
      "loading",
      "recoverable-error",
      "not-found",
    ],
    copyNamespaces: ["public-knowledge", "public-route-chrome"],
    scenarioIds: [
      "main:ove187-knowledge-guide-dense",
      "main:ove187-knowledge-answer-long",
    ],
    focusedTests: ["src/app/knowledge/page.test.tsx"],
  },
  "public-profile": {
    rendered: true,
    authVariants: ["guest", "authenticated"],
    roleVariants: ["reader", "gardener", "owner"],
    stateClasses: ["empty", "dense", "long-text", "no-media", "not-found"],
    copyNamespaces: ["public-profile"],
    scenarioIds: ["profile:gardener-dense", "profile:long-fields"],
    focusedTests: ["src/app/[locale]/[profileHandle]/page.test.tsx"],
  },
  "social-community": {
    rendered: true,
    authVariants: ["guest", "authenticated"],
    roleVariants: ["reader", "member", "moderator"],
    stateClasses: [
      "empty",
      "dense",
      "moderation",
      "blocked",
      "archived",
      "menu",
      "toast",
    ],
    copyNamespaces: ["social-surface", "community"],
    scenarioIds: ["social:comments-dense", "community:ove184-community-dense"],
    focusedTests: ["src/app/communities/page.test.tsx"],
  },
  "trust-auth": {
    rendered: true,
    authVariants: ["guest", "authenticated", "return-after-auth"],
    roleVariants: ["reader", "gardener"],
    stateClasses: ["validation", "success", "unauthorized", "dialog", "toast"],
    copyNamespaces: ["trust-surface", "interface"],
    scenarioIds: ["intent:ove174-i001", "intent:ove174-i007"],
    focusedTests: ["src/app/auth/intent/page.test.tsx"],
  },
  workspace: {
    rendered: true,
    authVariants: ["guest-handoff", "authenticated"],
    roleVariants: ["owner", "collaborator"],
    stateClasses: [
      "empty",
      "dense",
      "loading",
      "offline",
      "recoverable-error",
      "success",
      "validation",
      "dialog",
      "toast",
    ],
    copyNamespaces: [
      "garden-workspace",
      "garden-regions",
      "public-profile",
      "structured-journal-composer",
    ],
    scenarioIds: ["workspace:workspace-dense", "workspace:workspace-offline"],
    focusedTests: ["src/app/garden/page.test.tsx"],
  },
  "owner-object-lineage": {
    rendered: true,
    authVariants: ["guest-handoff", "authenticated"],
    roleVariants: ["owner", "claimant"],
    stateClasses: [
      "validation",
      "success",
      "unauthorized",
      "archived",
      "not-found",
      "gone",
      "dialog",
      "tooltip",
      "toast",
    ],
    copyNamespaces: ["owner-object", "owner-lineage", "living-object-passport"],
    scenarioIds: [
      "passport:owner-plant-dense",
      "creation:ove182-c005",
      "intent:ove174-i004",
    ],
    focusedTests: ["src/app/lineage/objects/[objectId]/page.test.tsx"],
  },
  operator: {
    rendered: true,
    authVariants: ["authenticated"],
    roleVariants: ["admin", "curator", "pilot-operator"],
    stateClasses: [
      "empty",
      "dense",
      "validation",
      "success",
      "unauthorized",
      "recoverable-error",
      "dialog",
      "menu",
      "tooltip",
      "toast",
    ],
    copyNamespaces: [
      "operator",
      "operator-pilot",
      "operator-smoke",
      "operator-erasure",
      "operator-curation",
    ],
    scenarioIds: ["community:ove184-community-moderator"],
    focusedTests: [
      "src/app/admin/page.test.tsx",
      "src/app/garden/catalog/curation/page.test.tsx",
    ],
  },
  "internal-fixture": {
    rendered: false,
    authVariants: ["isolated-fixture"],
    roleVariants: ["test-operator"],
    stateClasses: ["diagnostic"],
    copyNamespaces: [],
    scenarioIds: [],
    focusedTests: ["src/lib/visual-fixtures/manifest.test.ts"],
  },
  "non-ui": {
    rendered: false,
    authVariants: [],
    roleVariants: [],
    stateClasses: [],
    copyNamespaces: [],
    scenarioIds: [],
    focusedTests: [],
  },
};

export const LOCALIZATION_COPY_NAMESPACES: readonly LocalizationCopyNamespace[] =
  [
    {
      id: "interface",
      sourceFile: "src/lib/interface-localization.ts",
      load: getInterfaceCopy,
    },
    {
      id: "public-surface",
      sourceFile: "src/lib/public-surface-localization.ts",
      load: getPublicSurfaceCopy,
    },
    {
      id: "public-object-catalog",
      sourceFile: "src/lib/public-object-catalog-copy.ts",
      load: getPublicObjectCatalogCopy,
    },
    {
      id: "public-journal-directory",
      sourceFile: "src/lib/public-journal-directory-copy.ts",
      load: getPublicJournalDirectoryCopy,
    },
    {
      id: "public-journal-entry",
      sourceFile: "src/lib/public-journal-entry-copy.ts",
      load: getPublicJournalEntryCopy,
    },
    {
      id: "public-knowledge",
      sourceFile: "src/lib/public-knowledge-copy.ts",
      load: getPublicKnowledgeCopy,
    },
    {
      id: "public-profile",
      sourceFile: "src/lib/public-profile-copy.ts",
      load: getPublicProfileCopy,
    },
    {
      id: "social-surface",
      sourceFile: "src/lib/social-surface-copy.ts",
      load: getSocialSurfaceCopy,
    },
    {
      id: "community",
      sourceFile: "src/lib/community-copy.ts",
      load: getCommunityCopy,
    },
    {
      id: "trust-surface",
      sourceFile: "src/lib/trust-surface-copy.ts",
      load: getTrustSurfaceCopy,
    },
    {
      id: "garden-workspace",
      sourceFile: "src/lib/garden-workspace-copy.ts",
      load: getGardenWorkspaceCopy,
    },
    {
      id: "structured-journal-composer",
      sourceFile: "src/lib/structured-journal-composer-copy.ts",
      load: getStructuredJournalComposerLabels,
    },
    {
      id: "owner-media-focal",
      sourceFile: "src/lib/media/owner-media-focal-copy.ts",
      load: getOwnerMediaFocalPanelCopy,
    },
    {
      id: "garden-regions",
      sourceFile: "src/lib/garden/regions.ts",
      load: getLocalizedCoarseRegionOptions,
    },
    {
      id: "owner-object",
      sourceFile: "src/lib/owner-object-copy.ts",
      load: getOwnerObjectCopy,
    },
    {
      id: "owner-lineage",
      sourceFile: "src/lib/owner-lineage-copy.ts",
      load: getOwnerLineageCopy,
    },
    {
      id: "living-object-passport",
      sourceFile: "src/lib/living-object-passport.ts",
      load: getLivingObjectPassportCopy,
    },
    {
      id: "operator",
      sourceFile: "src/lib/operator-copy.ts",
      load: getOperatorCopy,
    },
    {
      id: "operator-pilot",
      sourceFile: "src/lib/operator-pilot-copy.ts",
      load: getOperatorPilotCopy,
    },
    {
      id: "operator-smoke",
      sourceFile: "src/lib/operator-smoke-copy.ts",
      load: getOperatorSmokeCopy,
    },
    {
      id: "operator-erasure",
      sourceFile: "src/lib/operator-erasure-copy.ts",
      load: getOperatorErasureCopy,
    },
    {
      id: "operator-curation",
      sourceFile: "src/lib/operator-curation-copy.ts",
      load: getOperatorCurationCopy,
    },
    {
      id: "public-home",
      sourceFile: "src/server/public-localized-content.ts",
      load: getLocalizedHomeContent,
    },
    {
      id: "public-route-chrome",
      sourceFile: "src/server/public-localized-content.ts",
      load: getLocalizedRouteChrome,
    },
  ] as const;

const RENDERED_CLASSIFICATIONS = new Set<LocalizationRouteClassification>([
  "public-localized",
  "signed-in-selected-locale",
  "explicit-operator-locale",
]);

interface LocalizationRegistrationOptions {
  routePattern?: string;
  routePolicyResolution?: LocalizationRoutePolicyResolution;
  routePolicyProbePath?: string;
  failureVariants?: readonly string[];
  rawVariants?: readonly string[];
  dirtyPolicyId?: LocalizationDirtyPolicyId;
  dirtyParticipantIds?: readonly string[];
  browserScenarioIds?: readonly string[];
}

function inferLocalizationSurfaceKind(
  sourceFile: string,
): LocalizationSurfaceKind {
  if (
    RAW_LIFECYCLE_RENDERER_MODULES.includes(sourceFile as never) ||
    (sourceFile.startsWith("src/lib/") && sourceFile.endsWith("-lifecycle.ts"))
  ) {
    return "raw-lifecycle";
  }
  if (sourceFile.endsWith("/page.tsx")) return "page";
  if (sourceFile.endsWith("/route.ts")) return "route-handler";
  if (sourceFile.endsWith("/layout.tsx")) return "layout";
  if (sourceFile.endsWith("/loading.tsx")) return "loading";
  if (sourceFile.endsWith("/global-error.tsx")) return "global-error";
  if (sourceFile.endsWith("/error.tsx")) return "error";
  if (sourceFile.endsWith("/not-found.tsx")) return "not-found";
  throw new Error(`Unsupported localization surface: ${sourceFile}`);
}

function routePatternFromSource(sourceFile: string) {
  if (!sourceFile.startsWith("src/app/")) return "/";
  return (
    sourceFile
      .replace(/^src\/app/, "")
      .replace(
        /\/(?:page|route|layout|loading|error|not-found|global-error)\.(?:tsx|ts)$/,
        "",
      )
      .replaceAll("%5F", "_") || "/"
  );
}

function routePolicyProbePath(
  routePattern: string,
  owner: LocalizationOwnerId,
) {
  let probePath = routePattern.replace(/^\/\[locale\](?=\/|$)/, "") || "/";
  if (owner === "public-profile" && probePath.includes("[profileHandle]")) {
    probePath = probePath.replace("[profileHandle]", "@coverage_profile");
  }
  return probePath.replace(/\[[^/]+\]/g, "coverage");
}

function failureVariantsFor(
  surfaceKind: LocalizationSurfaceKind,
  owner: LocalizationOwnerId,
) {
  if (surfaceKind === "loading") return ["loading"];
  if (surfaceKind === "error") return ["recoverable-error"];
  if (surfaceKind === "not-found") return ["not-found"];
  if (surfaceKind === "global-error") return ["global-error"];
  if (surfaceKind === "raw-lifecycle") return ["not-found", "gone"];
  return LOCALIZATION_OWNER_CONTRACTS[owner].stateClasses.filter((state) =>
    /error|unauthorized|not-found|gone|archived|blocked|validation/.test(state),
  );
}

function renderedProfileFor(
  sourceFile: string,
  routePattern: string,
  surfaceKind: LocalizationSurfaceKind,
  classification: LocalizationRouteClassification,
  owner: LocalizationOwnerId,
  options: LocalizationRegistrationOptions,
): LocalizationRegisteredRenderedProfile | null {
  if (!RENDERED_CLASSIFICATIONS.has(classification)) return null;

  const policyResolution = options.routePolicyResolution ?? "exact-source-path";
  const probePath =
    policyResolution === "exact-source-path"
      ? (options.routePolicyProbePath ??
        routePolicyProbePath(routePattern, owner))
      : null;
  const policy = probePath ? getInterfaceRoutePolicy(probePath) : null;
  const terminalState = [
    "loading",
    "error",
    "not-found",
    "global-error",
    "raw-lifecycle",
  ].includes(surfaceKind);
  const dirtyPolicyId =
    options.dirtyPolicyId ??
    (terminalState
      ? "terminal-state-no-dirty-work"
      : "shared-locale-change-coordinator");
  const dirtyParticipantIds =
    options.dirtyParticipantIds ??
    (dirtyPolicyId === "shared-locale-change-coordinator" &&
    (owner === "workspace" || owner === "owner-object-lineage")
      ? ["owner-composer-drafts"]
      : []);

  return {
    marketProfileId: "market-first-ove205",
    marketSources: OVE205_MARKET_SOURCES,
    fallbackMarket: DEFAULT_INTERFACE_MARKET,
    allowedLocalesByMarket: {
      ukraine: INTERFACE_MARKET_CONFIG.ukraine.allowedLocales,
      bulgaria: INTERFACE_MARKET_CONFIG.bulgaria.allowedLocales,
    },
    defaultLocaleByMarket: {
      ukraine: INTERFACE_MARKET_CONFIG.ukraine.defaultLocale,
      bulgaria: INTERFACE_MARKET_CONFIG.bulgaria.defaultLocale,
    },
    routePolicyResolution: policyResolution,
    routePolicyProbePath: probePath,
    routePolicyId: policy?.id ?? "central-policy-for-current-request-path",
    switchMode: policy?.mode ?? "current-request-path",
    safeQueryKeys:
      policy?.safeQueryKeys ?? "central-policy-for-current-request-path",
    preserveClientFragment:
      policy?.preserveClientFragment ??
      "central-policy-for-current-request-path",
    ukraineControl: { expectedCount: 0, ownerId: null },
    bulgariaControl: {
      expectedCount: 1,
      ownerId:
        surfaceKind === "raw-lifecycle"
          ? "raw-lifecycle-interface-language-control"
          : "site-shell-interface-language-control",
    },
    dirtyPolicyId,
    dirtyParticipantIds,
    authVariants: LOCALIZATION_OWNER_CONTRACTS[owner].authVariants,
    roleVariants: LOCALIZATION_OWNER_CONTRACTS[owner].roleVariants,
    failureVariants:
      options.failureVariants ?? failureVariantsFor(surfaceKind, owner),
    rawVariants:
      options.rawVariants ??
      (surfaceKind === "raw-lifecycle" ? [sourceFile] : ["react-rendered"]),
    browserScenarioIds:
      options.browserScenarioIds ??
      LOCALIZATION_OWNER_CONTRACTS[owner].scenarioIds,
  };
}

function route(
  sourceFile: string,
  classification: LocalizationRouteClassification,
  owner: LocalizationOwnerId,
  options: LocalizationRegistrationOptions = {},
): LocalizationRouteRegistration {
  const surfaceKind = inferLocalizationSurfaceKind(sourceFile);
  const routePattern =
    options.routePattern ?? routePatternFromSource(sourceFile);
  return {
    sourceFile,
    routePattern,
    surfaceKind,
    classification,
    owner,
    renderedProfile: renderedProfileFor(
      sourceFile,
      routePattern,
      surfaceKind,
      classification,
      owner,
      options,
    ),
  };
}

function routes(
  sourceFiles: readonly string[],
  classification: LocalizationRouteClassification,
  owner: LocalizationOwnerId,
  options: LocalizationRegistrationOptions = {},
) {
  return sourceFiles.map((sourceFile) =>
    route(sourceFile, classification, owner, options),
  );
}

export const LOCALIZATION_ROUTE_REGISTRY: readonly LocalizationRouteRegistration[] =
  [
    ...routes(
      [
        "src/app/%5F%5Fvisual-fixtures/intent/[scenarioId]/route.ts",
        "src/app/%5F%5Fvisual-fixtures/page.tsx",
        "src/app/%5F%5Fvisual-fixtures/session-recheck/page.tsx",
        "src/app/skeleton/page.tsx",
      ],
      "internal-fixture",
      "internal-fixture",
    ),
    ...routes(
      [
        "src/app/layout.tsx",
        "src/app/loading.tsx",
        "src/app/error.tsx",
        "src/app/not-found.tsx",
        "src/app/global-error.tsx",
      ],
      "public-localized",
      "public-shell",
      { routePolicyResolution: "current-request-path" },
    ),
    ...routes(
      ["src/app/auth/layout.tsx"],
      "signed-in-selected-locale",
      "trust-auth",
    ),
    ...routes(
      [
        "src/app/garden/layout.tsx",
        "src/app/garden/loading.tsx",
        "src/app/garden/error.tsx",
      ],
      "signed-in-selected-locale",
      "workspace",
    ),
    ...routes(
      ["src/app/admin/layout.tsx"],
      "explicit-operator-locale",
      "operator",
    ),
    ...routes(
      [
        "src/app/[locale]/feed/loading.tsx",
        "src/app/[locale]/feed/error.tsx",
        "src/app/feed/loading.tsx",
        "src/app/feed/error.tsx",
      ],
      "public-localized",
      "public-shell",
    ),
    ...routes(
      ["src/app/[locale]/objects/loading.tsx", "src/app/objects/loading.tsx"],
      "public-localized",
      "public-catalog",
    ),
    ...routes(
      ["src/app/[locale]/journals/loading.tsx", "src/app/journals/loading.tsx"],
      "public-localized",
      "public-journal",
    ),
    ...routes(
      [
        "src/app/[locale]/knowledge/loading.tsx",
        "src/app/knowledge/loading.tsx",
      ],
      "public-localized",
      "public-knowledge",
    ),
    ...routes(
      [
        "src/app/[locale]/bookmarks/loading.tsx",
        "src/app/[locale]/bookmarks/error.tsx",
        "src/app/[locale]/communities/loading.tsx",
        "src/app/[locale]/communities/error.tsx",
        "src/app/[locale]/notifications/loading.tsx",
        "src/app/[locale]/notifications/error.tsx",
        "src/app/[locale]/wishlist/loading.tsx",
        "src/app/[locale]/wishlist/error.tsx",
        "src/app/bookmarks/loading.tsx",
        "src/app/bookmarks/error.tsx",
        "src/app/notifications/loading.tsx",
        "src/app/notifications/error.tsx",
        "src/app/wishlist/loading.tsx",
        "src/app/wishlist/error.tsx",
      ],
      "public-localized",
      "social-community",
    ),
    ...routes(
      [
        "src/app/[locale]/page.tsx",
        "src/app/[locale]/feed/page.tsx",
        "src/app/page.tsx",
        "src/app/feed/page.tsx",
      ],
      "public-localized",
      "public-shell",
    ),
    ...routes(
      [
        "src/app/[locale]/objects/page.tsx",
        "src/app/objects/page.tsx",
        "src/app/breed/[slug]/page.tsx",
        "src/app/species/[slug]/page.tsx",
        "src/app/variety/[slug]/page.tsx",
      ],
      "public-localized",
      "public-catalog",
    ),
    ...routes(
      [
        "src/app/[locale]/journal/[slug]/page.tsx",
        "src/app/[locale]/journals/page.tsx",
        "src/app/[locale]/topics/[slug]/page.tsx",
        "src/app/journal/[slug]/page.tsx",
        "src/app/journals/page.tsx",
        "src/app/topics/[slug]/page.tsx",
      ],
      "public-localized",
      "public-journal",
    ),
    ...routes(
      [
        "src/app/[locale]/answers/[slug]/page.tsx",
        "src/app/[locale]/blog/[slug]/page.tsx",
        "src/app/[locale]/blog/page.tsx",
        "src/app/[locale]/guides/[slug]/page.tsx",
        "src/app/[locale]/knowledge/page.tsx",
        "src/app/[locale]/markets/[market]/page.tsx",
        "src/app/answers/[slug]/page.tsx",
        "src/app/blog/[slug]/page.tsx",
        "src/app/blog/page.tsx",
        "src/app/guides/[slug]/page.tsx",
        "src/app/knowledge/page.tsx",
        "src/app/markets/[market]/page.tsx",
      ],
      "public-localized",
      "public-knowledge",
    ),
    ...routes(
      ["src/app/[locale]/[profileHandle]/page.tsx"],
      "public-localized",
      "public-profile",
    ),
    ...routes(
      [
        "src/app/[locale]/bookmarks/page.tsx",
        "src/app/[locale]/communities/[slug]/page.tsx",
        "src/app/[locale]/communities/[slug]/discussions/[contributionId]/page.tsx",
        "src/app/[locale]/communities/page.tsx",
        "src/app/[locale]/notifications/page.tsx",
        "src/app/[locale]/wishlist/page.tsx",
        "src/app/bookmarks/page.tsx",
        "src/app/communities/[slug]/page.tsx",
        "src/app/communities/page.tsx",
        "src/app/notifications/page.tsx",
        "src/app/wishlist/page.tsx",
      ],
      "public-localized",
      "social-community",
    ),
    ...routes(
      [
        "src/app/[locale]/first-publication-disclosure/page.tsx",
        "src/app/[locale]/privacy/page.tsx",
        "src/app/erasure/page.tsx",
        "src/app/first-publication-disclosure/page.tsx",
        "src/app/join/page.tsx",
        "src/app/privacy/page.tsx",
        "src/app/support/page.tsx",
      ],
      "public-localized",
      "trust-auth",
    ),
    ...routes(
      [
        "src/app/auth/help/page.tsx",
        "src/app/auth/intent/page.tsx",
        "src/app/auth/reset-password/page.tsx",
      ],
      "signed-in-selected-locale",
      "trust-auth",
    ),
    ...routes(
      [
        "src/app/auth/intent/resume/route.ts",
        "src/app/auth/intent/start/route.ts",
        "src/app/garden/lineage/invitations/claim/handoff/route.ts",
      ],
      "redirect-only",
      "non-ui",
    ),
    ...routes(
      [
        "src/app/garden/page.tsx",
        "src/app/garden/profile/page.tsx",
        "src/app/garden/entries/[entryId]/edit/page.tsx",
      ],
      "signed-in-selected-locale",
      "workspace",
    ),
    ...routes(
      [
        "src/app/garden/objects/[objectId]/page.tsx",
        "src/app/garden/lineage/claims/page.tsx",
        "src/app/garden/lineage/invitations/claim/page.tsx",
        "src/app/garden/lineage/questions/page.tsx",
        "src/app/lineage/objects/[objectId]/page.tsx",
      ],
      "signed-in-selected-locale",
      "owner-object-lineage",
    ),
    ...routes(
      [
        "src/app/admin/communities/[slug]/page.tsx",
        "src/app/admin/communities/page.tsx",
        "src/app/admin/moderation/comments/page.tsx",
        "src/app/admin/page.tsx",
        "src/app/admin/users/page.tsx",
        "src/app/garden/catalog/curation/page.tsx",
        "src/app/garden/pilot-health/page.tsx",
        "src/app/garden/pilot-learning/decision/page.tsx",
        "src/app/garden/pilot-learning/interviews/page.tsx",
        "src/app/garden/pilot-smoke/page.tsx",
        "src/app/garden/privacy/erasure-requests/page.tsx",
        "src/app/health/page.tsx",
      ],
      "explicit-operator-locale",
      "operator",
    ),
    route(
      "src/lib/public-community-lifecycle.ts",
      "public-localized",
      "social-community",
      {
        routePattern: "/communities/[slug]",
        routePolicyProbePath: "/communities/coverage",
        failureVariants: ["not-found"],
        rawVariants: ["community-not-found-html"],
        browserScenarioIds: ["community:ove184-community-unavailable"],
      },
    ),
    route(
      "src/lib/public-profile-lifecycle.ts",
      "public-localized",
      "public-profile",
      {
        routePattern: "/@[profileHandle]",
        routePolicyProbePath: "/@coverage_profile",
        failureVariants: ["not-found", "gone"],
        rawVariants: ["profile-not-found-html", "profile-gone-html"],
        browserScenarioIds: [
          "profile:private-unavailable",
          "profile:removed-unavailable",
        ],
      },
    ),
    route(
      "src/lib/public-object-passport-lifecycle.ts",
      "public-localized",
      "public-catalog",
      {
        routePattern: "/lineage/objects/[objectId]",
        routePolicyProbePath: "/lineage/objects/coverage",
        failureVariants: ["not-found", "gone"],
        rawVariants: ["object-not-found-html", "object-gone-html"],
        browserScenarioIds: ["passport:public-unpublished"],
      },
    ),
    route(
      "src/lib/public-journal-entry-lifecycle.ts",
      "public-localized",
      "public-journal",
      {
        routePattern: "/journal/[slug]",
        routePolicyProbePath: "/journal/coverage",
        failureVariants: ["not-found", "gone"],
        rawVariants: ["journal-not-found-html", "journal-gone-html"],
        browserScenarioIds: ["journal-entry:gone-410"],
      },
    ),
    ...routes(
      [
        "src/app/api/%5F%5Fvisual-fixtures/journal-creation/route.ts",
        "src/app/api/auth/[...all]/route.ts",
        "src/app/api/cron/auth-email-outbox/route.ts",
        "src/app/api/cron/media-lifecycle/route.ts",
        "src/app/api/engagement/bookmarks/route.ts",
        "src/app/api/engagement/comments/block/route.ts",
        "src/app/api/engagement/comments/delete/route.ts",
        "src/app/api/engagement/comments/report/route.ts",
        "src/app/api/engagement/comments/route.ts",
        "src/app/api/engagement/follows/route.ts",
        "src/app/api/engagement/likes/route.ts",
        "src/app/api/garden/catalog/typeahead/route.ts",
        "src/app/api/garden/entries/route.ts",
        "src/app/api/garden/entries/[entryId]/route.ts",
        "src/app/api/garden/mentions/typeahead/route.ts",
        "src/app/api/garden/value-pulse/route.ts",
        "src/app/api/interface/context/route.ts",
        "src/app/api/interface/locale/route.ts",
        "src/app/api/media/[mediaAssetId]/focal/route.ts",
        "src/app/api/media/process/route.ts",
        "src/app/api/media/uploads/route.ts",
        "src/app/api/meta/conversions/route.ts",
        "src/app/api/notifications/preferences/route.ts",
        "src/app/api/notifications/receipts/route.ts",
        "src/app/api/public/objects/suggestions/route.ts",
        "src/app/api/skeleton/journal/route.ts",
      ],
      "api-non-ui",
      "non-ui",
    ),
  ] as const;

function allowExactLiterals(
  sourceFile: string,
  reason: LocalizationAllowlistReason,
  rationale: string,
  literals: readonly (readonly [LocalizationLiteralKind, string])[],
): LocalizationLiteralAllowlistEntry[] {
  return literals.map(([kind, value]) => ({
    sourceFile,
    kind,
    value,
    reason,
    rationale,
  }));
}

const BRAND_RATIONALE =
  "The immutable OverGarden product name is intentionally identical in every locale.";
const INTERNAL_FIXTURE_RATIONALE =
  "This exact operator-only deterministic fixture label is not part of the localized product UI.";

export const LOCALIZATION_AUTHORED_LITERAL_ALLOWLIST: readonly LocalizationLiteralAllowlistEntry[] =
  [
    ...[
      "src/app/[locale]/answers/[slug]/page.tsx",
      "src/app/[locale]/blog/[slug]/page.tsx",
      "src/app/[locale]/blog/page.tsx",
      "src/app/[locale]/guides/[slug]/page.tsx",
      "src/app/[locale]/journals/page.tsx",
      "src/app/[locale]/knowledge/page.tsx",
      "src/app/[locale]/markets/[market]/page.tsx",
      "src/app/[locale]/objects/page.tsx",
      "src/app/[locale]/page.tsx",
    ].flatMap((sourceFile) =>
      allowExactLiterals(sourceFile, "brand", BRAND_RATIONALE, [
        ["metadata-title", "OverGarden"],
      ]),
    ),
    ...[
      "src/app/auth/help/page.tsx",
      "src/app/auth/reset-password/page.tsx",
      "src/app/erasure/page.tsx",
      "src/app/global-error.tsx",
      "src/app/join/page.tsx",
      "src/app/not-found.tsx",
      "src/app/support/page.tsx",
      "src/components/site-shell/site-shell.tsx",
    ].flatMap((sourceFile) =>
      allowExactLiterals(sourceFile, "brand", BRAND_RATIONALE, [
        ["jsx-text", "OverGarden"],
      ]),
    ),
    ...allowExactLiterals(
      "src/app/%5F%5Fvisual-fixtures/page.tsx",
      "internal-fixture",
      INTERNAL_FIXTURE_RATIONALE,
      [
        ["metadata-title", "Visual fixtures | OverGarden"],
        ["jsx-text", "OverGarden"],
        ["jsx-text", "Deterministic visual environment"],
        ["jsx-text", "Manifest"],
        ["jsx-text", "Manifest SHA-256"],
        [
          "jsx-text",
          "Real scoped repositories, deterministic actors, and exact edges",
        ],
        ["jsx-text", "Social return-loop V2 evidence"],
        ["jsx-text", "Open social state"],
        [
          "jsx-text",
          "Guest-readable, actor-scoped, moderated canonical journals",
        ],
        ["jsx-text", "Moderated-community V2 evidence"],
        ["jsx-text", "Open community state"],
        ["jsx-text", "Desktop and mobile-320"],
        ["jsx-text", "Route scenarios"],
        ["jsx-text", "Open route"],
        [
          "jsx-text",
          "Owner-scoped inventory, continuity, drafts, and recovery states",
        ],
        ["jsx-text", "Garden workspace V2 evidence"],
        ["jsx-text", "Open workspace"],
        ["jsx-text", "Real first-object and next-update forms"],
        ["jsx-text", "Journal creation V2 evidence"],
        ["jsx-text", "Public-safe identity through production profile loaders"],
        ["jsx-text", "Gardener-profile V2 evidence"],
        ["jsx-text", "Open profile"],
        [
          "jsx-text",
          "Public lifecycle and owner scope through production loaders",
        ],
        ["jsx-text", "Living-object passport evidence"],
        ["jsx-text", "Open passport"],
        [
          "jsx-text",
          "Production read model, lifecycle, chronology, and owner scope",
        ],
        ["jsx-text", "Journal-entry V2 evidence"],
        ["jsx-text", "Open journal entry"],
        ["jsx-text", "Mutation boundaries and exact action recovery"],
        ["jsx-text", "Intent-aware authentication"],
        ["jsx-text", "Start intent"],
        ["jsx-text", "Inspect resume"],
        ["jsx-text", "Explicit visual and privacy boundaries"],
        ["jsx-text", "State coverage"],
        ["jsx-text", "Open evidence"],
        ["jsx-text", "Owner-only boundary · no public route"],
        ["jsx-text", "Synthetic public identities"],
        ["jsx-text", "Test profiles"],
        ["jsx-text", "EXIF-free generated raster set"],
        ["jsx-text", "Media aspect gallery"],
      ],
    ),
    ...allowExactLiterals(
      "src/app/%5F%5Fvisual-fixtures/session-recheck/session-recheck-visual-fixture.tsx",
      "internal-fixture",
      INTERNAL_FIXTURE_RATIONALE,
      [
        ["jsx-text", "Synthetic session recheck fixture"],
        ["jsx-text", "Synthetic private action"],
      ],
    ),
    ...allowExactLiterals(
      "src/app/%5F%5Fvisual-fixtures/visual-intent-draft-trigger.tsx",
      "internal-fixture",
      INTERNAL_FIXTURE_RATIONALE,
      [
        ["jsx-text", "IndexedDB draft storage is unavailable in this browser."],
        ["metadata-title", "Листя відновилося після спеки"],
        ["metadata-title", "Перша зав'язь після прохолодної ночі"],
      ],
    ),
    ...allowExactLiterals(
      "src/app/%5F%5Fvisual-fixtures/visual-journal-creation-controls.tsx",
      "internal-fixture",
      INTERNAL_FIXTURE_RATIONALE,
      [
        ["title", "Delete only this scenario's expected rows"],
        ["jsx-text", "Reset"],
        ["title", "Run the canonical journal repository path"],
        ["jsx-text", "Run"],
        ["title", "Verify exact scenario-owned rows and preconditions"],
        ["jsx-text", "Verify"],
        ["jsx-text", "Open form"],
        ["jsx-text", "Open result"],
      ],
    ),
    ...allowExactLiterals(
      "src/app/skeleton/page.tsx",
      "diagnostic",
      "This exact walking-skeleton label belongs to the internal infrastructure diagnostic route.",
      [
        ["jsx-text", "Walking skeleton"],
        [
          "jsx-text",
          "Local-only proof through canonical auth, scoped Kysely repositories, Postgres, queueing, and SSR readback.",
        ],
        ["jsx-text", "Canonical session boundary"],
        [
          "jsx-text",
          "Authenticated local session. Diagnostic reads remain scoped to the current user.",
        ],
        ["jsx-text", "No authenticated session. Use the canonical"],
        ["jsx-text", "garden sign-in flow"],
        ["jsx-text", ", then return to this local diagnostic."],
        ["jsx-text", "SSR readback"],
        ["jsx-text", "No entries yet."],
      ],
    ),
  ];

export interface LocalizationCoverageReport {
  schemaVersion: 3;
  issue: "OVE-205";
  evidenceClass: "local-deterministic-market-localization";
  baseline: {
    version: "ove205-v3";
    preservedBaseline: "ove171-v1";
    hash: string;
    locales: PublicLocale[];
    fixtureVersion: string;
    fixtureManifestHash: string;
  };
  marketContract: {
    resolutionSources: InterfaceMarketResolutionSource[];
    fallbackMarket: InterfaceMarket;
    markets: Array<{
      market: InterfaceMarket;
      allowedLocales: PublicLocale[];
      defaultLocale: PublicLocale;
      expectedLanguageControlCount: 0 | 1;
    }>;
  };
  routePolicies: Array<{
    id: string;
    mode: InterfaceRouteMode;
    safeQueryKeys: string[];
    preserveClientFragment: boolean;
  }>;
  rawLifecycleContract: {
    rendererModules: string[];
    supportModules: string[];
    controlOwnerId: "raw-lifecycle-interface-language-control";
  };
  summary: {
    routeModuleCount: number;
    classifiedRouteModuleCount: number;
    appSurfaceModuleCount: number;
    classifiedAppSurfaceModuleCount: number;
    registeredSurfaceCount: number;
    renderedRouteModuleCount: number;
    renderedSurfaceCount: number;
    renderedStateModuleCount: number;
    rawLifecycleRendererCount: number;
    globalErrorModuleCount: number;
    copyNamespaceCount: number;
    localeCount: number;
    authoredSourceCount: number;
    exclusionCount: number;
    scenarioCount: number;
    ownerBrowserProbeCount: number;
    preservedRouteModuleCount: number;
    newlyClosedDeltaRouteModuleCount: number;
    ove205CorrectiveSurfaceCount: number;
    downstreamOwnedUiGateCount: number;
  };
  surfaces: Array<
    LocalizationRouteRegistration &
      LocalizationOwnerContract & {
        coverageDisposition: LocalizationCoverageDisposition;
      }
  >;
  closedDeltas: Array<LocalizationClosedDelta>;
  browserProbes: Array<{
    id: string;
    owner: LocalizationRenderedOwnerId;
    scenarioId: string | null;
    pathTransform: LocalizationOwnerBrowserProbe["pathTransform"];
    stateClasses: readonly string[];
    viewportIds: readonly string[];
    runAxe: boolean;
    sourceFiles: readonly string[];
    marketCases: readonly string[];
    expectedControlCountByMarket: Readonly<Record<InterfaceMarket, 0 | 1>>;
    controlOwnerId: LocalizationOwnerBrowserProbe["controlOwnerId"];
    evidenceStatus: LocalizationOwnerBrowserProbe["evidenceStatus"];
  }>;
  downstreamOwnedUiGates: Array<{
    id: string;
    issue: string;
    requiredStates: string[];
    adapterContract: string;
    status: string;
    browserScenarioId: string | null;
    proofOwner: string;
    blocksCurrentIssue: false;
  }>;
  copyNamespaces: Array<{
    id: string;
    sourceFile: string;
    keyCount: number;
  }>;
  exclusions: Array<{
    sourceFile: string;
    kind: LocalizationLiteralKind;
    reason: LocalizationAllowlistReason;
    rationale: string;
  }>;
  missing: {
    unregisteredSurfaceModules: string[];
    staleSurfaceRegistrations: string[];
    duplicateSurfaceRegistrations: string[];
    invalidSurfaceRegistrations: string[];
    missingRequiredSurfaceKinds: string[];
    invalidRenderedProfiles: string[];
    invalidDownstreamUiGates: string[];
    copyLocaleValues: string[];
    copyKeyParity: string[];
    authoredLiterals: string[];
    invalidAllowlistEntries: string[];
    requiredStates: string[];
    ownerViewportProof: string[];
    ownerScenarioProof: string[];
    deltaEvidence: string[];
    unsafeEvidence: string[];
  };
}

interface BuildLocalizationCoverageOptions {
  discoveredSurfaceModules?: readonly string[];
  discoveredRouteModules?: readonly string[];
  routeRegistry?: readonly LocalizationRouteRegistration[];
  copyNamespaces?: readonly LocalizationCopyNamespace[];
  authoredSources?: readonly LocalizationAuthoredSource[];
  allowlist?: readonly LocalizationLiteralAllowlistEntry[];
  scenarios?: readonly CoreJourneyScenario[];
  browserProbes?: readonly LocalizationOwnerBrowserProbe[];
  downstreamUiGates?: readonly LocalizationDownstreamUiGate[];
}

export function buildLocalizationCoverage(
  options: BuildLocalizationCoverageOptions = {},
): LocalizationCoverageReport {
  const webRoot = resolveWebRoot();
  const routeRegistry = options.routeRegistry ?? LOCALIZATION_ROUTE_REGISTRY;
  const discoveredSurfaceModules =
    options.discoveredSurfaceModules ??
    options.discoveredRouteModules ??
    discoverLocalizationSurfaceModules(webRoot);
  const copyNamespaces = options.copyNamespaces ?? LOCALIZATION_COPY_NAMESPACES;
  const authoredSources =
    options.authoredSources ?? discoverAuthoredSources(webRoot);
  const allowlist =
    options.allowlist ?? LOCALIZATION_AUTHORED_LITERAL_ALLOWLIST;
  const scenarios = options.scenarios ?? CORE_JOURNEY_SCENARIOS;
  const browserProbes =
    options.browserProbes ?? LOCALIZATION_OWNER_BROWSER_PROBES;
  const downstreamUiGates =
    options.downstreamUiGates ?? LOCALIZATION_DOWNSTREAM_UI_GATES;
  const discoveredSurfaces = new Set(discoveredSurfaceModules);
  const registeredSurfaces = new Set(
    routeRegistry.map(({ sourceFile }) => sourceFile),
  );
  const discoveredRouteModules = discoveredSurfaceModules.filter((sourceFile) =>
    ["page", "route-handler"].includes(
      inferLocalizationSurfaceKind(sourceFile),
    ),
  );
  const discoveredAppSurfaceModules = discoveredSurfaceModules.filter(
    (sourceFile) => sourceFile.startsWith("src/app/"),
  );
  const scenarioById = new Map(
    scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const copyNamespaceIds = new Set(copyNamespaces.map(({ id }) => id));
  const observedScenarioStates = new Set(
    scenarios.flatMap(({ states }) => states),
  );
  const declaredStates = new Set(
    Object.values(LOCALIZATION_OWNER_CONTRACTS).flatMap(
      ({ stateClasses }) => stateClasses,
    ),
  );
  const copyCoverage = copyNamespaces.map((namespace) =>
    inspectCopyNamespace(namespace),
  );
  const renderedOwners = [...LOCALIZATION_RENDERED_OWNER_IDS];
  const routeCounts = countValues(
    routeRegistry.map(({ sourceFile }) => sourceFile),
  );
  const nonRenderedClassifications = new Set<LocalizationRouteClassification>([
    "redirect-only",
    "api-non-ui",
    "internal-fixture",
  ]);
  const invalidRouteRegistrations = routeRegistry.flatMap((registration) => {
    const contract = LOCALIZATION_OWNER_CONTRACTS[registration.owner];
    const errors: string[] = [];
    const inferredKind = inferLocalizationSurfaceKind(registration.sourceFile);
    const isPage = registration.surfaceKind === "page";
    const isRouteHandler = registration.surfaceKind === "route-handler";
    if (!contract) return [`${registration.sourceFile}:unknown-owner`];
    if (registration.surfaceKind !== inferredKind) {
      errors.push(`${registration.sourceFile}:surface-kind-mismatch`);
    }
    if (
      RENDERED_CLASSIFICATIONS.has(registration.classification) !==
      contract.rendered
    ) {
      errors.push(`${registration.sourceFile}:classification-owner-mismatch`);
    }
    if (
      nonRenderedClassifications.has(registration.classification) ===
      contract.rendered
    ) {
      errors.push(`${registration.sourceFile}:rendering-contract-mismatch`);
    }
    if (isPage && registration.classification === "api-non-ui") {
      errors.push(`${registration.sourceFile}:page-classified-as-api`);
    }
    if (isPage && registration.classification === "redirect-only") {
      errors.push(`${registration.sourceFile}:page-classified-as-redirect`);
    }
    if (
      isRouteHandler &&
      RENDERED_CLASSIFICATIONS.has(registration.classification)
    ) {
      errors.push(`${registration.sourceFile}:handler-classified-as-rendered`);
    }
    if (
      registration.classification === "api-non-ui" &&
      (registration.owner !== "non-ui" ||
        !registration.sourceFile.startsWith("src/app/api/") ||
        registration.surfaceKind !== "route-handler")
    ) {
      errors.push(`${registration.sourceFile}:api-owner`);
    }
    if (
      registration.classification === "redirect-only" &&
      (registration.owner !== "non-ui" || !isRouteHandler)
    ) {
      errors.push(`${registration.sourceFile}:redirect-owner`);
    }
    if (
      registration.classification === "explicit-operator-locale" &&
      registration.owner !== "operator"
    ) {
      errors.push(`${registration.sourceFile}:operator-owner`);
    }
    if (
      registration.classification === "internal-fixture" &&
      (registration.owner !== "internal-fixture" ||
        (!registration.sourceFile.startsWith(
          "src/app/%5F%5Fvisual-fixtures/",
        ) &&
          registration.sourceFile !== "src/app/skeleton/page.tsx"))
    ) {
      errors.push(`${registration.sourceFile}:fixture-owner-or-path`);
    }
    if (
      registration.surfaceKind === "raw-lifecycle" &&
      (!contract.rendered || registration.classification !== "public-localized")
    ) {
      errors.push(`${registration.sourceFile}:raw-lifecycle-not-rendered`);
    }
    if (contract?.rendered && contract.copyNamespaces.length === 0) {
      errors.push(`${registration.sourceFile}:missing-copy-namespace`);
    }
    for (const namespace of contract?.copyNamespaces ?? []) {
      if (!copyNamespaceIds.has(namespace)) {
        errors.push(
          `${registration.sourceFile}:unknown-copy-namespace:${namespace}`,
        );
      }
    }
    return errors;
  });
  const invalidRenderedProfiles = routeRegistry.flatMap((registration) => {
    const contract = LOCALIZATION_OWNER_CONTRACTS[registration.owner];
    const profile = registration.renderedProfile;
    const errors: string[] = [];
    const prefix = registration.sourceFile;

    if (!contract.rendered) {
      return profile ? [`${prefix}:non-rendered-profile`] : [];
    }
    if (!profile) return [`${prefix}:missing-rendered-profile`];

    if (profile.marketProfileId !== "market-first-ove205") {
      errors.push(`${prefix}:market-profile-id`);
    }
    if (
      JSON.stringify(profile.marketSources) !==
      JSON.stringify(OVE205_MARKET_SOURCES)
    ) {
      errors.push(`${prefix}:market-sources`);
    }
    if (profile.fallbackMarket !== DEFAULT_INTERFACE_MARKET) {
      errors.push(`${prefix}:fallback-market`);
    }
    for (const market of INTERFACE_MARKETS) {
      if (
        JSON.stringify(profile.allowedLocalesByMarket[market]) !==
        JSON.stringify(INTERFACE_MARKET_CONFIG[market].allowedLocales)
      ) {
        errors.push(`${prefix}:${market}:allowed-locales`);
      }
      if (
        profile.defaultLocaleByMarket[market] !==
        INTERFACE_MARKET_CONFIG[market].defaultLocale
      ) {
        errors.push(`${prefix}:${market}:default-locale`);
      }
    }
    if (
      profile.ukraineControl.expectedCount !== 0 ||
      profile.ukraineControl.ownerId !== null
    ) {
      errors.push(`${prefix}:ukraine-control`);
    }
    const expectedControlOwner =
      registration.surfaceKind === "raw-lifecycle"
        ? "raw-lifecycle-interface-language-control"
        : "site-shell-interface-language-control";
    if (
      profile.bulgariaControl.expectedCount !== 1 ||
      profile.bulgariaControl.ownerId !== expectedControlOwner
    ) {
      errors.push(`${prefix}:bulgaria-control`);
    }

    if (profile.routePolicyResolution === "exact-source-path") {
      if (!profile.routePolicyProbePath) {
        errors.push(`${prefix}:missing-route-policy-probe-path`);
      } else {
        const policy = getInterfaceRoutePolicy(profile.routePolicyProbePath);
        if (profile.routePolicyId !== policy.id) {
          errors.push(`${prefix}:route-policy-id`);
        }
        if (profile.switchMode !== policy.mode) {
          errors.push(`${prefix}:switch-mode`);
        }
        if (
          JSON.stringify(profile.safeQueryKeys) !==
          JSON.stringify(policy.safeQueryKeys)
        ) {
          errors.push(`${prefix}:safe-query-policy`);
        }
        if (profile.preserveClientFragment !== policy.preserveClientFragment) {
          errors.push(`${prefix}:fragment-policy`);
        }
      }
    } else if (
      profile.routePolicyProbePath !== null ||
      profile.routePolicyId !== "central-policy-for-current-request-path" ||
      profile.switchMode !== "current-request-path" ||
      profile.safeQueryKeys !== "central-policy-for-current-request-path" ||
      profile.preserveClientFragment !==
        "central-policy-for-current-request-path"
    ) {
      errors.push(`${prefix}:current-request-policy-contract`);
    }

    if (profile.authVariants.length === 0) {
      errors.push(`${prefix}:auth-variants`);
    }
    if (profile.roleVariants.length === 0) {
      errors.push(`${prefix}:role-variants`);
    }
    if (profile.failureVariants.length === 0) {
      errors.push(`${prefix}:failure-variants`);
    }
    if (profile.rawVariants.length === 0) {
      errors.push(`${prefix}:raw-variants`);
    }
    if (
      registration.surfaceKind === "raw-lifecycle" &&
      profile.rawVariants.includes("react-rendered")
    ) {
      errors.push(`${prefix}:raw-renderer-profile`);
    }
    if (
      registration.surfaceKind !== "raw-lifecycle" &&
      !profile.rawVariants.includes("react-rendered")
    ) {
      errors.push(`${prefix}:react-renderer-profile`);
    }
    if (profile.browserScenarioIds.length === 0) {
      errors.push(`${prefix}:browser-scenarios`);
    }
    for (const scenarioId of profile.browserScenarioIds) {
      if (!scenarioById.has(scenarioId)) {
        errors.push(`${prefix}:browser-scenario:${scenarioId}`);
      }
    }
    if (
      profile.dirtyPolicyId === "shared-locale-change-coordinator" &&
      profile.dirtyParticipantIds.some(
        (participantId) => participantId !== "owner-composer-drafts",
      )
    ) {
      errors.push(`${prefix}:dirty-participant`);
    }
    if (
      profile.dirtyPolicyId === "terminal-state-no-dirty-work" &&
      profile.dirtyParticipantIds.length > 0
    ) {
      errors.push(`${prefix}:terminal-dirty-participant`);
    }

    return errors;
  });
  const ownerScenarioProof = renderedOwners.flatMap((owner) => {
    const contract = LOCALIZATION_OWNER_CONTRACTS[owner];
    const missingScenarios = contract.scenarioIds.filter(
      (id) => !scenarioById.has(id),
    );
    const missingTests = contract.focusedTests.filter(
      (testFile) => !existsSync(path.join(webRoot, testFile)),
    );
    return [
      ...(routeRegistry.some((registration) => registration.owner === owner)
        ? []
        : [`${owner}:no-route-registrations`]),
      ...missingScenarios.map((id) => `${owner}:scenario:${id}`),
      ...missingTests.map((testFile) => `${owner}:test:${testFile}`),
      ...(contract.scenarioIds.length === 0 ? [`${owner}:no-scenarios`] : []),
      ...(contract.focusedTests.length === 0
        ? [`${owner}:no-focused-tests`]
        : []),
    ];
  });
  const probeCounts = countValues(browserProbes.map(({ id }) => id));
  const ownerViewportProof = [
    ...renderedOwners.flatMap((owner) => {
      const probes = browserProbes.filter((probe) => probe.owner === owner);
      if (probes.length === 0) return [`${owner}:missing-browser-probe`];
      return ["mobile-320", "desktop-1440"].flatMap((viewport) =>
        probes.some(({ viewportIds }) =>
          viewportIds.includes(viewport as never),
        )
          ? []
          : [`${owner}:${viewport}`],
      );
    }),
    ...browserProbes.flatMap((probe) => {
      const errors: string[] = [];
      const scenario = probe.scenarioId
        ? scenarioById.get(probe.scenarioId)
        : null;
      if (probe.scenarioId && !scenario) {
        errors.push(`${probe.id}:scenario:${probe.scenarioId}`);
      }
      if (!probe.scenarioId && !probe.explicitPath) {
        errors.push(`${probe.id}:missing-path-source`);
      }
      if (probe.scenarioId && probe.explicitPath) {
        errors.push(`${probe.id}:ambiguous-path-source`);
      }
      if (
        probe.pathTransform === "community-moderation" &&
        scenario?.archetype !== "community"
      ) {
        errors.push(`${probe.id}:invalid-community-transform`);
      }
      for (const state of probe.stateClasses) {
        if (scenario && !scenario.states.includes(state as never)) {
          errors.push(`${probe.id}:unproven-state:${state}`);
        }
      }
      if (
        scenario &&
        probe.expectedStatus !== undefined &&
        probe.expectedStatus !== scenario.expectedStatus
      ) {
        errors.push(`${probe.id}:expected-status`);
      }
      if (
        JSON.stringify(probe.marketCases) !==
        JSON.stringify([
          "ukraine-uk-zero-control",
          "bulgaria-bg-exactly-one-control",
          "bulgaria-ru-exactly-one-control",
        ])
      ) {
        errors.push(`${probe.id}:market-cases`);
      }
      if (
        probe.expectedControlCountByMarket.ukraine !== 0 ||
        probe.expectedControlCountByMarket.bulgaria !== 1
      ) {
        errors.push(`${probe.id}:control-counts`);
      }
      const rawProbe = probe.sourceFiles.some((sourceFile) =>
        RAW_LIFECYCLE_RENDERER_MODULES.includes(sourceFile as never),
      );
      if (
        probe.controlOwnerId !==
        (rawProbe
          ? "raw-lifecycle-interface-language-control"
          : "site-shell-interface-language-control")
      ) {
        errors.push(`${probe.id}:control-owner`);
      }
      if (probe.evidenceStatus !== "browser-run-required") {
        errors.push(`${probe.id}:evidence-status`);
      }
      for (const sourceFile of probe.sourceFiles) {
        if (!registeredSurfaces.has(sourceFile)) {
          errors.push(`${probe.id}:unregistered-source:${sourceFile}`);
        }
      }
      return errors;
    }),
    ...RAW_LIFECYCLE_RENDERER_MODULES.filter(
      (sourceFile) =>
        !browserProbes.some((probe) => probe.sourceFiles.includes(sourceFile)),
    ).map((sourceFile) => `${sourceFile}:missing-raw-browser-probe`),
    ...[...probeCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => `${id}:duplicate-probe`),
  ];
  const browserStateClasses = new Set(
    browserProbes.flatMap(({ stateClasses }) => stateClasses),
  );
  const expectedDownstreamUiGates: ReadonlyMap<
    string,
    (typeof LOCALIZATION_DOWNSTREAM_UI_PROOF_REQUIREMENTS)[number]
  > = new Map(
    LOCALIZATION_DOWNSTREAM_UI_PROOF_REQUIREMENTS.map((requirement) => [
      requirement.id,
      requirement,
    ]),
  );
  const downstreamGateCounts = countValues(
    downstreamUiGates.map(({ id }) => id),
  );
  const invalidDownstreamUiGates = [
    ...downstreamUiGates.flatMap((gate) => {
      const errors: string[] = [];
      const expected = expectedDownstreamUiGates.get(gate.id);
      if (!expected || expected.issue !== gate.issue) {
        errors.push(`${gate.id}:issue-or-id`);
      }
      if (gate.issue === "OVE-202") {
        if (gate.status !== "browser-backed") {
          errors.push(`${gate.id}:status`);
        }
        if (gate.adapterContract !== "owner-composer-drafts") {
          errors.push(`${gate.id}:adapter-contract`);
        }
        if (
          gate.browserScenarioId === null ||
          gate.proofOwner !== "OVE-202" ||
          gate.blocksCurrentIssue !== false
        ) {
          errors.push(`${gate.id}:missing-browser-proof`);
        }
      } else if (gate.issue === "OVE-206") {
        if (gate.status !== "browser-backed") {
          errors.push(`${gate.id}:status`);
        }
        if (gate.adapterContract !== "owner-composer-drafts") {
          errors.push(`${gate.id}:adapter-contract`);
        }
        if (
          gate.browserScenarioId === null ||
          gate.proofOwner !== "OVE-206" ||
          gate.blocksCurrentIssue !== false
        ) {
          errors.push(`${gate.id}:missing-browser-proof`);
        }
      } else if (gate.issue === "OVE-207") {
        if (gate.status !== "browser-backed") {
          errors.push(`${gate.id}:status`);
        }
        if (gate.adapterContract !== "owner-composer-drafts") {
          errors.push(`${gate.id}:adapter-contract`);
        }
        if (
          gate.browserScenarioId === null ||
          gate.proofOwner !== "OVE-207" ||
          gate.blocksCurrentIssue !== false
        ) {
          errors.push(`${gate.id}:missing-browser-proof`);
        }
      } else {
        if (gate.status !== "downstream-owned-real-ui") {
          errors.push(`${gate.id}:status`);
        }
        if (gate.adapterContract !== "owner-composer-drafts") {
          errors.push(`${gate.id}:adapter-contract`);
        }
        if (
          gate.browserScenarioId !== null ||
          gate.proofOwner !== "owning-downstream-slice" ||
          gate.blocksCurrentIssue !== false
        ) {
          errors.push(`${gate.id}:fabricated-current-proof`);
        }
      }
      if (
        !expected ||
        gate.requiredStates.length !== expected.requiredStates.length ||
        gate.requiredStates.some(
          (state, index) => state !== expected.requiredStates[index],
        )
      ) {
        errors.push(`${gate.id}:required-states`);
      }
      return errors;
    }),
    ...[...expectedDownstreamUiGates.keys()]
      .filter((id) => !downstreamGateCounts.has(id))
      .map((id) => `${id}:missing-downstream-gate`),
    ...[...downstreamGateCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => `${id}:duplicate-downstream-gate`),
  ];
  const allClosedDeltas = [
    ...OVE171_CLOSED_DELTAS,
    ...OVE205_CORRECTIVE_DELTAS,
  ];
  const deltaCounts = countValues(allClosedDeltas.map(({ id }) => id));
  const deltaEvidence = [
    ...allClosedDeltas.flatMap(({ id, sourceFiles }) =>
      sourceFiles
        .filter((sourceFile) => !existsSync(path.join(webRoot, sourceFile)))
        .map((sourceFile) => `${id}:missing-source:${sourceFile}`),
    ),
    ...[...deltaCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => `${id}:duplicate-delta`),
    ...[...OVE171_NEWLY_CLOSED_ROUTE_MODULES]
      .filter((sourceFile) => !registeredSurfaces.has(sourceFile))
      .map((sourceFile) => `unregistered-delta-route:${sourceFile}`),
    ...OVE205_EXPECTED_NEW_APP_MODULES.filter(
      (sourceFile) => !registeredSurfaces.has(sourceFile),
    ).map((sourceFile) => `unregistered-ove205-surface:${sourceFile}`),
    ...RAW_LIFECYCLE_SUPPORT_MODULES.flatMap((sourceFile) => {
      const absolutePath = path.join(webRoot, sourceFile);
      if (!existsSync(absolutePath)) return [];
      return readFileSync(absolutePath, "utf8").includes(
        "raw-lifecycle-interface-language-control",
      )
        ? []
        : [`raw-lifecycle-control:missing-owner-marker:${sourceFile}`];
    }),
  ];
  const unsafeEvidence = [
    ...routeRegistry.flatMap(({ sourceFile, routePattern }) => {
      const serialized = `${sourceFile} ${routePattern}`;
      return /https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[?&](?:token|secret|key)=|(?:latitude|longitude|coordinates)=/i.test(
        serialized,
      )
        ? [sourceFile]
        : [];
    }),
    ...browserProbes.flatMap(({ id, explicitPath }) =>
      explicitPath &&
      /https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[?&](?:token|secret|key)=|(?:latitude|longitude|coordinates)=/i.test(
        explicitPath,
      )
        ? [`browser-probe:${id}`]
        : [],
    ),
    ...allClosedDeltas.flatMap((delta) =>
      /https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[?&](?:token|secret|key)=|(?:latitude|longitude|coordinates)=/i.test(
        JSON.stringify(delta),
      )
        ? [`closed-delta:${delta.id}`]
        : [],
    ),
  ];
  const authoredLiterals = scanAuthoredLocalizationSources(
    authoredSources,
    allowlist,
  );
  const invalidAllowlistEntries = validateLocalizationAllowlist(allowlist);
  const routePolicyCatalog = [
    ...INTERFACE_ROUTE_POLICIES,
    getInterfaceRoutePolicy("/garden"),
  ].filter(
    (policy, index, policies) =>
      policies.findIndex(({ id }) => id === policy.id) === index,
  );
  const coverageDisposition = (
    registration: LocalizationRouteRegistration,
  ): LocalizationCoverageDisposition => {
    if (OVE171_NEWLY_CLOSED_ROUTE_MODULES.has(registration.sourceFile)) {
      return "ove171-closed-delta";
    }
    if (
      registration.surfaceKind !== "page" &&
      registration.surfaceKind !== "route-handler"
    ) {
      return "ove205-corrective-delta";
    }
    if (
      OVE205_EXPECTED_NEW_APP_MODULES.includes(registration.sourceFile as never)
    ) {
      return "ove205-corrective-delta";
    }
    return "preserved-baseline";
  };
  const baselineHash = createHash("sha256")
    .update(
      JSON.stringify({
        surfaces: routeRegistry,
        marketContract: INTERFACE_MARKET_CONFIG,
        routePolicies: routePolicyCatalog,
        copyNamespaces: copyCoverage.map(({ id, keyPaths }) => ({
          id,
          keyPaths,
        })),
        owners: LOCALIZATION_OWNER_CONTRACTS,
        browserProbes,
        downstreamUiGates,
        closedDeltas: allClosedDeltas,
        fixture: VISUAL_FIXTURE_MANIFEST_HASH,
      }),
    )
    .digest("hex");

  return {
    schemaVersion: 3,
    issue: "OVE-205",
    evidenceClass: "local-deterministic-market-localization",
    baseline: {
      version: "ove205-v3",
      preservedBaseline: "ove171-v1",
      hash: baselineHash,
      locales: [...PUBLIC_LOCALES],
      fixtureVersion: VISUAL_FIXTURE_MANIFEST.version,
      fixtureManifestHash: VISUAL_FIXTURE_MANIFEST_HASH,
    },
    marketContract: {
      resolutionSources: [...OVE205_MARKET_SOURCES],
      fallbackMarket: DEFAULT_INTERFACE_MARKET,
      markets: INTERFACE_MARKETS.map((market) => ({
        market,
        allowedLocales: [...INTERFACE_MARKET_CONFIG[market].allowedLocales],
        defaultLocale: INTERFACE_MARKET_CONFIG[market].defaultLocale,
        expectedLanguageControlCount: market === "ukraine" ? 0 : 1,
      })),
    },
    routePolicies: routePolicyCatalog.map((policy) => ({
      id: policy.id,
      mode: policy.mode,
      safeQueryKeys: [...policy.safeQueryKeys],
      preserveClientFragment: policy.preserveClientFragment,
    })),
    rawLifecycleContract: {
      rendererModules: [...RAW_LIFECYCLE_RENDERER_MODULES],
      supportModules: [...RAW_LIFECYCLE_SUPPORT_MODULES],
      controlOwnerId: "raw-lifecycle-interface-language-control",
    },
    summary: {
      routeModuleCount: discoveredRouteModules.length,
      classifiedRouteModuleCount: routeRegistry.filter(({ surfaceKind }) =>
        ["page", "route-handler"].includes(surfaceKind),
      ).length,
      appSurfaceModuleCount: discoveredAppSurfaceModules.length,
      classifiedAppSurfaceModuleCount: routeRegistry.filter(({ sourceFile }) =>
        sourceFile.startsWith("src/app/"),
      ).length,
      registeredSurfaceCount: routeRegistry.length,
      renderedRouteModuleCount: routeRegistry.filter(
        ({ owner, surfaceKind }) =>
          surfaceKind === "page" &&
          LOCALIZATION_OWNER_CONTRACTS[owner].rendered,
      ).length,
      renderedSurfaceCount: routeRegistry.filter(
        ({ owner }) => LOCALIZATION_OWNER_CONTRACTS[owner].rendered,
      ).length,
      renderedStateModuleCount: routeRegistry.filter(({ surfaceKind }) =>
        ["layout", "loading", "error", "not-found", "global-error"].includes(
          surfaceKind,
        ),
      ).length,
      rawLifecycleRendererCount: routeRegistry.filter(
        ({ surfaceKind }) => surfaceKind === "raw-lifecycle",
      ).length,
      globalErrorModuleCount: discoveredSurfaceModules.filter(
        (sourceFile) =>
          inferLocalizationSurfaceKind(sourceFile) === "global-error",
      ).length,
      copyNamespaceCount: copyNamespaces.length,
      localeCount: PUBLIC_LOCALES.length,
      authoredSourceCount: authoredSources.length,
      exclusionCount: allowlist.length,
      scenarioCount: scenarios.length,
      ownerBrowserProbeCount: browserProbes.length,
      preservedRouteModuleCount: routeRegistry.filter(
        (registration) =>
          coverageDisposition(registration) === "preserved-baseline",
      ).length,
      newlyClosedDeltaRouteModuleCount: routeRegistry.filter(({ sourceFile }) =>
        OVE171_NEWLY_CLOSED_ROUTE_MODULES.has(sourceFile),
      ).length,
      ove205CorrectiveSurfaceCount: routeRegistry.filter(
        (registration) =>
          coverageDisposition(registration) === "ove205-corrective-delta",
      ).length,
      downstreamOwnedUiGateCount: downstreamUiGates.length,
    },
    surfaces: routeRegistry.map((registration) => ({
      ...registration,
      coverageDisposition: coverageDisposition(registration),
      ...LOCALIZATION_OWNER_CONTRACTS[registration.owner],
      authVariants: [
        ...LOCALIZATION_OWNER_CONTRACTS[registration.owner].authVariants,
      ],
      roleVariants: [
        ...LOCALIZATION_OWNER_CONTRACTS[registration.owner].roleVariants,
      ],
      stateClasses: [
        ...LOCALIZATION_OWNER_CONTRACTS[registration.owner].stateClasses,
      ],
      copyNamespaces: [
        ...LOCALIZATION_OWNER_CONTRACTS[registration.owner].copyNamespaces,
      ],
      scenarioIds: [
        ...LOCALIZATION_OWNER_CONTRACTS[registration.owner].scenarioIds,
      ],
      focusedTests: [
        ...LOCALIZATION_OWNER_CONTRACTS[registration.owner].focusedTests,
      ],
    })),
    closedDeltas: allClosedDeltas.map((delta) => ({
      ...delta,
      sourceFiles: [...delta.sourceFiles],
    })),
    browserProbes: browserProbes.map(
      ({
        id,
        owner,
        scenarioId,
        pathTransform,
        stateClasses,
        viewportIds,
        runAxe,
        sourceFiles,
        marketCases,
        expectedControlCountByMarket,
        controlOwnerId,
        evidenceStatus,
      }) => ({
        id,
        owner,
        scenarioId,
        pathTransform,
        stateClasses: [...stateClasses],
        viewportIds: [...viewportIds],
        runAxe: runAxe ?? false,
        sourceFiles: [...sourceFiles],
        marketCases: [...marketCases],
        expectedControlCountByMarket: { ...expectedControlCountByMarket },
        controlOwnerId,
        evidenceStatus,
      }),
    ),
    downstreamOwnedUiGates: downstreamUiGates.map((gate) => ({
      ...gate,
      requiredStates: [...gate.requiredStates],
    })),
    copyNamespaces: copyCoverage.map(({ id, sourceFile, keyPaths }) => ({
      id,
      sourceFile,
      keyCount: keyPaths.length,
    })),
    exclusions: allowlist.map(({ sourceFile, kind, reason, rationale }) => ({
      sourceFile,
      kind,
      reason,
      rationale,
    })),
    missing: {
      unregisteredSurfaceModules: uniqueSorted(
        [...discoveredSurfaces].filter(
          (sourceFile) => !registeredSurfaces.has(sourceFile),
        ),
      ),
      staleSurfaceRegistrations: uniqueSorted(
        [...registeredSurfaces].filter(
          (sourceFile) => !discoveredSurfaces.has(sourceFile),
        ),
      ),
      duplicateSurfaceRegistrations: [...routeCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([sourceFile]) => sourceFile)
        .sort(),
      invalidSurfaceRegistrations: uniqueSorted(invalidRouteRegistrations),
      missingRequiredSurfaceKinds: REQUIRED_SURFACE_KINDS.filter(
        (kind) =>
          !discoveredSurfaceModules.some(
            (sourceFile) => inferLocalizationSurfaceKind(sourceFile) === kind,
          ),
      ),
      invalidRenderedProfiles: uniqueSorted(invalidRenderedProfiles),
      invalidDownstreamUiGates: uniqueSorted(invalidDownstreamUiGates),
      copyLocaleValues: uniqueSorted(
        copyCoverage.flatMap(({ invalidValues }) => invalidValues),
      ),
      copyKeyParity: uniqueSorted(
        copyCoverage.flatMap(({ parityErrors }) => parityErrors),
      ),
      authoredLiterals,
      invalidAllowlistEntries,
      requiredStates: uniqueSorted([
        ...CORE_JOURNEY_REQUIRED_STATES.filter(
          (state) => !observedScenarioStates.has(state),
        ),
        ...REQUIRED_DECLARED_STATES.filter(
          (state) => !declaredStates.has(state),
        ),
        ...LOCALIZATION_REQUIRED_BROWSER_STATES.filter(
          (state) => !browserStateClasses.has(state),
        ),
      ]),
      ownerViewportProof: uniqueSorted(ownerViewportProof),
      ownerScenarioProof: uniqueSorted(ownerScenarioProof),
      deltaEvidence: uniqueSorted(deltaEvidence),
      unsafeEvidence: uniqueSorted(unsafeEvidence),
    },
  };
}

export function assertLocalizationCoverage(
  report: LocalizationCoverageReport,
): void {
  const failures = Object.entries(report.missing).flatMap(([kind, values]) =>
    values.map((value) => `${kind}:${value}`),
  );
  if (failures.length > 0) {
    throw new Error(
      `OVE-205 localization coverage is incomplete: ${failures.join(", ")}`,
    );
  }
}

export function scanAuthoredLocalizationSources(
  sources: readonly LocalizationAuthoredSource[],
  allowlist: readonly LocalizationLiteralAllowlistEntry[],
): string[] {
  const allowed = new Set(
    allowlist.map(({ sourceFile, kind, value }) =>
      literalKey(sourceFile, kind, value),
    ),
  );
  const findings: string[] = [];

  for (const { sourceFile, source } of sources) {
    const sourceFileNode = ts.createSourceFile(
      sourceFile,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const record = (
      node: ts.Node,
      kind: LocalizationLiteralKind,
      rawValue: string,
    ) => {
      const value = normalizeLiteral(rawValue);
      if (!containsAuthoredLetters(value) || hasInlineLocaleMapAncestor(node))
        return;
      if (allowed.has(literalKey(sourceFile, kind, value))) return;
      const line =
        sourceFileNode.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      findings.push(`${sourceFile}:${line}:${kind}:${redactLiteral(value)}`);
    };

    const visit = (node: ts.Node): void => {
      if (ts.isJsxText(node)) {
        record(node, "jsx-text", node.getText(sourceFileNode));
      } else if (
        ts.isJsxExpression(node) &&
        node.expression &&
        (ts.isStringLiteral(node.expression) ||
          ts.isNoSubstitutionTemplateLiteral(node.expression))
      ) {
        record(node, "jsx-expression", node.expression.text);
      } else if (ts.isJsxAttribute(node) && node.initializer) {
        const attribute = node.name.getText(sourceFileNode).toLowerCase();
        const kind = jsxAttributeKind(attribute);
        if (kind) {
          if (ts.isStringLiteral(node.initializer)) {
            record(node, kind, node.initializer.text);
          } else if (
            ts.isJsxExpression(node.initializer) &&
            node.initializer.expression &&
            (ts.isStringLiteral(node.initializer.expression) ||
              ts.isNoSubstitutionTemplateLiteral(node.initializer.expression))
          ) {
            record(node, kind, node.initializer.expression.text);
          }
        }
      } else if (ts.isPropertyAssignment(node)) {
        const propertyName = propertyNameText(node.name);
        if (
          (propertyName === "title" || propertyName === "description") &&
          (ts.isStringLiteral(node.initializer) ||
            ts.isNoSubstitutionTemplateLiteral(node.initializer))
        ) {
          record(
            node,
            propertyName === "title"
              ? "metadata-title"
              : "metadata-description",
            node.initializer.text,
          );
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFileNode);
  }

  return uniqueSorted(findings);
}

export function validateLocalizationAllowlist(
  allowlist: readonly LocalizationLiteralAllowlistEntry[],
): string[] {
  const supportedReasons = new Set<LocalizationAllowlistReason>([
    "brand",
    "provider-name",
    "scientific-name",
    "catalog-content",
    "user-content",
    "url-or-identifier",
    "diagnostic",
    "internal-fixture",
  ]);
  const errors: string[] = [];
  const keys = new Set<string>();

  for (const entry of allowlist) {
    const prefix = `${entry.sourceFile}:${entry.kind}:${redactLiteral(entry.value)}`;
    if (/[?*{}]/.test(entry.sourceFile))
      errors.push(`${prefix}:wildcard-source`);
    if (!supportedReasons.has(entry.reason))
      errors.push(`${prefix}:unsupported-reason`);
    if (entry.rationale.trim().length < 12)
      errors.push(`${prefix}:missing-rationale`);
    const key = literalKey(
      entry.sourceFile,
      entry.kind,
      normalizeLiteral(entry.value),
    );
    if (keys.has(key)) errors.push(`${prefix}:duplicate`);
    keys.add(key);
  }

  return uniqueSorted(errors);
}

function resolveWebRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "src", "app"))) return cwd;
  const nested = path.join(cwd, "apps", "web");
  if (existsSync(path.join(nested, "src", "app"))) return nested;
  throw new Error("OVE-171 cannot resolve the apps/web root.");
}

function discoverLocalizationSurfaceModules(webRoot: string): string[] {
  const appSurfaces = walkFiles(path.join(webRoot, "src", "app"))
    .filter((filePath) =>
      /\/(?:page\.tsx|route\.ts|layout\.tsx|loading\.tsx|error\.tsx|not-found\.tsx|global-error\.tsx)$/.test(
        filePath,
      ),
    )
    .map((filePath) => toWebRelativePath(webRoot, filePath));
  const rawLifecycleRenderers = walkFiles(path.join(webRoot, "src", "lib"))
    .filter((filePath) => filePath.endsWith("-lifecycle.ts"))
    .filter((filePath) =>
      /export function render[A-Za-z]+Html\s*\(/.test(
        readFileSync(filePath, "utf8"),
      ),
    )
    .map((filePath) => toWebRelativePath(webRoot, filePath));

  return uniqueSorted([...appSurfaces, ...rawLifecycleRenderers]);
}

function discoverAuthoredSources(
  webRoot: string,
): LocalizationAuthoredSource[] {
  return [
    path.join(webRoot, "src", "app"),
    path.join(webRoot, "src", "components"),
  ]
    .flatMap((root) => walkFiles(root))
    .filter(
      (filePath) =>
        filePath.endsWith(".tsx") &&
        !/\.(?:test|spec)\.tsx$/.test(filePath) &&
        !filePath.includes(`${path.sep}__snapshots__${path.sep}`),
    )
    .sort()
    .map((filePath) => ({
      sourceFile: toWebRelativePath(webRoot, filePath),
      source: readFileSync(filePath, "utf8"),
    }));
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

function toWebRelativePath(webRoot: string, filePath: string): string {
  return path.relative(webRoot, filePath).split(path.sep).join("/");
}

function inspectCopyNamespace(namespace: LocalizationCopyNamespace) {
  const localeEntries = PUBLIC_LOCALES.map((locale) => {
    const value = namespace.load(locale);
    return {
      locale,
      keyPaths: flattenLeafPaths(value),
      invalidValues: findInvalidLocaleValues(namespace.id, locale, value),
    };
  });
  const canonicalKeys = localeEntries[0]?.keyPaths ?? [];
  const canonicalSet = new Set(canonicalKeys);
  const parityErrors = localeEntries
    .slice(1)
    .flatMap(({ locale, keyPaths }) => {
      const keys = new Set(keyPaths);
      return [
        ...canonicalKeys
          .filter((key) => !keys.has(key))
          .map((key) => `${namespace.id}:${locale}:missing:${key}`),
        ...keyPaths
          .filter((key) => !canonicalSet.has(key))
          .map((key) => `${namespace.id}:${locale}:extra:${key}`),
      ];
    });

  return {
    id: namespace.id,
    sourceFile: namespace.sourceFile,
    keyPaths: canonicalKeys,
    invalidValues: localeEntries.flatMap(({ invalidValues }) => invalidValues),
    parityErrors,
  };
}

function flattenLeafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      flattenLeafPaths(item, `${prefix}[${index}]`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) =>
        flattenLeafPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix || "$"].sort();
}

function findInvalidLocaleValues(
  namespaceId: string,
  locale: PublicLocale,
  value: unknown,
  prefix = "",
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findInvalidLocaleValues(namespaceId, locale, item, `${prefix}[${index}]`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) =>
        findInvalidLocaleValues(
          namespaceId,
          locale,
          child,
          prefix ? `${prefix}.${key}` : key,
        ),
    );
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return [`${namespaceId}:${locale}:${prefix || "$"}:empty`];
  }
  if (value === null || value === undefined) {
    return [`${namespaceId}:${locale}:${prefix || "$"}:missing`];
  }
  return [];
}

function jsxAttributeKind(attribute: string): LocalizationLiteralKind | null {
  if (attribute === "aria-label") return "aria-label";
  if (attribute === "aria-description") return "aria-description";
  if (attribute === "title") return "title";
  if (attribute === "placeholder") return "placeholder";
  if (attribute === "alt") return "alt";
  return null;
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function hasInlineLocaleMapAncestor(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isObjectLiteralExpression(current)) {
      const keys = new Set(
        current.properties.flatMap((property) => {
          if (!ts.isPropertyAssignment(property)) return [];
          const name = propertyNameText(property.name);
          return name ? [name] : [];
        }),
      );
      if (PUBLIC_LOCALES.every((locale) => keys.has(locale))) return true;
    }
    current = current.parent;
  }
  return false;
}

function normalizeLiteral(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function containsAuthoredLetters(value: string): boolean {
  return /\p{L}/u.test(value);
}

function literalKey(
  sourceFile: string,
  kind: LocalizationLiteralKind,
  value: string,
): string {
  return `${sourceFile}\u0000${kind}\u0000${value}`;
}

function redactLiteral(value: string): string {
  if (
    /https?:\/\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:token|secret|password)=/i.test(
      value,
    )
  ) {
    return `[redacted:${createHash("sha256").update(value).digest("hex").slice(0, 12)}]`;
  }
  return value;
}

function countValues(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
