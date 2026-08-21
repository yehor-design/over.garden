import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  LOCALIZATION_DOWNSTREAM_UI_GATES,
  resolveLocalizationBrowserMarketCase,
} from "../src/lib/localization/localization-browser-matrix";
import {
  classifyBrowserRunnerError,
  hasInterfaceContextMetadataHint,
  localizationControlOwnerSelector,
  resolveLocalizationMarketCaseRoute,
  validateDocumentNavigationReferer,
  validateLocalizationControlContract,
  validateLocaleOnlyPreferenceMutation,
} from "./verify-responsive-accessibility";

describe("OVE-205 executable localization browser contract", () => {
  it("reads only the bounded interface-context meta from server HTML", () => {
    expect(
      hasInterfaceContextMetadataHint(
        '<!doctype html><html><head><meta content="bulgaria:bg" name="overgarden-interface-context"></head><body></body></html>',
        "bulgaria:bg",
      ),
    ).toBe(true);
    expect(
      hasInterfaceContextMetadataHint(
        '<head><meta name="overgarden-interface-context" content="ukraine:uk"></head>',
        "bulgaria:bg",
      ),
    ).toBe(false);
    expect(
      hasInterfaceContextMetadataHint(
        '<html><head></head><body><meta name="overgarden-interface-context" content="bulgaria:bg"></body></html>',
        "bulgaria:bg",
      ),
    ).toBe(false);
    expect(
      hasInterfaceContextMetadataHint(
        '<html><head><script>const fake = `<meta name="overgarden-interface-context" content="bulgaria:bg">`;</script></head><body></body></html>',
        "bulgaria:bg",
      ),
    ).toBe(false);
  });

  it("reduces browser exceptions to bounded classes without serializing URLs", () => {
    const secretUrl =
      "https://fixture.invalid/@private_handle?token=opaque-private-token";
    const timeout = new Error(`page.goto timed out at ${secretUrl}`);
    timeout.name = "TimeoutError";

    expect(classifyBrowserRunnerError(timeout)).toBe(
      "browser-operation-timeout",
    );
    expect(classifyBrowserRunnerError(new Error(secretUrl))).toBe(
      "browser-operation-failed",
    );
    expect(classifyBrowserRunnerError({ message: secretUrl })).toBe(
      "unknown-browser-operation-failure",
    );
    expect(classifyBrowserRunnerError(timeout)).not.toMatch(
      /private_handle|token|opaque|https|\?/,
    );
  });

  it("builds market-case routes without losing fixture state", () => {
    const ukraine = resolveLocalizationBrowserMarketCase(
      "ukraine-uk-zero-control",
      "localized-link",
    );
    const bulgaria = resolveLocalizationBrowserMarketCase(
      "bulgaria-bg-exactly-one-control",
      "localized-link",
    );
    const russian = resolveLocalizationBrowserMarketCase(
      "bulgaria-ru-exactly-one-control",
      "localized-link",
    );

    expect(
      resolveLocalizationMarketCaseRoute({
        route: "/ru/knowledge?__visualKnowledge=error#results",
        routeMode: "localized-link",
        plan: ukraine,
      }),
    ).toBe("/knowledge?__visualKnowledge=error#results");
    expect(
      resolveLocalizationMarketCaseRoute({
        route: "/knowledge?__visualKnowledge=error#results",
        routeMode: "localized-link",
        plan: bulgaria,
      }),
    ).toBe("/bg/knowledge?__visualKnowledge=error#results");
    expect(
      resolveLocalizationMarketCaseRoute({
        route: "/bg/knowledge?__visualKnowledge=error#results",
        routeMode: "localized-link",
        plan: russian,
      }),
    ).toBe("/ru/knowledge?__visualKnowledge=error#results");
    expect(
      resolveLocalizationMarketCaseRoute({
        route: "/ru/garden?visualWorkspace=connection-required#composer",
        routeMode: "same-path-preference",
        plan: russian,
      }),
    ).toBe("/garden?visualWorkspace=connection-required#composer");
  });

  it("counts only the declared shared control owner and fails duplicate/hidden controls", () => {
    expect(
      localizationControlOwnerSelector("site-shell-interface-language-control"),
    ).toContain(
      '[data-interface-language-control="site-shell-interface-language-control"]',
    );
    expect(
      localizationControlOwnerSelector(
        "raw-lifecycle-interface-language-control",
      ),
    ).toContain(
      '[data-interface-language-control-host="raw-lifecycle-interface-language-control"]',
    );

    expect(
      validateLocalizationControlContract({
        expectedControlCount: 1,
        totalControlCount: 1,
        ownerCount: 1,
        visibleOwnerCount: 1,
      }),
    ).toEqual([]);
    expect(
      validateLocalizationControlContract({
        expectedControlCount: 1,
        totalControlCount: 2,
        ownerCount: 2,
        visibleOwnerCount: 0,
      }),
    ).toEqual([
      "language-control-count:2:expected:1",
      "language-control-owner-count:2:expected:1",
      "language-control-visible-owner-count:0:expected:1",
    ]);
  });

  it("accepts only the bounded locale preference mutation", () => {
    expect(
      validateLocaleOnlyPreferenceMutation({
        method: "POST",
        url: "http://localhost:3000/api/interface/locale",
        postData: '{"locale":"ru"}',
        locale: "ru",
      }),
    ).toEqual([]);
    expect(
      validateLocaleOnlyPreferenceMutation({
        method: "POST",
        url: "http://localhost:3000/api/interface/locale?returnTo=%2Fadmin",
        postData: '{"locale":"ru","token":"private"}',
        locale: "ru",
      }),
    ).toEqual(["preference-endpoint-shape", "preference-body-not-locale-only"]);
  });

  it("rejects a Referer on the locale-triggered document navigation", () => {
    expect(
      validateDocumentNavigationReferer({
        isNavigationRequest: true,
        resourceType: "document",
        referer: null,
      }),
    ).toEqual([]);
    expect(
      validateDocumentNavigationReferer({
        isNavigationRequest: true,
        resourceType: "document",
        referer: "http://localhost:3000/garden?token=private#private-fragment",
      }),
    ).toEqual(["locale-navigation-referer-present"]);
    expect(
      validateDocumentNavigationReferer({
        isNavigationRequest: false,
        resourceType: "fetch",
        referer: null,
      }),
    ).toEqual(["locale-navigation-not-document"]);
  });

  it("reports downstream-owned browser proof without blocking OVE-205", () => {
    expect(LOCALIZATION_DOWNSTREAM_UI_GATES).toHaveLength(3);
    expect(LOCALIZATION_DOWNSTREAM_UI_GATES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "OVE-202",
          status: "browser-backed",
          browserScenarioId: "editor-clean-locale-transition",
          proofOwner: "OVE-202",
          blocksCurrentIssue: false,
        }),
        expect.objectContaining({
          issue: "OVE-206",
          status: "browser-backed",
          browserScenarioId: "pointer-commit-immediate-transition",
          proofOwner: "OVE-206",
          blocksCurrentIssue: false,
        }),
        expect.objectContaining({
          issue: "OVE-207",
          status: "browser-backed",
          browserScenarioId: "locale-transition-with-cover",
          proofOwner: "OVE-207",
          blocksCurrentIssue: false,
        }),
      ]),
    );
  });

  it("wires every declared market case into the real browser loop", async () => {
    const source = await readFile(
      new URL("./verify-responsive-accessibility.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("for (const marketCase of probe.marketCases)");
    expect(source).toContain("installLocalizationMarketCase(");
    expect(source).toContain("probe.expectedControlCountByMarket[plan.market]");
    expect(source).toContain("probe.controlOwnerId");
    expect(source).toContain("localizationMarketCookieFailures(");
    expect(source).toContain("assertDocumentNavigationRefererSuppressed(");
    expect(source).toContain(
      "interactionProofs.documentNavigationRefererSuppression =",
    );
    expect(source).toContain('["sign-in-submit", "sign-up-button"]');
    expect(source).toContain('status.waitFor({ state: "hidden"');
    expect(source).toContain("interactionProofs.inFlightSettlement = true");
    expect(source).toContain("runServerActionPendingLocalizationCheck");
    expect(source).toContain('actionHeaders["next-action"]');
    expect(source).toContain('data-interface-server-action-status="pending"');
    expect(source).toContain(
      "interactionProofs.serverActionPendingFence = true",
    );
    const pendingFenceArm = source.indexOf("const pendingFencePromise");
    const serverActionClick = source.indexOf(
      "await submit.click()",
      pendingFenceArm,
    );
    const actionHeadersRead = source.indexOf(
      "await actionRequest.allHeaders()",
      serverActionClick,
    );
    expect(pendingFenceArm).toBeGreaterThan(-1);
    expect(serverActionClick).toBeGreaterThan(pendingFenceArm);
    expect(actionHeadersRead).toBeGreaterThan(serverActionClick);
    expect(source).toContain('submit?.dataset.pending === "true"');
    expect(source).toContain("submit.disabled");
    expect(source).toContain("trigger?.disabled");
    expect(
      source.slice(
        actionHeadersRead,
        source.indexOf('data-interface-server-action-status="ready"'),
      ),
    ).not.toContain('getAttribute("data-pending")');

    const firstNavigationAttempt = source.indexOf(
      "for (let attempt = 0; attempt < 2; attempt += 1)",
    );
    const stalePageClose = source.indexOf(
      "await page.close().catch(() => undefined)",
      firstNavigationAttempt,
    );
    const freshPageRetry = source.indexOf(
      "page = await context.newPage()",
      stalePageClose,
    );
    const retryCookieReset = source.indexOf(
      "await context.clearCookies()",
      stalePageClose,
    );
    const retryListener = source.indexOf(
      "listenForPageErrors()",
      freshPageRetry,
    );
    expect(firstNavigationAttempt).toBeGreaterThan(-1);
    expect(stalePageClose).toBeGreaterThan(firstNavigationAttempt);
    expect(retryCookieReset).toBeGreaterThan(stalePageClose);
    expect(freshPageRetry).toBeGreaterThan(retryCookieReset);
    expect(retryListener).toBeGreaterThan(freshPageRetry);

    const ownerMatrixStart = source.indexOf(
      "async function runLocalizationOwnerProbeMatrix",
    );
    const ownerRetryAttempt = source.indexOf(
      "for (let attempt = 0; attempt < 2; attempt += 1)",
      ownerMatrixStart,
    );
    const ownerMarketSetup = source.indexOf(
      "await installLocalizationMarketCase(",
      ownerRetryAttempt,
    );
    const ownerTimedOutPageClose = source.indexOf(
      "await page.close().catch(() => undefined)",
      ownerMarketSetup,
    );
    const ownerFreshPage = source.indexOf(
      "page = await context.newPage()",
      ownerTimedOutPageClose,
    );
    const ownerRetryListener = source.indexOf(
      "listenForOwnerProbePageErrors()",
      ownerFreshPage,
    );
    expect(ownerRetryAttempt).toBeGreaterThan(ownerMatrixStart);
    expect(ownerMarketSetup).toBeGreaterThan(ownerRetryAttempt);
    expect(ownerTimedOutPageClose).toBeGreaterThan(ownerMarketSetup);
    expect(ownerFreshPage).toBeGreaterThan(ownerTimedOutPageClose);
    expect(ownerRetryListener).toBeGreaterThan(ownerFreshPage);
    expect(source).toContain('name: "Отхвърли и смени езика"');
    expect(source).toContain("PRIVATE_AUTH_COMPATIBILITY_NAME");
    expect(source).toContain("signUpPayload.name");
    expect(source).toContain("boundedEvidence.includes(value)");
    expect(source).toContain("interactionProofs.dirtyDiscard = true");
    expect(source).toContain("#token%3Dv1.secret");
    expect(source).toContain("internal-id-shaped-slugs");
    expect(source).toContain("private-id-path-segment");
    expect(source).toContain(
      '"/reset/00000000-0000-4000-8000-000000000001?token=private#main-content"',
    );
    expect(source).toContain(
      "interactionProofs.unsafeLocalizedStateRejected = true",
    );
    expect(source).toContain('"accept-language": plan.acceptLanguage');
    for (const interaction of [
      "runInterfaceLanguageMenuKeyboardCheck",
      "runLocalizedSafeStateContinuityCheck",
      "runNestedJournalReturnLocaleContinuityCheck",
      "runLocalizedUnsafeStateRejectionCheck",
      "runSamePathPreferencePersistenceCheck",
      "runRawLifecycleSamePathPreferenceCheck",
      "runRawLifecycleMenuKeyboardCheck",
      "runRawLifecycleActionReferrerCheck",
      "runSafeFlushFailureLocalizationCheck",
      "runGlobalErrorLocalizationCheck",
      "runGlobalErrorMetadataFallbackCheck",
      "runGenericNotFoundLocalizationCheck",
      "runMixedLocaleTopicCheck",
      "runLanguageControlReflowCheck",
      "runDirtyCancelLocalizationCheck",
      "runInFlightLocalizationCheck",
      "runServerActionPendingLocalizationCheck",
    ]) {
      expect(source).toContain(`await ${interaction}(browser, baseUrl)`);
    }
    expect(source).toContain(
      "downstreamOwnedBrowserProofs: LOCALIZATION_DOWNSTREAM_UI_GATES",
    );
    expect(source).toContain(
      "interactionProofs.rawSamePathPreferencePersistence =",
    );
    expect(source).toContain(
      'runRawLifecyclePreferenceRecoveryCheck(\n    browser,\n    baseUrl,\n    "ambiguous-commit"',
    );
    expect(source).toContain(
      'runRawLifecyclePreferenceRecoveryCheck(\n    browser,\n    baseUrl,\n    "request-timeout"',
    );
    expect(source).toContain(
      "interactionProofs.rawAmbiguousCommitRollback = true",
    );
    expect(source).toContain(
      "interactionProofs.rawRequestTimeoutRecovery = true",
    );
    expect(source).toContain(
      'runRawLifecyclePreferenceRecoveryCheck(\n    browser,\n    baseUrl,\n    "rollback-failure-retry"',
    );
    expect(source).toContain("interactionProofs.rawFailedRollbackRetry = true");
    expect(source).toContain(
      "interactionProofs.rawMenuKeyboardEscapeFocus = true",
    );
    expect(source).toContain(
      "interactionProofs.rawActionReferrerSuppression = true",
    );
    expect(source).toContain(
      "interactionProofs.globalErrorMetadataFallback = true",
    );
    expect(source).not.toContain(
      "error instanceof Error ? error.message : String(error)",
    );
    expect(source).toContain("postInteractionDocumentRequestCount !== 0");
    expect(source).toContain("status?.textContent === failureMessage");
    expect(source).toContain("firstFocusIndicatorVisible");
    expect(source).toContain("recoveryFocusIndicatorVisible");
    expect(source).toContain("!recoveryState.statusVisible");
    expect(source).toContain(
      "pathnameMatches: current.pathname === expected.pathname",
    );
    expect(source).toContain(
      "searchMatches: current.search === expected.search",
    );
    expect(source).toContain("hashMatches: current.hash === expected.hash");
    expect(source).not.toContain("currentPath:");
    expect(source).not.toContain("expectedPath:");
    expect(source).toContain('"/garden?visualLocaleState=global-error"');
    expect(source).toContain("interactionProofs.globalError = true");
    expect(source).toContain('"/garden?visualLocaleState=safe-flush-failure"');
    expect(source).toContain("interactionProofs.safeFlushFailure = true");
    const genericNotFoundStart = source.indexOf(
      "async function runGenericNotFoundLocalizationCheck",
    );
    const genericNotFoundEnd = source.indexOf(
      "async function runGlobalErrorLocalizationCheck",
      genericNotFoundStart,
    );
    expect(genericNotFoundStart).toBeGreaterThan(-1);
    expect(genericNotFoundEnd).toBeGreaterThan(genericNotFoundStart);
    const genericNotFoundSource = source.slice(
      genericNotFoundStart,
      genericNotFoundEnd,
    );
    expect(genericNotFoundSource).toContain(
      "`/ove205-generic-not-found-${viewport.id}/unmatched/deep`",
    );
    for (const marketCase of [
      "ukraine-uk-zero-control",
      "bulgaria-bg-exactly-one-control",
      "bulgaria-ru-exactly-one-control",
    ]) {
      expect(genericNotFoundSource).toContain(`"${marketCase}"`);
    }
    expect(genericNotFoundSource).toContain("expectedStatus: 404");
    expect(genericNotFoundSource).toContain("structure.mainCount !== 1");
    expect(genericNotFoundSource).toContain("structure.h1Count !== 1");
    expect(genericNotFoundSource).toContain("structure.horizontalOverflow > 1");
    expect(genericNotFoundSource).toContain(
      "structure.offscreenControlCount > 0",
    );
    expect(source).toContain('"details:not([open])"');
    expect(source).toContain('":scope > summary"');
    expect(source).toContain("if (hiddenByClosedDetails) return false");
    expect(source).toContain(
      'page.getByText("Проверенная тема", { exact: true })',
    );
    expect(source).toContain('name: "Регулярні спостереження"');
    expect(source).not.toContain('!body.includes("Проверенная тема")');
  });
});
