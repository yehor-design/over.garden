import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type BrowserContext } from "playwright";

import {
  evaluateTypographyPerformanceGate,
  isTypographyPerformanceFontRequest,
  parseTypographyPerformanceArtifact,
  summarizeTypographyPerformance,
  TYPOGRAPHY_PERFORMANCE_CONTRACT_VERSION,
  TYPOGRAPHY_PERFORMANCE_PROFILE,
  type TypographyPerformanceArtifact,
  type TypographyPerformanceEnvironment,
  type TypographyPerformanceRun,
} from "../src/lib/typography/typography-performance";

const DEFAULT_ROUTE = "/bg";
const DEFAULT_RUNS = 5;

interface CliOptions {
  baseUrl: URL;
  comparePath: string | null;
  compareSha: string | null;
  environment: TypographyPerformanceEnvironment;
  label: string;
  outputPath: string;
  route: typeof DEFAULT_ROUTE;
  runs: number;
  sha: string;
}

declare global {
  interface Window {
    __ove208TypographyPerformance?: {
      cls: number;
      fontWindowCls: number;
      fontReadyMs: number;
      lcpMs: number;
    };
  }
}

function readCliOptions(argv: string[]): CliOptions {
  const read = (name: string) => {
    const index = argv.indexOf(name);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };
  const baseUrlValue = read("--base-url");
  const label = read("--label");
  const outputPath = read("--output");
  const sha = read("--sha");
  const environment = read("--environment");
  const comparePath = read("--compare");
  const compareSha = read("--compare-sha");
  if (!baseUrlValue || !label || !outputPath || !sha || !environment) {
    throw new Error(
      "Usage: pnpm typography:performance -- --base-url <origin> --environment <local|production> --label <label> --sha <exact-sha> --output <path> [--route /bg] [--runs 5] [--compare artifact.json --compare-sha <exact-baseline-sha>]",
    );
  }

  const baseUrl = new URL(baseUrlValue);
  if (
    (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    (baseUrl.pathname !== "/" && baseUrl.pathname !== "")
  ) {
    throw new Error(
      "Typography performance evidence requires a clean HTTP(S) origin.",
    );
  }
  baseUrl.pathname = "/";
  if (!/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error("Typography performance evidence requires an exact SHA.");
  }
  const githubSha = process.env.GITHUB_SHA?.toLowerCase();
  if (githubSha && sha.toLowerCase() !== githubSha) {
    throw new Error(
      "Typography performance SHA must match the GitHub Actions checkout.",
    );
  }
  const route = read("--route") ?? DEFAULT_ROUTE;
  if (route !== DEFAULT_ROUTE || !/^\/(?!\/)/u.test(route)) {
    throw new Error("Typography performance route must be exactly /bg.");
  }
  const target = new URL(route, baseUrl);
  if (target.origin !== baseUrl.origin) {
    throw new Error("Typography performance route must remain same-origin.");
  }
  if (environment !== "local" && environment !== "production") {
    throw new Error("Typography performance environment is invalid.");
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(label)) {
    throw new Error("Typography performance label is invalid.");
  }
  if (comparePath && (!compareSha || !/^[a-f0-9]{40}$/i.test(compareSha))) {
    throw new Error("Comparison requires an exact --compare-sha.");
  }
  if (!comparePath && compareSha) {
    throw new Error("--compare-sha requires --compare.");
  }
  const runs = Number(read("--runs") ?? DEFAULT_RUNS);
  if (!Number.isInteger(runs) || runs < 5 || runs > 20) {
    throw new Error("Typography performance evidence requires 5..20 runs.");
  }

  return {
    baseUrl,
    comparePath,
    compareSha: compareSha?.toLowerCase() ?? null,
    environment,
    label,
    outputPath: path.resolve(outputPath),
    route,
    runs,
    sha: sha.toLowerCase(),
  };
}

async function installObservers(context: BrowserContext) {
  await context.addInitScript(() => {
    const state = {
      cls: 0,
      fontWindowCls: 0,
      fontReadyMs: 0,
      lcpMs: 0,
    };
    window.__ove208TypographyPerformance = state;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        };
        if (shift.hadRecentInput || typeof shift.value !== "number") continue;
        state.cls += shift.value;
        if (
          state.fontReadyMs === 0 ||
          entry.startTime <= state.fontReadyMs + 500
        ) {
          state.fontWindowCls += shift.value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });

    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries.at(-1);
      if (last) state.lcpMs = last.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });

    void document.fonts.ready.then(() => {
      state.fontReadyMs = performance.now();
    });
  });
}

