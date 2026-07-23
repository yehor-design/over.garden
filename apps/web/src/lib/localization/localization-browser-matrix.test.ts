import { describe, expect, it } from "vitest";

import {
  browserSafeFixturePath,
  CORE_JOURNEY_SCENARIOS,
} from "@/lib/accessibility/core-journey-matrix";
import { getInterfaceRoutePolicy } from "@/lib/interface-route-policy";
import {
  LOCALIZATION_DOWNSTREAM_UI_GATES,
  LOCALIZATION_OWNER_BROWSER_PROBES,
  LOCALIZATION_RENDERED_OWNER_IDS,
  resolveLocalizationBrowserMarketCase,
} from "./localization-browser-matrix";

describe("OVE-205 localization browser matrix", () => {
  it("covers every rendered owner at mobile and desktop with all market cases", () => {
    const scenarioIds = new Set(CORE_JOURNEY_SCENARIOS.map(({ id }) => id));

    for (const owner of LOCALIZATION_RENDERED_OWNER_IDS) {
      const probes = LOCALIZATION_OWNER_BROWSER_PROBES.filter(
        (probe) => probe.owner === owner,
      );
      expect(probes.length).toBeGreaterThan(0);
      expect(
        probes.some(({ viewportIds }) => viewportIds.includes("mobile-320")),
      ).toBe(true);
      expect(
        probes.some(({ viewportIds }) => viewportIds.includes("desktop-1440")),
      ).toBe(true);
    }

    for (const probe of LOCALIZATION_OWNER_BROWSER_PROBES) {
      expect(probe.marketCases).toEqual([
        "ukraine-uk-zero-control",
        "bulgaria-bg-exactly-one-control",
        "bulgaria-ru-exactly-one-control",
      ]);
      expect(probe.expectedControlCountByMarket).toEqual({
        ukraine: 0,
        bulgaria: 1,
      });
      expect(probe.evidenceStatus).toBe("browser-run-required");
      if (probe.scenarioId)
        expect(scenarioIds.has(probe.scenarioId)).toBe(true);
      else expect(probe.explicitPath).toBeTruthy();

      const scenario = probe.scenarioId
        ? CORE_JOURNEY_SCENARIOS.find(({ id }) => id === probe.scenarioId)
        : null;
      let path = probe.explicitPath
        ? browserSafeFixturePath(probe.explicitPath)
        : browserSafeFixturePath(scenario!.path);
      if (probe.pathTransform === "community-moderation") {
        const parsed = new URL(path, "https://over.garden");
        parsed.pathname = `/admin${parsed.pathname}`;
        path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      expect(
        getInterfaceRoutePolicy(new URL(path, "https://over.garden").pathname)
          .mode,
      ).not.toBe("non-ui");
    }
  });

  it("binds each raw lifecycle renderer to a dedicated probe and control owner", () => {
    const expected = [
      "src/lib/public-community-lifecycle.ts",
      "src/lib/public-profile-lifecycle.ts",
      "src/lib/public-object-passport-lifecycle.ts",
      "src/lib/public-journal-entry-lifecycle.ts",
    ];
    const rawProbes = LOCALIZATION_OWNER_BROWSER_PROBES.filter(
      ({ sourceFiles }) => sourceFiles.length > 0,
    );

    expect(rawProbes.flatMap(({ sourceFiles }) => sourceFiles).sort()).toEqual(
      expected.sort(),
    );
    expect(
      rawProbes.every(
        ({ controlOwnerId, expectedStatus, runAxe }) =>
          controlOwnerId === "raw-lifecycle-interface-language-control" &&
          (expectedStatus === 404 || expectedStatus === 410) &&
          runAxe === true,
      ),
    ).toBe(true);
    for (const scenarioId of [
      "passport:public-unpublished",
      "journal-entry:gone-410",
    ]) {
      const probes = LOCALIZATION_OWNER_BROWSER_PROBES.filter(
        (probe) => probe.scenarioId === scenarioId,
      );
      expect(probes).toHaveLength(1);
      expect(probes[0]?.controlOwnerId).toBe(
        "raw-lifecycle-interface-language-control",
      );
    }
  });

  it("proves Bulgaria default without a valid bg cookie and keeps route intent authoritative", () => {
    const samePathDefault = resolveLocalizationBrowserMarketCase(
      "bulgaria-bg-exactly-one-control",
      "same-path-preference",
    );
    expect(samePathDefault).toMatchObject({
      market: "bulgaria",
      locale: "bg",
      routeLocale: null,
      countryCode: "BG",
      acceptLanguage: "ru",
      persistedMarket: "ukraine",
      persistedLocale: "uk",
      expectedMarketSource: "country",
      expectedControlCount: 1,
    });

    expect(
      resolveLocalizationBrowserMarketCase(
        "bulgaria-ru-exactly-one-control",
        "same-path-preference",
      ),
    ).toMatchObject({
      locale: "ru",
      routeLocale: null,
      countryCode: "BG",
      persistedLocale: "ru",
      expectedMarketSource: "country",
    });

    expect(
      resolveLocalizationBrowserMarketCase(
        "bulgaria-bg-exactly-one-control",
        "localized-link",
      ),
    ).toMatchObject({
      locale: "bg",
      routeLocale: "bg",
      countryCode: "UA",
      persistedLocale: "ru",
      expectedMarketSource: "route",
    });
    expect(
      resolveLocalizationBrowserMarketCase(
        "bulgaria-ru-exactly-one-control",
        "localized-link",
      ),
    ).toMatchObject({
      locale: "ru",
      routeLocale: "ru",
      countryCode: "UA",
      persistedLocale: "bg",
      expectedMarketSource: "route",
    });
  });

  it("marks OVE-202 browser-backed while OVE-206/207 stay downstream-owned", () => {
    expect(LOCALIZATION_DOWNSTREAM_UI_GATES).toHaveLength(3);
    expect(LOCALIZATION_DOWNSTREAM_UI_GATES.map(({ issue }) => issue)).toEqual([
      "OVE-202",
      "OVE-206",
      "OVE-207",
    ]);
    expect(LOCALIZATION_DOWNSTREAM_UI_GATES[0]).toEqual(
      expect.objectContaining({
        id: "structured-editor-and-inline-photos",
        issue: "OVE-202",
        status: "browser-backed",
        browserScenarioId: "editor-clean-locale-transition",
        proofOwner: "OVE-202",
        adapterContract: "owner-composer-drafts",
        blocksCurrentIssue: false,
      }),
    );
    expect(
      LOCALIZATION_DOWNSTREAM_UI_GATES.slice(1).every(
        ({
          adapterContract,
          browserScenarioId,
          proofOwner,
          status,
          blocksCurrentIssue,
        }) =>
          adapterContract === "owner-composer-drafts" &&
          browserScenarioId === null &&
          proofOwner === "owning-downstream-slice" &&
          status === "downstream-owned-real-ui" &&
          blocksCurrentIssue === false,
      ),
    ).toBe(true);
    expect(LOCALIZATION_DOWNSTREAM_UI_GATES).toEqual([
      expect.objectContaining({
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
      }),
      expect.objectContaining({
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
      }),
      expect.objectContaining({
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
      }),
    ]);
  });

  it("keeps probe IDs unique", () => {
    const ids = LOCALIZATION_OWNER_BROWSER_PROBES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
