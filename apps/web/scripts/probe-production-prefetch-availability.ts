import { performance } from "node:perf_hooks";

/**
 * OVE-361 production prefetch availability probe.
 *
 * PERF-01 (`prefetch_probe_response_time`) and WAIT-01 both measure here.
 *
 * A browser session on 2026-09-01 recorded roughly one in three speculative
 * navigation prefetches answering 503 while every document and every hashed
 * asset answered 200, and the deployment's own runtime log recorded only
 * success statuses for the same window — which places the 503 outside the
 * application's request handling. A shell control group of eight sequential and
 * twelve concurrent requests answered 200 in every case, but it was
 * unauthenticated while the observation was not, so the two were never
 * comparable.
 *
 * This probe replaces that single observation with counts. It samples two
 * request classes against the same public paths, so a difference between them
 * is measurable rather than assumed, and it records status classes only.
 *
 * ## Resolved, 2026-09-02
 *
 * The cause was database connection exhaustion in the proxy, and the platform
 * error table had been recording it since 2026-07-27 while nobody was reading
 * that table:
 *
 *     remaining connection slots are reserved for roles with the SUPERUSER
 *     attribute   —   PostgreSQL 53300, severity FATAL
 *     count 90, routes=/middleware
 *
 * with a further twelve occurrences of the same code across `/middleware`,
 * `/journal/[slug]` and `/lineage/objects/[objectId]`.
 *
 * The exhaustion was global rather than route-specific. Each serverless
 * instance holds its own connection, the garden workspace render held one
 * through four serialized round trips for 2205-3426 ms, and 22 slots do not
 * survive that under concurrency. Once they were gone, everything needing a
 * connection failed at once.
 *
 * A speculative prefetch of an authenticated route still renders its payload on
 * the server, and that render reads the database — which is where the observed
 * 503s were. The proxy's own failures, the ones in the error table, were on
 * document navigations. Either way the page function never completed, so the
 * status-code log recorded nothing: exactly the "only success statuses" that
 * made this look like it came from outside the application. It did not. It came
 * from one layer earlier than the layer being read.
 *
 * Note for anyone tempted to make the proxy skip its session lookup on
 * prefetches: it already does. Every database touch in `src/proxy.ts` is gated
 * on `isDocumentNavigationRequest`, which returns false for prefetch requests.
 *
 * That also explains why this probe found nothing across 234 samples: it is
 * unauthenticated, and an unauthenticated request is served from the CDN
 * without a session lookup. The probe was measuring a path the fault could not
 * reach.
 *
 * The repair is the connection pooler recorded in
 * `docs/INFRASTRUCTURE_REGISTRY.md`: client connections are multiplexed onto
 * twelve backends instead of competing for slots one instance at a time.
 * Verified after the cutover with 258 authenticated prefetches, in bursts up to
 * 64 concurrent — zero failures, and zero new entries in the error table.
 *
 * What remains is the render itself: an authenticated prefetch still renders a
 * page, and that render reads the database. Removing that would need a session
 * cookie cache, which trades revocation latency for the saved query and is
 * therefore a product decision, not a tuning one.
 *
 * One reading worth not repeating: passing a null viewer to the public-profile
 * lifecycle lookup is **not** the safe direction. `viewerUserId` is what
 * applies the profile-block filter, so an unresolved viewer sees *more*, not
 * less — a blocked profile comes back as present. Anywhere else in this proxy
 * an unresolved viewer fails closed; on that path it does not.
 */
export const PREFETCH_PROBE_BUDGET_MS = 10_000;
export const PROBE_REQUEST_DEADLINE_MS = 20_000;
export const PROBE_CONCURRENCY_CEILING = 3;
/**
 * A browser emits its hover prefetches in a burst far wider than a sequential
 * control group, and burst concurrency is one live explanation for the observed
 * class. The ceiling is therefore configurable and bounded, so the hypothesis
 * can be tested without the probe becoming a load generator.
 */
export const PROBE_CONCURRENCY_MAX = 32;

/**
 * Three locales times three public sections, so no locale can dominate the
 * sample. Every path is a public reading surface that answers without a
 * session; the probe never authenticates.
 */
export const PROBE_PATHS = [
  "/ru",
  "/ru/feed",
  "/ru/knowledge",
  "/ua",
  "/ua/feed",
  "/ua/knowledge",
  "/bg",
  "/bg/feed",
  "/bg/knowledge",
] as const;

