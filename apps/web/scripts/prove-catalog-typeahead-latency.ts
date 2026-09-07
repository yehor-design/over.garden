import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Measures the picker route against a running production build (OVE-387,
 * ADR-0026 D7): 200 mixed uk, bg and ru queries, P95 of the server time the
 * route reports in `Server-Timing`, and the heaviest eight-row body.
 *
 *   pnpm build && pnpm exec next start -p 3011
 *   pnpm catalog:typeahead:latency -- --base-url http://127.0.0.1:3011
 *
 * Passes when P95 is at most 100 ms of server time and every eight-row body
 * is at most 1 KB as it travels: the JSON gzipped, which is how Vercel's edge
 * serves it (Cyrillic register names are two bytes a character raw). Both
 * the raw and the compressed sizes are printed. Prints aggregates only: no
 * query text leaves this process except in the JSON it prints, and every
 * query comes from the checked-in fingerprint list.
 *
 * Pointed at a deployed origin it must defeat the shared cache, or it reports
 * a fiction. The route carries `s-maxage=60` and `Server-Timing` is cached
 * with the body, so a repeated URL returns the timing of whenever the entry
 * was written — and a `cache-control: no-cache` *request* header does not
 * defeat a shared cache: on 2026-09-07 fifty such requests to production all
 * answered `x-vercel-cache: HIT` and reported one frozen number as a P95.
 * Only a different URL reaches the origin, so every sample carries an ignored
 * `probe` parameter and the report records what the cache actually said.
 */
const DEFAULT_BASE_URL = "http://127.0.0.1:3011";
const QUERY_COUNT = 200;
const P95_BUDGET_MS = 100;
const BODY_BUDGET_BYTES = 1024;

interface Sample {
  serverMs: number;
  totalMs: number;
  bytes: number;
  gzipBytes: number;
  rows: number;
  status: number;
}

function parseArgs(argv: string[]) {
  let baseUrl = DEFAULT_BASE_URL;
  let count = QUERY_COUNT;
  let reportOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") baseUrl = argv[index + 1] ?? baseUrl;
    if (arg === "--count") count = Number(argv[index + 1] ?? count);
    if (arg === "--report-only") reportOnly = true;
  }
  return { baseUrl, count, reportOnly };
}

function loadQueries(count: number) {
  const contract = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "..", "..", "contracts", "catalog", "typeahead-fingerprint-queries.json"),
      "utf8",
    ),
  ) as { queries: Array<{ locale: string; query: string; objectKind?: string }> };
  // Every fixed query, then its prefixes from two characters up, cycling until
  // the count is reached: what a gardener's keystrokes look like.
  const expanded: Array<{ q: string; locale: string; kind: string }> = [];
  for (const entry of contract.queries) {
    const locale = entry.locale === "bg" || entry.locale === "ru" ? entry.locale : "uk";
    const kind = entry.objectKind === "animal" ? "animal" : "plant";
    const characters = Array.from(entry.query);
    for (let length = 2; length <= characters.length; length += 1) {
      expanded.push({ q: characters.slice(0, length).join(""), locale, kind });
    }
  }
  const queries: typeof expanded = [];
  for (let index = 0; queries.length < count && expanded.length > 0; index += 1) {
    queries.push(expanded[index % expanded.length]!);
  }
  return queries;
}

function serverTimingMs(header: string | null) {
  const match = header?.match(/total;dur=([\d.]+)/u);
  return match ? Number(match[1]) : Number.NaN;
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

async function main() {
  const { baseUrl, count, reportOnly } = parseArgs(process.argv.slice(2));
  const queries = loadQueries(count);
  const samples: Sample[] = [];
  const startedAtEpoch = Date.now();

  // A warm-up pass so the first sample is not the route's cold start.
  await fetch(`${baseUrl}/api/public/catalog/typeahead?q=%D1%82%D0%BE&kind=plant&locale=uk&probe=warmup`).catch(() => undefined);

  const caches = new Map<string, number>();
  for (const [ordinal, query] of queries.entries()) {
    // `probe` is ignored by the route and makes every sample reach the origin.
    // See the note above: without it this measures Vercel, not the query.
    const url = `${baseUrl}/api/public/catalog/typeahead?${new URLSearchParams({ q: query.q, kind: query.kind, locale: query.locale, probe: `${startedAtEpoch}-${ordinal}` }).toString()}`;
    const startedAt = performance.now();
    const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
    const text = await response.text();
    const totalMs = performance.now() - startedAt;
    const body = safeParse(text);
    const cache = response.headers.get("x-vercel-cache") ?? "none";
    caches.set(cache, (caches.get(cache) ?? 0) + 1);
    samples.push({
      serverMs: serverTimingMs(response.headers.get("server-timing")),
      totalMs,
      bytes: Buffer.byteLength(text),
      gzipBytes: gzipSync(Buffer.from(text), { level: 6 }).byteLength,
      rows: Array.isArray(body?.suggestions) ? body.suggestions.length : 0,
      status: response.status,
    });
  }

  const ok = samples.filter((sample) => sample.status === 200);
  const serverTimes = ok.map((sample) => sample.serverMs).filter((value) => Number.isFinite(value));
  const eightRowBodies = ok.filter((sample) => sample.rows === 8);
  const report = {
    schemaVersion: "ove387.catalogTypeaheadLatency.v1",
    baseUrlClass: /127\.0\.0\.1|localhost/u.test(baseUrl) ? "loopback" : "remote",
    queries: samples.length,
    statusClasses: {
      ok: ok.length,
      other: samples.length - ok.length,
    },
    // A reader has to be able to see that the samples reached the origin.
    // Anything but MISS (or `none`, on a loopback build) means the numbers
    // below describe a cache entry rather than this build.
    cacheClasses: Object.fromEntries([...caches.entries()].sort(([a], [b]) => a.localeCompare(b))),
    serverMs: {
      p50: round(percentile(serverTimes, 0.5)),
      p95: round(percentile(serverTimes, 0.95)),
      max: round(Math.max(...serverTimes)),
    },
    roundTripMs: {
      p50: round(percentile(ok.map((sample) => sample.totalMs), 0.5)),
      p95: round(percentile(ok.map((sample) => sample.totalMs), 0.95)),
    },
    rows: {
      empty: ok.filter((sample) => sample.rows === 0).length,
      eight: eightRowBodies.length,
    },
    bytes: {
      maxAnyBodyRaw: Math.max(...ok.map((sample) => sample.bytes)),
      maxEightRowBodyRaw: eightRowBodies.length > 0 ? Math.max(...eightRowBodies.map((sample) => sample.bytes)) : null,
      maxEightRowBodyGzip: eightRowBodies.length > 0 ? Math.max(...eightRowBodies.map((sample) => sample.gzipBytes)) : null,
    },
    budgets: {
      p95ServerMs: P95_BUDGET_MS,
      eightRowBodyGzipBytes: BODY_BUDGET_BYTES,
    },
    pass:
      ok.length === samples.length &&
      percentile(serverTimes, 0.95) <= P95_BUDGET_MS &&
      eightRowBodies.every((sample) => sample.gzipBytes <= BODY_BUDGET_BYTES),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass && !reportOnly) process.exitCode = 1;
}

function safeParse(text: string): { suggestions?: unknown } | null {
  try {
    return JSON.parse(text) as { suggestions?: unknown };
  } catch {
    return null;
  }
}

function round(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
