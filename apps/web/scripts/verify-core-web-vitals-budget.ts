import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

import {
  PUBLIC_SURFACE_CWV_CLASS_DEADLINE_MS,
  PUBLIC_SURFACE_CWV_PROFILE,
  PUBLIC_SURFACE_PERFORMANCE_CLASSES,
  PUBLIC_SURFACE_PERFORMANCE_TARGETS,
  type PublicSurfacePerformanceClass,
} from "../src/lib/performance/public-surface-budget";
import {
  browserSafeFixturePath,
  CORE_JOURNEY_SCENARIOS,
} from "../src/lib/accessibility/core-journey-matrix";
import {
  buildCoreWebVitalsAggregateReceipt,
  evaluateCoreWebVitalsClass,
  measureCoreWebVitalsClassWithDeadline,
  productionStaticControlPaths,
  type CoreWebVitalsRun,
} from "./verify-core-web-vitals-budget-runner";

type CliOptions =
  | { mode: "determinism"; injectDependencyTimeout: boolean }
  | {
      mode: "measure";
      baseUrl: URL;
      buildSha: string;
      environment: "local" | "production";
      outputPath: string | null;
      staticControlsOnly: boolean;
    };

declare global {
  interface Window {
    __ove337CoreWebVitals?: {
      cls: number;
      eventSupported: boolean;
      interactionCompleted: boolean;
      interactionDurations: Record<string, number>;
      lcpMs: number;
    };
  }
}

function readCliOptions(argv: string[]): CliOptions {
  const has = (name: string) => argv.includes(name);
  const read = (name: string) => {
    const index = argv.indexOf(name);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };

  if (has("--prove-determinism")) {
    return {
      mode: "determinism",
      injectDependencyTimeout: has("--inject-dependency-timeout"),
    };
  }

  const rawBaseUrl = read("--base-url") ?? process.env.CWV_BASE_URL ?? null;
  const rawSha = read("--sha") ?? process.env.GITHUB_SHA ?? null;
  const environment = read("--environment");
  const outputPath = read("--output");
  const staticControlsOnly = has("--static-controls-only");
  if (!rawBaseUrl || !rawSha || !environment) {
    throw new Error(
      "Usage: tsx scripts/verify-core-web-vitals-budget.ts --base-url <origin> --environment <local|production> --sha <exact-sha> [--output receipt.json] [--emit-aggregate-receipt] [--static-controls-only]",
    );
  }
  const baseUrl = new URL(rawBaseUrl);
  if (
    !["http:", "https:"].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    !["", "/"].includes(baseUrl.pathname)
  ) {
    throw new Error("Core Web Vitals evidence requires a clean HTTP(S) origin.");
  }
  baseUrl.pathname = "/";
  if (!/^[a-f0-9]{40}$/iu.test(rawSha)) {
    throw new Error("Core Web Vitals evidence requires an exact SHA.");
  }
  if (environment !== "local" && environment !== "production") {
    throw new Error("Core Web Vitals evidence environment is invalid.");
  }
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (environment === "local" && !loopback.has(baseUrl.hostname)) {
    throw new Error("Full Core Web Vitals measurement requires loopback fixtures.");
  }
  if (environment === "production") {
    if (baseUrl.hostname !== "over.garden" || !staticControlsOnly) {
      throw new Error(
        "Production evidence permits only allowlisted static controls on over.garden.",
      );
    }
  } else if (staticControlsOnly) {
    throw new Error("Static-control-only mode is reserved for production closeout.");
  }

  return {
    mode: "measure",
    baseUrl,
    buildSha: rawSha.toLowerCase(),
    environment,
    outputPath: outputPath ? path.resolve(outputPath) : null,
    staticControlsOnly,
  };
}

async function installCoreWebVitalsObservers(context: BrowserContext) {
  await context.addInitScript((eventObserverFloorMs: number) => {
    const state = {
      cls: 0,
      eventSupported: PerformanceObserver.supportedEntryTypes.includes("event"),
      interactionCompleted: false,
      interactionDurations: {} as Record<string, number>,
      lcpMs: 0,
    };
    window.__ove337CoreWebVitals = state;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        };
        if (!shift.hadRecentInput && typeof shift.value === "number") {
          state.cls += shift.value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });

    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last) state.lcpMs = last.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });

    if (state.eventSupported) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const event = entry as PerformanceEntry & {
            duration?: number;
            interactionId?: number;
          };
          if (
            typeof event.interactionId !== "number" ||
            event.interactionId <= 0 ||
            typeof event.duration !== "number"
          ) {
            continue;
          }
          const key = String(event.interactionId);
          state.interactionDurations[key] = Math.max(
            state.interactionDurations[key] ?? 0,
            event.duration,
          );
        }
      }).observe({
        type: "event",
        buffered: true,
        durationThreshold: eventObserverFloorMs,
      } as PerformanceObserverInit & { durationThreshold: number });
    }
  }, PUBLIC_SURFACE_CWV_PROFILE.eventObserverFloorMs);
}

