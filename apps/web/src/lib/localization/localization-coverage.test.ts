import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CORE_JOURNEY_SCENARIOS } from "@/lib/accessibility/core-journey-matrix";
import { LOCALIZATION_OWNER_BROWSER_PROBES } from "@/lib/localization/localization-browser-matrix";
import {
  assertLocalizationCoverage,
  buildLocalizationCoverage,
  LOCALIZATION_AUTHORED_LITERAL_ALLOWLIST,
  LOCALIZATION_COPY_NAMESPACES,
  LOCALIZATION_ROUTE_REGISTRY,
  scanAuthoredLocalizationSources,
  validateLocalizationAllowlist,
} from "./localization-coverage";

describe("OVE-171 localization completion coverage", () => {
  it("produces one zero-gap report for every current route and selected locale", () => {
    const report = buildLocalizationCoverage();

    expect(() => assertLocalizationCoverage(report)).not.toThrow();
    expect(report.issue).toBe("OVE-171");
    expect(report.baseline).toMatchObject({
      version: "ove171-v1",
      locales: ["uk", "bg", "ru"],
    });
    expect(report.baseline.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.summary).toMatchObject({
      routeModuleCount: 92,
      classifiedRouteModuleCount: 92,
      copyNamespaceCount: LOCALIZATION_COPY_NAMESPACES.length,
      localeCount: 3,
      preservedRouteModuleCount: 82,
      newlyClosedDeltaRouteModuleCount: 10,
    });
    expect(report.closedDeltas).toHaveLength(6);
    expect(
      report.routes.filter(
        ({ coverageDisposition }) =>
          coverageDisposition === "ove171-closed-delta",
      ),
    ).toHaveLength(10);
    expect(report.missing).toEqual({
      unregisteredRouteModules: [],
      staleRouteRegistrations: [],
      duplicateRouteRegistrations: [],
      invalidRouteRegistrations: [],
      copyLocaleValues: [],
      copyKeyParity: [],
      authoredLiterals: [],
      invalidAllowlistEntries: [],
      requiredStates: [],
      ownerViewportProof: [],
      ownerScenarioProof: [],
      deltaEvidence: [],
      unsafeEvidence: [],
    });
  });

  it("fails closed when a new page is not explicitly classified", () => {
    const report = buildLocalizationCoverage({
      discoveredRouteModules: [
        ...LOCALIZATION_ROUTE_REGISTRY.map(({ sourceFile }) => sourceFile),
        "src/app/new-surface/page.tsx",
      ],
    });

    expect(report.missing.unregisteredRouteModules).toEqual([
      "src/app/new-surface/page.tsx",
    ]);
    expect(() => assertLocalizationCoverage(report)).toThrow(
      /unregisteredRouteModules:src\/app\/new-surface\/page\.tsx/,
    );
  });

  it("fails when any shipped namespace loses a locale or a translated key", () => {
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

  it("fails when required edge-state or 320/1440 owner proof disappears", () => {
    const scenariosWithoutOffline = CORE_JOURNEY_SCENARIOS.filter(
      ({ states }) => !states.includes("offline"),
    );
    const report = buildLocalizationCoverage({
      scenarios: scenariosWithoutOffline,
    });

    expect(report.missing.requiredStates).toContain("offline");
    expect(() => assertLocalizationCoverage(report)).toThrow(
      /requiredStates:offline/,
    );

    const reportWithoutOperatorProof = buildLocalizationCoverage({
      browserProbes: LOCALIZATION_OWNER_BROWSER_PROBES.filter(
        ({ owner }) => owner !== "operator",
      ),
    });
    expect(reportWithoutOperatorProof.missing.ownerViewportProof).toContain(
      "operator:missing-browser-probe",
    );

    const reportWithoutUnauthorizedProof = buildLocalizationCoverage({
      browserProbes: LOCALIZATION_OWNER_BROWSER_PROBES.filter(
        ({ stateClasses }) => !stateClasses.includes("unauthorized"),
      ),
    });
    expect(reportWithoutUnauthorizedProof.missing.requiredStates).toContain(
      "unauthorized",
    );
  });

  it("rejects a rendered page disguised as a non-UI route", () => {
    const routeRegistry = LOCALIZATION_ROUTE_REGISTRY.map((registration) =>
      registration.sourceFile === "src/app/page.tsx"
        ? {
            ...registration,
            classification: "api-non-ui" as const,
            owner: "non-ui" as const,
          }
        : registration,
    );
    const report = buildLocalizationCoverage({ routeRegistry });

    expect(report.missing.invalidRouteRegistrations).toEqual(
      expect.arrayContaining([
        "src/app/page.tsx:api-owner",
        "src/app/page.tsx:page-classified-as-api",
      ]),
    );
    expect(() => assertLocalizationCoverage(report)).toThrow(
      /invalidRouteRegistrations:src\/app\/page\.tsx/,
    );
  });

  it("binds the deterministic gate to scripts, CI, browser proof, and contributor workflow", () => {
    const webRoot = process.cwd();
    const repoRoot = path.resolve(webRoot, "../..");
    const packageJson = JSON.parse(
      readFileSync(path.join(webRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const ci = readFileSync(
      path.join(repoRoot, ".github/workflows/ci.yml"),
      "utf8",
    );
    const browserRunner = readFileSync(
      path.join(webRoot, "scripts/verify-responsive-accessibility.ts"),
      "utf8",
    );
    const workflow = readFileSync(
      path.join(repoRoot, "docs/LOCALIZATION_COVERAGE_WORKFLOW.md"),
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
    expect(browserRunner).toContain('headers()["content-language"]');
    expect(browserRunner).toContain("runLocaleContinuityCheck");
    expect(browserRunner).toContain("runLocalizationOwnerProbeMatrix");
    expect(workflow).toContain("pnpm localization:coverage:check");
    expect(workflow).toContain("new page");
  });
});