export const PROBE_REQUEST_CLASSES = ["navigation", "prefetch"] as const;
export type ProbeRequestClass = (typeof PROBE_REQUEST_CLASSES)[number];

export const PROBE_SAFE_METHODS = ["GET", "HEAD"] as const;
export const WAIT_SAFE_CONTROLS = [
  "Abort run command",
  "Run status command",
] as const;

export const PROBE_STATES = [
  "planned",
  "sampling",
  "summarized",
  "recorded",
  "failed",
] as const;
export type ProbeState = (typeof PROBE_STATES)[number];

export const DEFAULT_PROBE_ORIGIN = "https://over.garden";

/**
 * A speculative navigation prefetch as the App Router issues it. The browser
 * additionally appends a build-derived `_rsc` query parameter; the probe does
 * not fabricate one, because an invented token would measure a cache miss
 * rather than the surface, and the receipt records that limitation.
 */
function headersFor(requestClass: ProbeRequestClass): Record<string, string> {
  if (requestClass === "prefetch") {
    return { RSC: "1", "Next-Router-Prefetch": "1" };
  }
  return {};
}

export function assertSafeMethod(method: string): void {
  if (!(PROBE_SAFE_METHODS as readonly string[]).includes(method)) {
    throw new Error("probe_unsafe_method_refused");
  }
}

export interface ProbeObservation {
  requestClass: ProbeRequestClass;
  status: number | "timeout" | "transport_error";
  /** PERF-01 is a per-request measurement, so each observation carries its own. */
  responseMs: number;
}

export interface ProbeClassDistribution {
  requestClass: ProbeRequestClass;
  sampleSize: number;
  statusCounts: Record<string, number>;
}

/** Groups observations into a class-only distribution. */
export function summarizeObservations(
  observations: readonly ProbeObservation[],
): ProbeClassDistribution[] {
  return PROBE_REQUEST_CLASSES.map((requestClass) => {
    const forClass = observations.filter(
      (entry) => entry.requestClass === requestClass,
    );
    const statusCounts: Record<string, number> = {};
    for (const entry of forClass) {
      const key = String(entry.status);
      statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    }
    return { requestClass, sampleSize: forClass.length, statusCounts };
  });
}

/**
 * Refuses to summarize an incomplete sample or a single request class, so a
 * conclusion can never be recorded from half a measurement.
 */
export function assertCompleteSample(
  distributions: readonly ProbeClassDistribution[],
  expectedPerClass: number,
): void {
  if (distributions.length !== PROBE_REQUEST_CLASSES.length) {
    throw new Error("probe_request_class_missing");
  }
  for (const distribution of distributions) {
    if (distribution.sampleSize !== expectedPerClass) {
      throw new Error("probe_sample_incomplete");
    }
    const counted = Object.values(distribution.statusCounts).reduce(
      (total, count) => total + count,
      0,
    );
    if (counted !== expectedPerClass) throw new Error("probe_sample_incomplete");
  }
}