async function configureProfile(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: PUBLIC_SURFACE_CWV_PROFILE.latencyMs,
    downloadThroughput:
      PUBLIC_SURFACE_CWV_PROFILE.downloadBytesPerSecond,
    uploadThroughput: PUBLIC_SURFACE_CWV_PROFILE.uploadBytesPerSecond,
    connectionType: "wifi",
  });
  await client.send("Emulation.setCPUThrottlingRate", {
    rate: PUBLIC_SURFACE_CWV_PROFILE.cpuSlowdownMultiplier,
  });
}

async function collectRun(input: {
  baseUrl: URL;
  browser: Browser;
  expectedStatus: number;
  interactionSelector: string;
  route: string;
  run: number;
}): Promise<CoreWebVitalsRun> {
  const context = await input.browser.newContext({
    colorScheme: "light",
    reducedMotion: "no-preference",
    serviceWorkers: PUBLIC_SURFACE_CWV_PROFILE.serviceWorkers,
    viewport: PUBLIC_SURFACE_CWV_PROFILE.viewport,
  });
  try {
    await installCoreWebVitalsObservers(context);
    const page = await context.newPage();
    await configureProfile(page);
    let pageError = false;
    page.on("pageerror", () => {
      pageError = true;
    });

    const response = await page.goto(new URL(input.route, input.baseUrl).href, {
      waitUntil: "load",
      timeout: 30_000,
    });
    if (!response || response.status() !== input.expectedStatus) {
      throw new Error("core_web_vitals_navigation_refused");
    }
    await page.evaluate(`(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, 500));
    })()`);

    const interaction = page.locator(input.interactionSelector);
    await interaction.waitFor({ state: "visible", timeout: 10_000 });
    await interaction.click({ timeout: 10_000 });
    await page.waitForFunction(
      (selector) =>
        document.querySelector(selector)?.getAttribute("aria-expanded") ===
        "true",
      input.interactionSelector,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(250);
    await page.evaluate(`(() => {
      if (window.__ove337CoreWebVitals) {
        window.__ove337CoreWebVitals.interactionCompleted = true;
      }
    })()`);
    const measured = await page.evaluate<{
      cls: number;
      eventSupported: boolean;
      interactionCompleted: boolean;
      inpMs: number | null;
      lcpMs: number;
    } | null>(`(() => {
      const state = window.__ove337CoreWebVitals;
      if (!state) return null;
      const durations = Object.values(state.interactionDurations);
      return {
        cls: state.cls,
        eventSupported: state.eventSupported,
        interactionCompleted: state.interactionCompleted,
        inpMs: durations.length > 0 ? Math.max(...durations) : null,
        lcpMs: state.lcpMs,
      };
    })()`);
    if (!measured || pageError) {
      throw new Error("core_web_vitals_browser_measurement_unavailable");
    }
    const interactionClass =
      measured.inpMs !== null
        ? ("observed" as const)
        : measured.eventSupported && measured.interactionCompleted
          ? ("below_observer_floor" as const)
          : ("missing" as const);
    const inpMs =
      measured.inpMs ??
      (interactionClass === "below_observer_floor"
        ? PUBLIC_SURFACE_CWV_PROFILE.eventObserverFloorMs
        : null);
    return {
      run: input.run,
      lcpMs: measured.lcpMs > 0 ? measured.lcpMs : null,
      inpMs,
      cls: measured.cls,
      interactionClass,
    };
  } finally {
    await context.close();
  }
}

function targetRoute(surfaceClass: PublicSurfacePerformanceClass) {
  const target = PUBLIC_SURFACE_PERFORMANCE_TARGETS.find(
    (candidate) => candidate.surfaceClass === surfaceClass,
  );
  if (!target) throw new Error("core_web_vitals_target_missing");
  const scenario = CORE_JOURNEY_SCENARIOS.find(
    (candidate) => candidate.id === target.scenarioId,
  );
  if (!scenario || scenario.expectedStatus !== 200) {
    throw new Error("core_web_vitals_fixture_scenario_invalid");
  }
  return {
    expectedStatus: scenario.expectedStatus,
    interactionSelector: target.interactionSelector,
    route: browserSafeFixturePath(scenario.path),
  };
}

async function collectClassRuns(input: {
  baseUrl: URL;
  browser: Browser;
  surfaceClass: PublicSurfacePerformanceClass;
}) {
  const target = targetRoute(input.surfaceClass);
  const runs: CoreWebVitalsRun[] = [];
  for (let run = 1; run <= PUBLIC_SURFACE_CWV_PROFILE.runsPerClass; run += 1) {
    runs.push(
      await collectRun({
        baseUrl: input.baseUrl,
        browser: input.browser,
        expectedStatus: target.expectedStatus,
        interactionSelector: target.interactionSelector,
        route: target.route,
        run,
      }),
    );
  }
  return runs;
}

async function runFullMeasurement(options: Extract<CliOptions, { mode: "measure" }>) {
  const browser = await chromium.launch({ headless: true });
  try {
    const classReceipts = [];
    for (const surfaceClass of PUBLIC_SURFACE_PERFORMANCE_CLASSES) {
      process.stderr.write(`[cwv] start ${surfaceClass}\n`);
      classReceipts.push(
        await measureCoreWebVitalsClassWithDeadline({
          surfaceClass,
          deadlineMs: PUBLIC_SURFACE_CWV_CLASS_DEADLINE_MS,
          measure: () =>
            collectClassRuns({
              baseUrl: options.baseUrl,
              browser,
              surfaceClass,
            }),
        }),
      );
      process.stderr.write(`[cwv] done ${surfaceClass}\n`);
    }
    return buildCoreWebVitalsAggregateReceipt({
      buildSha: options.buildSha,
      environment: options.environment,
      classReceipts,
    });
  } finally {
    await browser.close();
  }
}

async function runProductionStaticControls(
  options: Extract<CliOptions, { mode: "measure" }>,
) {
  const controls = [];
  for (const pathname of productionStaticControlPaths()) {
    const startedAt = performance.now();
    const response = await fetch(new URL(pathname, options.baseUrl), {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    controls.push({
      controlClass: pathname.slice(4) || "home",
      responseClass: response.ok ? "ok" : "refused",
      durationClass:
        performance.now() - startedAt <= 10_000 ? "within_10s" : "timed_out",
    });
  }
  const status = controls.every(
    ({ responseClass, durationClass }) =>
      responseClass === "ok" && durationClass === "within_10s",
  )
    ? "aligned"
    : "refused";
  return {
    schemaVersion: "ove337.publicSurfaceStaticControlReceipt.v1",
    issue: "OVE-337",
    status,
    environment: "production",
    buildSha: options.buildSha,
    probeClass: "static_controls_only",
    dynamicUserProbeCount: 0,
    preciseLocationAbsent: true,
    controls,
  } as const;
}

async function runDeterminismProof(injectDependencyTimeout: boolean) {
  const runs = Array.from(
    { length: PUBLIC_SURFACE_CWV_PROFILE.runsPerClass },
    (_, index) => ({
      run: index + 1,
      lcpMs: 1_800,
      inpMs: 120,
      cls: 0.04,
      interactionClass: "observed" as const,
    }),
  );
  const first = evaluateCoreWebVitalsClass({ surfaceClass: "feed", runs });
  const replay = evaluateCoreWebVitalsClass({ surfaceClass: "feed", runs });
  const timeout = injectDependencyTimeout
    ? await measureCoreWebVitalsClassWithDeadline({
        surfaceClass: "feed",
        deadlineMs: 1,
        measure: () => new Promise(() => undefined),
      })
    : null;
  return {
    schemaVersion: "ove337.publicSurfaceCoreWebVitalsDeterminismReceipt.v1",
    issue: "OVE-337",
    status:
      first.semanticDigest === replay.semanticDigest &&
      (!timeout || timeout.reasonClasses[0] === "measurement_timeout")
        ? "aligned"
        : "refused",
    replayClass:
      first.semanticDigest === replay.semanticDigest
        ? "deterministic"
        : "drift",
    timeoutClass: timeout?.reasonClasses[0] ?? "not_injected",
    controls: first.controls,
    preciseLocationAbsent: true,
  } as const;
}

async function emitReceipt(receipt: unknown, outputPath: string | null) {
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, serialized);
  process.stdout.write(serialized);
}

async function main() {
  const options = readCliOptions(process.argv.slice(2));
  if (options.mode === "determinism") {
    const receipt = await runDeterminismProof(options.injectDependencyTimeout);
    await emitReceipt(receipt, null);
    if (receipt.status !== "aligned") process.exitCode = 1;
    return;
  }

  const receipt = options.staticControlsOnly
    ? await runProductionStaticControls(options)
    : await runFullMeasurement(options);
  await emitReceipt(receipt, options.outputPath);
  if (receipt.status !== "pass" && receipt.status !== "aligned") {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
