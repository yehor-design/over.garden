import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CORE_JOURNEY_SCENARIOS } from "@/lib/accessibility/core-journey-matrix";
import {
  LOCALIZATION_DOWNSTREAM_UI_GATES,
  LOCALIZATION_OWNER_BROWSER_PROBES,
} from "@/lib/localization/localization-browser-matrix";
import {
  assertLocalizationCoverage,
  buildLocalizationCoverage,
  LOCALIZATION_AUTHORED_LITERAL_ALLOWLIST,
  LOCALIZATION_COPY_NAMESPACES,
  LOCALIZATION_ROUTE_REGISTRY,
  scanAuthoredLocalizationSources,
  validateLocalizationAllowlist,
} from "./localization-coverage";

const ZERO_GAP_MISSING = {
  unregisteredSurfaceModules: [],
  staleSurfaceRegistrations: [],
  duplicateSurfaceRegistrations: [],
  invalidSurfaceRegistrations: [],
  missingRequiredSurfaceKinds: [],
  invalidRenderedProfiles: [],
  invalidDownstreamUiGates: [],
  copyLocaleValues: [],
  copyKeyParity: [],
  authoredLiterals: [],
  invalidAllowlistEntries: [],
  requiredStates: [],
  ownerViewportProof: [],
  ownerScenarioProof: [],
  deltaEvidence: [],
  unsafeEvidence: [],
};