async function collectRun(input: {
  baseUrl: URL;
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  route: string;
  run: number;
}): Promise<TypographyPerformanceRun> {
  const evidencePath = (url: URL) =>
    url.username || url.password ? url.href : url.href.slice(url.origin.length);
  const context = await input.browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await installObservers(context);
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 40,
    downloadThroughput: (10 * 1024 * 1024) / 8,
    uploadThroughput: (2 * 1024 * 1024) / 8,
    connectionType: "wifi",
  });
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const pageErrors: string[] = [];
  const externalFontRequests = new Set<string>();
  const fontRequestHrefs: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.name));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push("console-error");
  });
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (
        isTypographyPerformanceFontRequest(request.resourceType(), url.href)
      ) {
        fontRequestHrefs.push(url.href);
        if (url.origin !== input.baseUrl.origin) {
          externalFontRequests.add(url.origin);
        }
      }
    } catch {
      pageErrors.push("invalid-request-url");
    }
  });
  page.on("requestfailed", (request) => {
    try {
      if (
        isTypographyPerformanceFontRequest(
          request.resourceType(),
          new URL(request.url()).href,
        )
      ) {
        pageErrors.push("font-request-failed");
      }
    } catch {
      pageErrors.push("invalid-font-request-url");
    }
  });
  page.on("response", (resourceResponse) => {
    const request = resourceResponse.request();
    try {
      if (
        !resourceResponse.ok() &&
        isTypographyPerformanceFontRequest(
          request.resourceType(),
          new URL(request.url()).href,
        )
      ) {
        pageErrors.push("font-response-failed");
      }
    } catch {
      pageErrors.push("invalid-font-response-url");
    }
  });

  const target = new URL(input.route, input.baseUrl);
  const response = await page.goto(target.href, {
    waitUntil: "load",
    timeout: 30_000,
  });
  if (!response || response.status() >= 400) {
    throw new Error(
      `Typography performance navigation failed with ${response?.status() ?? "no-response"}.`,
    );
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
  });

  // Use a string expression here so the browser never sees tsx/esbuild's
  // Node-side helper symbols (for example `__name`).
  const measured = await page.evaluate<
    Omit<
      TypographyPerformanceRun,
      "run" | "externalFontRequests" | "fontRequests" | "pageErrors"
    > & {
      resourceTimings: Array<{
        href: string;
        transferBytes: number;
        encodedBodyBytes: number;
      }>;
    }
  >(`(() => {
    const state = window.__ove208TypographyPerformance;
    const resources = performance.getEntriesByType("resource");
    const resourceTimings = resources.map((entry) => ({
        href: entry.name,
        transferBytes: entry.transferSize,
        encodedBodyBytes: entry.encodedBodySize,
      }));
    const cssRequests = resources
      .filter((entry) => /\\.css(?:$|\\?)/i.test(entry.name))
      .map((entry) => ({
        path: new URL(entry.name).pathname,
        transferBytes: entry.transferSize,
        encodedBodyBytes: entry.encodedBodySize,
      }));
    const paintEntries = performance.getEntriesByName("first-contentful-paint");
    const firstContentfulPaint = paintEntries[paintEntries.length - 1];

    return {
      lcpMs: state?.lcpMs ?? 0,
      totalCls: state?.cls ?? 0,
      fontWindowCls: state?.fontWindowCls ?? 0,
      firstContentfulPaintMs: firstContentfulPaint?.startTime ?? 0,
      fontReadyMs: state?.fontReadyMs ?? 0,
      resourceTimings,
      cssRequests,
      fontPreloads: Array.from(
        document.querySelectorAll('link[rel="preload"][as="font"]'),
        (link) => {
          const url = new URL(link.href);
          return url.origin === location.origin && !url.username && !url.password
            ? url.href.slice(url.origin.length)
            : url.href;
        },
      ),
      computedBodyFontFamily: getComputedStyle(document.body).fontFamily,
    };
  })()`);

  const { resourceTimings, ...measuredRun } = measured;
  const timingQueues = new Map<
    string,
    Array<{ transferBytes: number; encodedBodyBytes: number }>
  >();
  for (const timing of resourceTimings) {
    const queue = timingQueues.get(timing.href) ?? [];
    queue.push(timing);
    timingQueues.set(timing.href, queue);
  }
  const fontRequests = fontRequestHrefs.map((href) => {
    const timing = timingQueues.get(href)?.shift();
    if (
      !timing ||
      !Number.isFinite(timing.transferBytes) ||
      timing.transferBytes <= 0 ||
      !Number.isFinite(timing.encodedBodyBytes) ||
      timing.encodedBodyBytes <= 0
    ) {
      throw new Error(
        "Every browser-classified font request requires positive Resource Timing evidence.",
      );
    }
    return {
      path: evidencePath(new URL(href)),
      transferBytes: timing.transferBytes,
      encodedBodyBytes: timing.encodedBodyBytes,
    };
  });
  await context.close();
  return {
    run: input.run,
    ...measuredRun,
    fontRequests,
    externalFontRequests: [...externalFontRequests].sort(),
    pageErrors,
  };
}