async function observe(
  origin: string,
  path: string,
  requestClass: ProbeRequestClass,
  fetcher: typeof fetch,
): Promise<ProbeObservation> {
  assertSafeMethod("GET");
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    PROBE_REQUEST_DEADLINE_MS,
  );
  const startedAt = performance.now();
  try {
    const response = await fetcher(new URL(path, origin).toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: headersFor(requestClass),
      signal: controller.signal,
    });
    return {
      requestClass,
      status: response.status,
      responseMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      requestClass,
      status:
        error instanceof Error && error.name === "AbortError"
          ? "timeout"
          : "transport_error",
      responseMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Runs the plan at the declared concurrency ceiling, never above it. */
async function runBounded<T>(
  items: readonly (() => Promise<T>)[],
  ceiling: number,
): Promise<T[]> {
  const results: T[] = [];
  for (let index = 0; index < items.length; index += ceiling) {
    const window = items.slice(index, index + ceiling);
    results.push(...(await Promise.all(window.map((task) => task()))));
  }
  return results;
}

export interface PrefetchProbeReceipt {
  mode: "plan" | "verify";
  state: ProbeState;
  metric: "prefetch_probe_response_time";
  budgetMs: number;
  /** PERF-01: the slowest single response observed in the run. */
  maxResponseMs: number;
  runElapsedMs: number;
  withinBudget: boolean;
  origin: string;
  pathCount: number;
  samplePerClass: number;
  concurrencyCeiling: number;
  waitSafeControls: readonly string[];
  distributions: ProbeClassDistribution[];
  limitation: string;
}

export async function runPrefetchAvailabilityProbe(options: {
  mode: "plan" | "verify";
  origin?: string;
  repeats?: number;
  concurrency?: number;
  fetcher?: typeof fetch;
  injectOriginResponseTimeout?: boolean;
}): Promise<PrefetchProbeReceipt> {
  const started = performance.now();
  const origin = options.origin ?? DEFAULT_PROBE_ORIGIN;
  const repeats = options.repeats ?? 1;
  const concurrency = options.concurrency ?? PROBE_CONCURRENCY_CEILING;
  const fetcher = options.fetcher ?? fetch;
  const samplePerClass = PROBE_PATHS.length * repeats;

  const plan: (() => Promise<ProbeObservation>)[] = [];
  for (let round = 0; round < repeats; round += 1) {
    for (const requestClass of PROBE_REQUEST_CLASSES) {
      for (const path of PROBE_PATHS) {
        plan.push(() =>
          options.injectOriginResponseTimeout
            ? Promise.resolve<ProbeObservation>({
                requestClass,
                status: "timeout",
                responseMs: 0,
              })
            : observe(origin, path, requestClass, fetcher),
        );
      }
    }
  }

  if (options.mode === "plan") {
    return {
      mode: "plan",
      state: "planned",
      metric: "prefetch_probe_response_time",
      budgetMs: PREFETCH_PROBE_BUDGET_MS,
      maxResponseMs: 0,
      runElapsedMs: Math.round(performance.now() - started),
      withinBudget: true,
      origin,
      pathCount: PROBE_PATHS.length,
      samplePerClass,
      concurrencyCeiling: concurrency,
      waitSafeControls: WAIT_SAFE_CONTROLS,
      distributions: [],
      limitation: LIMITATION,
    };
  }

  const observations = await runBounded(plan, concurrency);
  const distributions = summarizeObservations(observations);
  assertCompleteSample(distributions, samplePerClass);
  const runElapsedMs = Math.round(performance.now() - started);
  const maxResponseMs = observations.reduce(
    (slowest, entry) => Math.max(slowest, entry.responseMs),
    0,
  );

  return {
    mode: "verify",
    state: "recorded",
    metric: "prefetch_probe_response_time",
    budgetMs: PREFETCH_PROBE_BUDGET_MS,
    maxResponseMs,
    runElapsedMs,
    withinBudget: maxResponseMs <= PREFETCH_PROBE_BUDGET_MS,
    origin,
    pathCount: PROBE_PATHS.length,
    samplePerClass,
    concurrencyCeiling: concurrency,
    waitSafeControls: WAIT_SAFE_CONTROLS,
    distributions,
    limitation: LIMITATION,
  };
}

export const LIMITATION =
  "Unauthenticated public paths only; the browser additionally appends a build-derived _rsc query parameter that this probe does not fabricate.";

export function parseProbeArgs(argv: readonly string[]): {
  mode: "plan" | "verify";
  origin: string;
  repeats: number;
  concurrency: number;
  injectOriginResponseTimeout: boolean;
} {
  const valueFor = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const mode = valueFor("--mode") ?? "verify";
  if (mode !== "plan" && mode !== "verify") {
    throw new Error("probe_mode_invalid");
  }
  const repeats = Number(valueFor("--repeats") ?? "1");
  if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 20) {
    throw new Error("probe_repeats_invalid");
  }
  const concurrency = Number(
    valueFor("--concurrency") ?? String(PROBE_CONCURRENCY_CEILING),
  );
  if (
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > PROBE_CONCURRENCY_MAX
  ) {
    throw new Error("probe_concurrency_invalid");
  }
  return {
    mode,
    origin: valueFor("--origin") ?? DEFAULT_PROBE_ORIGIN,
    repeats,
    concurrency,
    injectOriginResponseTimeout: argv.includes(
      "--inject-origin-response-timeout",
    ),
  };
}

async function main() {
  const args = parseProbeArgs(process.argv.slice(2));
  const receipt = await runPrefetchAvailabilityProbe(args);
  // Class-only receipt: no cookie, capability, session identifier, journal
  // body, coordinate, owner identifier, or user agent is recorded.
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.withinBudget) process.exitCode = 1;
}

if (process.argv[1]?.includes("probe-production-prefetch-availability")) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