describe("OVE-205 market-first localization coverage", () => {
  it("produces one schema-v3 zero-regression-gap inventory across app states and raw lifecycle renderers", () => {
    const report = buildLocalizationCoverage();

    expect(() => assertLocalizationCoverage(report)).not.toThrow();
    expect(report).toMatchObject({
      schemaVersion: 3,
      issue: "OVE-205",
      evidenceClass: "local-deterministic-market-localization",
      baseline: {
        version: "ove205-v3",
        preservedBaseline: "ove171-v1",
        locales: ["uk", "bg", "ru"],
      },
      marketContract: {
        resolutionSources: ["route", "country", "persisted", "fallback"],
        fallbackMarket: "ukraine",
        markets: [
          {
            market: "ukraine",
            allowedLocales: ["uk"],
            defaultLocale: "uk",
            expectedLanguageControlCount: 0,
          },
          {
            market: "bulgaria",
            allowedLocales: ["bg", "ru"],
            defaultLocale: "bg",
            expectedLanguageControlCount: 1,
          },
        ],
      },
      summary: {
        routeModuleCount: 102,
        classifiedRouteModuleCount: 102,
        appSurfaceModuleCount: 136,
        classifiedAppSurfaceModuleCount: 136,
        registeredSurfaceCount: 140,
        renderedRouteModuleCount: 62,
        renderedSurfaceCount: 100,
        renderedStateModuleCount: 34,
        rawLifecycleRendererCount: 4,
        globalErrorModuleCount: 1,
        copyNamespaceCount: LOCALIZATION_COPY_NAMESPACES.length,
        localeCount: 3,
        ownerBrowserProbeCount: 15,
        preservedRouteModuleCount: 90,
        newlyClosedDeltaRouteModuleCount: 10,
        ove205CorrectiveSurfaceCount: 40,
        downstreamOwnedUiGateCount: 3,
      },
    });
    expect(report.baseline.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.missing).toEqual(ZERO_GAP_MISSING);
  });

  it("fails closed for new unregistered page, state, global-error, and raw renderer modules", () => {
    const discoveredSurfaceModules = LOCALIZATION_ROUTE_REGISTRY.map(
      ({ sourceFile }) => sourceFile,
    );
    const additions = [
      "src/app/new-surface/page.tsx",
      "src/app/new-surface/loading.tsx",
      "src/app/new-surface/error.tsx",
      "src/app/new-surface/global-error.tsx",
      "src/lib/new-public-lifecycle.ts",
    ];
    const report = buildLocalizationCoverage({
      discoveredSurfaceModules: [...discoveredSurfaceModules, ...additions],
    });

    expect(report.missing.unregisteredSurfaceModules).toEqual(
      [...additions].sort((left, right) => left.localeCompare(right)),
    );
    expect(() => assertLocalizationCoverage(report)).toThrow(
      /unregisteredSurfaceModules:src\/app\/new-surface\/global-error\.tsx/,
    );
  });

  it("fails closed for stale registrations and a missing required global-error kind", () => {
    const discoveredSurfaceModules = LOCALIZATION_ROUTE_REGISTRY.map(
      ({ sourceFile }) => sourceFile,
    ).filter((sourceFile) => sourceFile !== "src/app/global-error.tsx");
    const report = buildLocalizationCoverage({ discoveredSurfaceModules });

    expect(report.missing.staleSurfaceRegistrations).toContain(
      "src/app/global-error.tsx",
    );
    expect(report.missing.missingRequiredSurfaceKinds).toContain(
      "global-error",
    );
    expect(() => assertLocalizationCoverage(report)).toThrow(
      /missingRequiredSurfaceKinds:global-error/,
    );
  });

  it("rejects rendered modules disguised as APIs and api endpoints disguised as UI", () => {
    const routeRegistry = LOCALIZATION_ROUTE_REGISTRY.map((registration) => {
      if (registration.sourceFile === "src/app/page.tsx") {
        return {
          ...registration,
          classification: "api-non-ui" as const,
          owner: "non-ui" as const,
          renderedProfile: null,
        };
      }
      if (registration.sourceFile === "src/app/api/interface/locale/route.ts") {
        return {
          ...registration,
          classification: "public-localized" as const,
          owner: "public-shell" as const,
        };
      }
      return registration;
    });
    const report = buildLocalizationCoverage({ routeRegistry });

    expect(report.missing.invalidSurfaceRegistrations).toEqual(
      expect.arrayContaining([
        "src/app/page.tsx:api-owner",
        "src/app/page.tsx:page-classified-as-api",
        "src/app/api/interface/locale/route.ts:handler-classified-as-rendered",
      ]),
    );
    expect(report.missing.invalidRenderedProfiles).toContain(
      "src/app/api/interface/locale/route.ts:missing-rendered-profile",
    );
  });

  it("rejects missing, stale-policy, and invalid-control rendered profiles", () => {
    const routeRegistry = LOCALIZATION_ROUTE_REGISTRY.map((registration) => {
      if (registration.sourceFile === "src/app/page.tsx") {
        return { ...registration, renderedProfile: null };
      }
      if (registration.sourceFile === "src/app/garden/page.tsx") {
        return {
          ...registration,
          renderedProfile: registration.renderedProfile
            ? {
                ...registration.renderedProfile,
                routePolicyId: "stale-policy-id",
              }
            : null,
        };
      }
      if (registration.sourceFile === "src/app/feed/page.tsx") {
        return {
          ...registration,
          renderedProfile: registration.renderedProfile
            ? {
                ...registration.renderedProfile,
                bulgariaControl: {
                  expectedCount: 2 as never,
                  ownerId: "site-shell-interface-language-control" as const,
                },
              }
            : null,
        };
      }
      return registration;
    });
    const report = buildLocalizationCoverage({ routeRegistry });

    expect(report.missing.invalidRenderedProfiles).toEqual(
      expect.arrayContaining([
        "src/app/page.tsx:missing-rendered-profile",
        "src/app/garden/page.tsx:route-policy-id",
        "src/app/feed/page.tsx:bulgaria-control",
      ]),
    );
  });

  it("binds every rendered profile to central market and route-policy IDs", () => {
    const report = buildLocalizationCoverage();
    const journals = report.surfaces.find(
      ({ sourceFile }) => sourceFile === "src/app/journals/page.tsx",
    );
    const garden = report.surfaces.find(
      ({ sourceFile }) => sourceFile === "src/app/garden/page.tsx",
    );
    const rawJournal = report.surfaces.find(
      ({ sourceFile }) =>
        sourceFile === "src/lib/public-journal-entry-lifecycle.ts",
    );

    expect(journals?.renderedProfile).toMatchObject({
      routePolicyId: "public-journal-directory",
      switchMode: "localized-link",
      allowedLocalesByMarket: { ukraine: ["uk"], bulgaria: ["bg", "ru"] },
      defaultLocaleByMarket: { ukraine: "uk", bulgaria: "bg" },
    });
    expect(garden?.renderedProfile).toMatchObject({
      routePolicyId: "canonical-unprefixed-product-route",
      switchMode: "same-path-preference",
      dirtyPolicyId: "shared-locale-change-coordinator",
      dirtyParticipantIds: ["owner-composer-drafts"],
    });
    expect(rawJournal?.renderedProfile).toMatchObject({
      routePolicyId: "public-journal-detail",
      bulgariaControl: {
        expectedCount: 1,
        ownerId: "raw-lifecycle-interface-language-control",
      },
      rawVariants: ["journal-not-found-html", "journal-gone-html"],
    });
  });

  it("registers both interface endpoints as non-UI and all raw renderer modules explicitly", () => {
    const report = buildLocalizationCoverage();
    const endpointSources = [
      "src/app/api/interface/context/route.ts",
      "src/app/api/interface/locale/route.ts",
    ];

    for (const sourceFile of endpointSources) {
      expect(
        report.surfaces.find((surface) => surface.sourceFile === sourceFile),
      ).toMatchObject({
        surfaceKind: "route-handler",
        classification: "api-non-ui",
        owner: "non-ui",
        renderedProfile: null,
      });
    }
    expect(report.rawLifecycleContract).toEqual({
      rendererModules: [
        "src/lib/public-community-lifecycle.ts",
        "src/lib/public-profile-lifecycle.ts",
        "src/lib/public-object-passport-lifecycle.ts",
        "src/lib/public-journal-entry-lifecycle.ts",
      ],
      supportModules: ["src/lib/public-lifecycle-document.ts"],
      controlOwnerId: "raw-lifecycle-interface-language-control",
    });
  });

  it("records OVE-202, OVE-206, and OVE-207 as browser-backed composer gates", () => {
    const report = buildLocalizationCoverage();

    expect(report.downstreamOwnedUiGates).toEqual(
      LOCALIZATION_DOWNSTREAM_UI_GATES.map((gate) => ({
        ...gate,
        requiredStates: [...gate.requiredStates],
      })),
    );
    expect(report.downstreamOwnedUiGates[0]).toEqual(
      expect.objectContaining({
        issue: "OVE-202",
        status: "browser-backed",
        browserScenarioId: "editor-clean-locale-transition",
        proofOwner: "OVE-202",
        blocksCurrentIssue: false,
      }),
    );
    expect(report.downstreamOwnedUiGates[1]).toEqual(
      expect.objectContaining({
        issue: "OVE-206",
        status: "browser-backed",
        browserScenarioId: "pointer-commit-immediate-transition",
        proofOwner: "OVE-206",
        blocksCurrentIssue: false,
      }),
    );
    expect(report.downstreamOwnedUiGates[2]).toEqual(
      expect.objectContaining({
        issue: "OVE-207",
        browserScenarioId: "locale-transition-with-cover",
        status: "browser-backed",
        proofOwner: "OVE-207",
        blocksCurrentIssue: false,
      }),
    );

    const invalidDownstreamUiGates = LOCALIZATION_DOWNSTREAM_UI_GATES.map(
      (gate, index) =>
        index === 2
          ? {
              ...gate,
              status: "downstream-owned-real-ui" as const,
              browserScenarioId: null,
              proofOwner: "owning-downstream-slice" as const,
            }
          : gate,
    );
    const invalidReport = buildLocalizationCoverage({
      downstreamUiGates: invalidDownstreamUiGates as never,
    });
    expect(invalidReport.missing.invalidDownstreamUiGates).toContain(
      "separate-cover:status",
    );

    const incompleteStateGates = LOCALIZATION_DOWNSTREAM_UI_GATES.map(
      (gate, index) =>
        index === 0 ? { ...gate, requiredStates: ["placeholder-only"] } : gate,
    );
    const incompleteStateReport = buildLocalizationCoverage({
      downstreamUiGates: incompleteStateGates as never,
    });
    expect(incompleteStateReport.missing.invalidDownstreamUiGates).toContain(
      "structured-editor-and-inline-photos:required-states",
    );
  });

  it("fails when a shipped namespace loses a locale or translated key", () => {
    const firstNamespace = LOCALIZATION_COPY_NAMESPACES[0];
    const report = buildLocalizationCoverage({
      copyNamespaces: [
        {
          ...firstNamespace,
          load: (locale) => {
            const copy = firstNamespace.load(locale) as Record<string, unknown>;
            if (locale === "ru") return {};
            return copy;
          },
        },
        ...LOCALIZATION_COPY_NAMESPACES.slice(1),
      ],
    });

    expect(report.missing.copyKeyParity).toEqual(
      expect.arrayContaining([expect.stringMatching(/^interface:ru:/)]),
    );
    expect(() => assertLocalizationCoverage(report)).toThrow(
      /copyKeyParity:interface:ru:/,
    );
  });

  it("detects direct authored UI copy without blanket language grep", () => {
    const findings = scanAuthoredLocalizationSources(
      [
        {
          sourceFile: "src/app/new-surface/page.tsx",
          source: `export default function Page() {
            return <main aria-label="Direct label"><h1>Direct heading</h1></main>;
          }`,
        },
      ],
      [],
    );

    expect(findings).toEqual([
      expect.stringContaining("aria-label:Direct label"),
      expect.stringContaining("jsx-text:Direct heading"),
    ]);
  });

  it("rejects broad or unreasoned literal exclusions", () => {
    expect(
      validateLocalizationAllowlist([
        {
          sourceFile: "src/app/**",
          kind: "jsx-text",
          value: "English text",
          reason: "other" as never,
          rationale: "Temporary.",
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("wildcard-source"),
        expect.stringContaining("unsupported-reason"),
      ]),
    );
    expect(
      validateLocalizationAllowlist(LOCALIZATION_AUTHORED_LITERAL_ALLOWLIST),
    ).toEqual([]);
  });

  it("fails when required state or owner/browser proof disappears", () => {
    const scenariosWithoutConnectionRequired = CORE_JOURNEY_SCENARIOS.filter(
      ({ states }) => !states.includes("connection-required"),
    );
    const report = buildLocalizationCoverage({
      scenarios: scenariosWithoutConnectionRequired,
    });
    expect(report.missing.requiredStates).toContain("connection-required");

    const reportWithoutOperatorProof = buildLocalizationCoverage({
      browserProbes: LOCALIZATION_OWNER_BROWSER_PROBES.filter(
        ({ owner }) => owner !== "operator",
      ),
    });
    expect(reportWithoutOperatorProof.missing.ownerViewportProof).toContain(
      "operator:missing-browser-probe",
    );

    const reportWithoutRawJournalProof = buildLocalizationCoverage({
      browserProbes: LOCALIZATION_OWNER_BROWSER_PROBES.filter(
        ({ id }) => id !== "raw-journal-gone",
      ),
    });
    expect(reportWithoutRawJournalProof.missing.ownerViewportProof).toContain(
      "src/lib/public-journal-entry-lifecycle.ts:missing-raw-browser-probe",
    );
  });

  it("binds schema-v3 checks to package scripts and CI", () => {
    const webRoot = process.cwd();
    const repoRoot = path.resolve(webRoot, "../..");
    const packageJson = JSON.parse(
      readFileSync(path.join(webRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const ci = readFileSync(
      path.join(repoRoot, ".github/workflows/ci.yml"),
      "utf8",
    );
    const reportScript = readFileSync(
      path.join(webRoot, "scripts/report-localization-coverage.ts"),
      "utf8",
    );

    expect(packageJson.scripts["localization:coverage:check"]).toMatch(
      /report-localization-coverage/,
    );
    expect(packageJson.scripts["localization:coverage:report"]).toMatch(
      /report-localization-coverage/,
    );
    expect(packageJson.scripts["localization:coverage:browser"]).toBe(
      packageJson.scripts["test:a11y"],
    );
    expect(ci).toContain("pnpm localization:coverage:check");
    expect(reportScript).toContain("buildLocalizationCoverage");
    expect(reportScript).toContain("assertLocalizationCoverage");
  });
});