async function readArtifact(
  filePath: string,
  expected: {
    baseUrl: string;
    environment: TypographyPerformanceEnvironment;
    route: "/bg";
    sha: string;
  },
) {
  const serialized = await readFile(path.resolve(filePath), "utf8");
  return {
    artifact: parseTypographyPerformanceArtifact(
      JSON.parse(serialized),
      expected,
    ),
    sha256: createHash("sha256").update(serialized).digest("hex"),
  };
}

async function main() {
  const options = readCliOptions(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true });
  const runs: TypographyPerformanceRun[] = [];
  try {
    for (let run = 1; run <= options.runs; run += 1) {
      runs.push(
        await collectRun({
          baseUrl: options.baseUrl,
          browser,
          route: options.route,
          run,
        }),
      );
    }
  } finally {
    await browser.close();
  }

  const summary = summarizeTypographyPerformance(runs);
  const artifact: TypographyPerformanceArtifact = {
    contractVersion: TYPOGRAPHY_PERFORMANCE_CONTRACT_VERSION,
    capturedAt: new Date().toISOString(),
    environment: options.environment,
    label: options.label,
    baseUrl: options.baseUrl.origin,
    route: options.route,
    sha: options.sha,
    profile: TYPOGRAPHY_PERFORMANCE_PROFILE,
    runs,
    summary,
  };

  if (options.comparePath) {
    if (!options.compareSha) {
      throw new Error("Comparison baseline SHA is missing.");
    }
    const before = await readArtifact(options.comparePath, {
      baseUrl: options.baseUrl.origin,
      environment: options.environment,
      route: options.route,
      sha: options.compareSha,
    });
    artifact.comparisonBaseline = {
      contractVersion: before.artifact.contractVersion,
      artifactSha256: before.sha256,
      label: before.artifact.label,
      sha: before.artifact.sha,
      summary: before.artifact.summary,
    };
    artifact.comparison = evaluateTypographyPerformanceGate({
      before: before.artifact.summary,
      after: summary,
      afterRuns: runs,
    });
  }

  parseTypographyPerformanceArtifact(artifact, {
    baseUrl: options.baseUrl.origin,
    environment: options.environment,
    route: options.route,
    sha: options.sha,
  });

  await writeFile(options.outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify(artifact, null, 2));
  if (
    artifact.comparison &&
    Object.entries(artifact.comparison).some(
      ([key, value]) => key.endsWith("Passed") && value === false,
    )
  ) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
