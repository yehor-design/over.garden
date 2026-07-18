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
  LOCALIZATION_RENDERED_OWNER_IDS,
  LOCALIZATION_REQUIRED_BROWSER_STATES,
  type LocalizationOwnerBrowserProbe,
  type LocalizationRenderedOwnerId,
} from "@/lib/localization/localization-browser-matrix";
import { getCommunityCopy } from "@/lib/community-copy";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
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

export interface LocalizationRouteRegistration {
  sourceFile: string;
  routePattern: string;
  classification: LocalizationRouteClassification;
  owner: LocalizationOwnerId;
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
  | "ove171-closed-delta";

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
    proof: "13 fail-closed probes at 320px and 1440px",
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
    copyNamespaces: ["garden-workspace", "garden-regions", "public-profile"],
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

function route(
  sourceFile: string,
  classification: LocalizationRouteClassification,
  owner: LocalizationOwnerId,
): LocalizationRouteRegistration {
  return {
    sourceFile,
    routePattern:
      sourceFile
        .replace(/^src\/app/, "")
        .replace(/\/(?:page\.tsx|route\.ts)$/, "")
        .replaceAll("%5F", "_") || "/",
    classification,
    owner,
  };
}

function routes(
  sourceFiles: readonly string[],
  classification: LocalizationRouteClassification,
  owner: LocalizationOwnerId,
) {
  return sourceFiles.map((sourceFile) =>
    route(sourceFile, classification, owner),
  );
}

export const LOCALIZATION_ROUTE_REGISTRY: readonly LocalizationRouteRegistration[] =
  [
    ...routes(
      [
        "src/app/%5F%5Fvisual-fixtures/intent/[scenarioId]/route.ts",
        "src/app/%5F%5Fvisual-fixtures/page.tsx",
        "src/app/skeleton/page.tsx",
      ],
      "internal-fixture",
      "internal-fixture",
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
      ["src/app/garden/page.tsx", "src/app/garden/profile/page.tsx"],
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
    ...routes(
      [
        "src/app/api/%5F%5Fvisual-fixtures/journal-creation/route.ts",
        "src/app/api/auth/[...all]/route.ts",
        "src/app/api/engagement/bookmarks/route.ts",
        "src/app/api/engagement/comments/block/route.ts",
        "src/app/api/engagement/comments/delete/route.ts",
        "src/app/api/engagement/comments/report/route.ts",
        "src/app/api/engagement/comments/route.ts",
        "src/app/api/engagement/follows/route.ts",
        "src/app/api/engagement/likes/route.ts",
        "src/app/api/garden/catalog/typeahead/route.ts",
        "src/app/api/garden/entries/route.ts",
        "src/app/api/garden/mentions/typeahead/route.ts",
        "src/app/api/garden/value-pulse/route.ts",
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
        [
          "jsx-text",
          "No authenticated session. Use the canonical",
        ],
        ["jsx-text", "garden sign-in flow"],
        ["jsx-text", ", then return to this local diagnostic."],
        ["jsx-text", "SSR readback"],
        ["jsx-text", "No entries yet."],
      ],
    ),
  ];

export interface LocalizationCoverageReport {
  schemaVersion: 1;
  issue: "OVE-171";
  evidenceClass: "local-deterministic-localization";
  baseline: {
    version: "ove171-v1";
    hash: string;
    locales: PublicLocale[];
    fixtureVersion: string;
    fixtureManifestHash: string;
  };
  summary: {
    routeModuleCount: number;
    classifiedRouteModuleCount: number;
    renderedRouteModuleCount: number;
    copyNamespaceCount: number;
    localeCount: number;
    authoredSourceCount: number;
    exclusionCount: number;
    scenarioCount: number;
    ownerBrowserProbeCount: number;
    preservedRouteModuleCount: number;
    newlyClosedDeltaRouteModuleCount: number;
  };
  routes: Array<
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
    unregisteredRouteModules: string[];
    staleRouteRegistrations: string[];
    duplicateRouteRegistrations: string[];
    invalidRouteRegistrations: string[];
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
  discoveredRouteModules?: readonly string[];
  routeRegistry?: readonly LocalizationRouteRegistration[];
  copyNamespaces?: readonly LocalizationCopyNamespace[];
  authoredSources?: readonly LocalizationAuthoredSource[];
  allowlist?: readonly LocalizationLiteralAllowlistEntry[];
  scenarios?: readonly CoreJourneyScenario[];
  browserProbes?: readonly LocalizationOwnerBrowserProbe[];
}

export function buildLocalizationCoverage(
  options: BuildLocalizationCoverageOptions = {},
): LocalizationCoverageReport {
  const webRoot = resolveWebRoot();
  const routeRegistry = options.routeRegistry ?? LOCALIZATION_ROUTE_REGISTRY;
  const discoveredRouteModules =
    options.discoveredRouteModules ?? discoverRouteModules(webRoot);
  const copyNamespaces = options.copyNamespaces ?? LOCALIZATION_COPY_NAMESPACES;
  const authoredSources =
    options.authoredSources ?? discoverAuthoredSources(webRoot);
  const allowlist =
    options.allowlist ?? LOCALIZATION_AUTHORED_LITERAL_ALLOWLIST;
  const scenarios = options.scenarios ?? CORE_JOURNEY_SCENARIOS;
  const browserProbes =
    options.browserProbes ?? LOCALIZATION_OWNER_BROWSER_PROBES;
  const discoveredRoutes = new Set(discoveredRouteModules);
  const registeredRoutes = new Set(
    routeRegistry.map(({ sourceFile }) => sourceFile),
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
  const renderedClassifications = new Set<LocalizationRouteClassification>([
    "public-localized",
    "signed-in-selected-locale",
    "explicit-operator-locale",
  ]);
  const nonRenderedClassifications = new Set<LocalizationRouteClassification>([
    "redirect-only",
    "api-non-ui",
    "internal-fixture",
  ]);
  const invalidRouteRegistrations = routeRegistry.flatMap((registration) => {
    const contract = LOCALIZATION_OWNER_CONTRACTS[registration.owner];
    const errors: string[] = [];
    const isPage = registration.sourceFile.endsWith("/page.tsx");
    const isRouteHandler = registration.sourceFile.endsWith("/route.ts");
    if (!contract) return [`${registration.sourceFile}:unknown-owner`];
    if (
      renderedClassifications.has(registration.classification) !==
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
      renderedClassifications.has(registration.classification)
    ) {
      errors.push(`${registration.sourceFile}:handler-classified-as-rendered`);
    }
    if (
      registration.classification === "api-non-ui" &&
      (registration.owner !== "non-ui" ||
        !registration.sourceFile.startsWith("src/app/api/"))
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
      return errors;
    }),
    ...[...probeCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => `${id}:duplicate-probe`),
  ];
  const browserStateClasses = new Set(
    browserProbes.flatMap(({ stateClasses }) => stateClasses),
  );
  const deltaCounts = countValues(OVE171_CLOSED_DELTAS.map(({ id }) => id));
  const deltaEvidence = [
    ...OVE171_CLOSED_DELTAS.flatMap(({ id, sourceFiles }) =>
      sourceFiles
        .filter((sourceFile) => !existsSync(path.join(webRoot, sourceFile)))
        .map((sourceFile) => `${id}:missing-source:${sourceFile}`),
    ),
    ...[...deltaCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => `${id}:duplicate-delta`),
    ...[...OVE171_NEWLY_CLOSED_ROUTE_MODULES]
      .filter((sourceFile) => !registeredRoutes.has(sourceFile))
      .map((sourceFile) => `unregistered-delta-route:${sourceFile}`),
  ];
  const unsafeEvidence = [
    ...routeRegistry.flatMap(({ sourceFile, routePattern }) => {
      const serialized = `${sourceFile} ${routePattern}`;
      return /https?:\/\/|@|[?&](?:token|secret|key)=|(?:latitude|longitude|coordinates)=/i.test(
        serialized,
      )
        ? [sourceFile]
        : [];
    }),
    ...browserProbes.flatMap(({ id, explicitPath }) =>
      explicitPath &&
      /https?:\/\/|@|[?&](?:token|secret|key)=|(?:latitude|longitude|coordinates)=/i.test(
        explicitPath,
      )
        ? [`browser-probe:${id}`]
        : [],
    ),
    ...OVE171_CLOSED_DELTAS.flatMap((delta) =>
      /https?:\/\/|@|[?&](?:token|secret|key)=|(?:latitude|longitude|coordinates)=/i.test(
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
  const baselineHash = createHash("sha256")
    .update(
      JSON.stringify({
        routes: routeRegistry,
        copyNamespaces: copyCoverage.map(({ id, keyPaths }) => ({
          id,
          keyPaths,
        })),
        owners: LOCALIZATION_OWNER_CONTRACTS,
        browserProbes,
        closedDeltas: OVE171_CLOSED_DELTAS,
        fixture: VISUAL_FIXTURE_MANIFEST_HASH,
      }),
    )
    .digest("hex");

  return {
    schemaVersion: 1,
    issue: "OVE-171",
    evidenceClass: "local-deterministic-localization",
    baseline: {
      version: "ove171-v1",
      hash: baselineHash,
      locales: [...PUBLIC_LOCALES],
      fixtureVersion: VISUAL_FIXTURE_MANIFEST.version,
      fixtureManifestHash: VISUAL_FIXTURE_MANIFEST_HASH,
    },
    summary: {
      routeModuleCount: discoveredRoutes.size,
      classifiedRouteModuleCount: routeRegistry.length,
      renderedRouteModuleCount: routeRegistry.filter(
        ({ owner }) => LOCALIZATION_OWNER_CONTRACTS[owner].rendered,
      ).length,
      copyNamespaceCount: copyNamespaces.length,
      localeCount: PUBLIC_LOCALES.length,
      authoredSourceCount: authoredSources.length,
      exclusionCount: allowlist.length,
      scenarioCount: scenarios.length,
      ownerBrowserProbeCount: browserProbes.length,
      preservedRouteModuleCount: routeRegistry.filter(
        ({ sourceFile }) => !OVE171_NEWLY_CLOSED_ROUTE_MODULES.has(sourceFile),
      ).length,
      newlyClosedDeltaRouteModuleCount: routeRegistry.filter(({ sourceFile }) =>
        OVE171_NEWLY_CLOSED_ROUTE_MODULES.has(sourceFile),
      ).length,
    },
    routes: routeRegistry.map((registration) => ({
      ...registration,
      coverageDisposition: OVE171_NEWLY_CLOSED_ROUTE_MODULES.has(
        registration.sourceFile,
      )
        ? "ove171-closed-delta"
        : "preserved-baseline",
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
    closedDeltas: OVE171_CLOSED_DELTAS.map((delta) => ({
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
      }) => ({
        id,
        owner,
        scenarioId,
        pathTransform,
        stateClasses: [...stateClasses],
        viewportIds: [...viewportIds],
        runAxe: runAxe ?? false,
      }),
    ),
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
      unregisteredRouteModules: uniqueSorted(
        [...discoveredRoutes].filter(
          (sourceFile) => !registeredRoutes.has(sourceFile),
        ),
      ),
      staleRouteRegistrations: uniqueSorted(
        [...registeredRoutes].filter(
          (sourceFile) => !discoveredRoutes.has(sourceFile),
        ),
      ),
      duplicateRouteRegistrations: [...routeCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([sourceFile]) => sourceFile)
        .sort(),
      invalidRouteRegistrations: uniqueSorted(invalidRouteRegistrations),
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
      `OVE-171 localization coverage is incomplete: ${failures.join(", ")}`,
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

function discoverRouteModules(webRoot: string): string[] {
  return walkFiles(path.join(webRoot, "src", "app"))
    .filter((filePath) => /\/(?:page\.tsx|route\.ts)$/.test(filePath))
    .map((filePath) => toWebRelativePath(webRoot, filePath))
    .sort();
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
