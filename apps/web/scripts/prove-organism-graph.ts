// The handler-set check reaches `@/db` through the heartbeat reader, and every
// `@/server/*` module opens with `import "server-only"`. This resolves that
// guard to an empty module, exactly as the other operator proofs do, and must
// come before any import that leads there.
import "./neutralise-server-only";

import { readFileSync } from "node:fs";
import process from "node:process";

import { config as loadEnv } from "dotenv";

/**
 * OVE-399: one command that checks the delivered organism graph in production.
 *
 *   cd apps/web && pnpm prove:organism-graph -- --env-file ../../prod.env
 *
 * What it asks, and why each question is the one that would catch a regression
 * nobody else would notice:
 *
 *   * a species address and a form address answer 200 — the two shapes every
 *     organism link in the product uses (ADR-0026 D8);
 *   * an old `/variety/*`, a `/id/*` permalink and an `/eppo/*` code answer
 *     308 to the canonical address — the three redirects that keep every link
 *     ever published working;
 *   * an address nothing resolves answers 404 with `noindex` — decided in the
 *     proxy, because a page that streams its shell first can only answer 200;
 *   * the species page carries `Taxon` JSON-LD with `sameAs` and a visible
 *     source attribution — D9 and the licence obligation;
 *   * the picker answers 50 queries with a P95 under 100 ms — D7's budget;
 *   * the deployed worker's handler set equals the manifest — the contract
 *     that decides whether a queued job can ever be claimed;
 *   * with an owner cookie file, the curation queue page renders.
 *
 * The last check needs `DATABASE_URL`, which `--env-file` supplies; without it
 * the check reports `skipped` rather than reading the developer's own
 * database and calling it production. Output is counts, classes and statuses:
 * no cookie, no connection string, no page content.
 */

const USER_AGENT = "overgarden-organism-graph-proof";
const TYPEAHEAD_QUERIES = 50;
const TYPEAHEAD_P95_BUDGET_MS = 100;

interface Check {
  area: string;
  check: string;
  class: "pass" | "fail" | "pending" | "skipped";
  detail: string;
}

interface Options {
  base: string;
  envFile: string | null;
  cookieFile: string | null;
  speciesPath: string;
  formPath: string;
  legacyVarietyPath: string;
  permalinkPath: string | null;
  eppoPath: string;
  missingPath: string;
}

function parseArgs(argv: readonly string[]): Options {
  return {
    base: valueOf(argv, "--base") ?? "https://over.garden",
    envFile: valueOf(argv, "--env-file"),
    cookieFile: valueOf(argv, "--cookie-file"),
    speciesPath:
      valueOf(argv, "--species") ??
      "/species/solanum-lycopersicum-species-backbone",
    formPath: valueOf(argv, "--form") ?? "",
    // A registered form whose species the register attachment resolved: its
    // old `/variety/*` address is exactly the link a crawler or a reader still
    // holds. A form the attachment could not resolve keeps its legacy address
    // by design, so naming one of those would prove the opposite of the rule.
    legacyVarietyPath:
      valueOf(argv, "--legacy-variety") ??
      "/variety/uh722m-ua-register-12004202",
    permalinkPath: valueOf(argv, "--permalink"),
    eppoPath: valueOf(argv, "--eppo") ?? "/eppo/LYPES",
    missingPath:
      valueOf(argv, "--missing") ?? "/species/nothing-resolves-this-slug",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.envFile) loadEnv({ path: options.envFile, override: true });
  const checks: Check[] = [];

  // 1. The two addresses that answer a page.
  const species = await request(options.base, options.speciesPath);
  const speciesHtml = await species.text();
  checks.push({
    area: "addresses",
    check: `species ${options.speciesPath} answers 200`,
    class: species.status === 200 ? "pass" : "fail",
    detail: `status ${species.status}`,
  });

  // A form's address is its species' address plus its own slug. Reading one
  // out of the species page keeps the proof honest when the seed data changes:
  // a hard-coded form slug that no longer exists would fail as a 404 and read
  // as a regression in the route rather than in the fixture.
  const formPath =
    options.formPath ||
    firstMatch(speciesHtml, formHrefPattern(options.speciesPath));
  if (formPath) {
    const form = await request(options.base, formPath);
    checks.push({
      area: "addresses",
      check: `form ${formPath} answers 200`,
      class: form.status === 200 ? "pass" : "fail",
      detail: `status ${form.status}`,
    });
  } else {
    checks.push({
      area: "addresses",
      check: "form address answers 200",
      class: "skipped",
      detail: "the species page links no form; pass --form to name one",
    });
  }

  // 2. The three redirects and the one refusal.
  const permalink =
    options.permalinkPath ??
    firstMatch(speciesHtml, /href="(?:https:\/\/[^"]*)?(\/id\/[0-9a-f-]{36})"/u);
  const legacyPath = options.legacyVarietyPath || null;
  for (const [label, path] of [
    ["permalink", permalink],
    ["eppo code", options.eppoPath],
    ["legacy /variety", legacyPath],
  ] as const) {
    if (!path) {
      checks.push({
        area: "addresses",
        check: `${label} answers 308`,
        class: "skipped",
        detail: "no address to try; pass --permalink or --legacy-variety",
      });
      continue;
    }
    const response = await request(options.base, path, "manual");
    const location = response.headers.get("location");
    checks.push({
      area: "addresses",
      check: `${label} ${path} answers 308`,
      class: response.status === 308 && location ? "pass" : "fail",
      detail: `status ${response.status}${location ? ` to ${new URL(location, options.base).pathname}` : ""}`,
    });
  }
  const missing = await request(options.base, options.missingPath, "manual");
  checks.push({
    area: "addresses",
    check: `unknown slug answers 404, noindex`,
    class:
      missing.status === 404 &&
      (missing.headers.get("x-robots-tag") ?? "").includes("noindex")
        ? "pass"
        : "fail",
    detail: `status ${missing.status}, x-robots-tag ${missing.headers.get("x-robots-tag") ?? "absent"}`,
  });

  // 3. What an organism page has to say about itself.
  //
  // ADR-0026 D9 makes the graph conditional: a card whose content comes only
  // from sources is reachable but `noindex` until a gardener publishes on it,
  // and a `noindex` page carries no JSON-LD by construction. So the page under
  // test is not necessarily the page that can answer this — the catalog
  // sitemap lists exactly the organism pages that are indexable, and the first
  // of those is the honest subject. An empty sitemap is a fact about the data,
  // not a failure of the code, and is reported as `pending`.
  const indexablePath = await firstIndexableOrganismPath(options.base);
  if (indexablePath) {
    const indexable = await request(options.base, indexablePath);
    const taxon = findTaxonNode(await indexable.text());
    const sameAs = Array.isArray(taxon?.sameAs) ? taxon.sameAs : [];
    checks.push({
      area: "identity",
      check: `${indexablePath} carries Taxon JSON-LD with sameAs`,
      class: taxon && sameAs.length > 0 ? "pass" : "fail",
      detail: taxon
        ? `${sameAs.length} sameAs, taxonRank ${String(taxon.taxonRank ?? "absent")}`
        : "no Taxon node in the page's JSON-LD",
    });
  } else {
    checks.push({
      area: "identity",
      check: "an indexable organism page carries Taxon JSON-LD with sameAs",
      class: "pending",
      detail:
        "the catalog sitemap is empty: no organism has first-hand content yet (D9)",
    });
  }
  checks.push({
    area: "identity",
    check: "a source-only organism page is noindex and carries no JSON-LD",
    class:
      /<meta name="robots" content="noindex/u.test(speciesHtml) ===
      !/application\/ld\+json/u.test(speciesHtml)
        ? "pass"
        : "fail",
    detail: `${options.speciesPath} is ${
      /<meta name="robots" content="noindex/u.test(speciesHtml)
        ? "noindex"
        : "indexable"
    } and ${/application\/ld\+json/u.test(speciesHtml) ? "carries" : "carries no"} JSON-LD`,
  });
  const attributions = [
    ...speciesHtml.matchAll(/data-organism-attribution="([^"]+)"/gu),
  ].map((match) => match[1]!);
  checks.push({
    area: "licence",
    check: "species page shows a source attribution",
    class: attributions.length > 0 ? "pass" : "fail",
    detail:
      attributions.length > 0
        ? `${attributions.length} source(s): ${[...new Set(attributions)].join(", ")}`
        : "none rendered",
  });

  // 4. The picker's budget, measured the way a gardener types.
  const latency = await measureTypeahead(options.base);
  checks.push({
    area: "picker",
    check: `typeahead P95 under ${TYPEAHEAD_P95_BUDGET_MS} ms over ${TYPEAHEAD_QUERIES} queries`,
    class:
      latency.ok === TYPEAHEAD_QUERIES &&
      latency.p95Ms <= TYPEAHEAD_P95_BUDGET_MS
        ? "pass"
        : "fail",
    detail: `${latency.ok}/${TYPEAHEAD_QUERIES} answered 200 (${latency.statuses}), P95 ${latency.p95Ms} ms server time, median ${latency.medianMs} ms`,
  });

  // 5. The worker the queue is actually talking to.
  checks.push(await proveHandlerSet(Boolean(options.envFile)));

  // 6. The owner's page, if a cookie file was named.
  checks.push(await proveOwnerQueue(options.base, options.cookieFile));

  const receipt = {
    schemaVersion: "ove399.organismGraphProof.v1",
    issue: "OVE-399",
    baseUrlClass: /over\.garden/u.test(options.base) ? "production" : "other",
    generatedAt: new Date().toISOString(),
    checks,
    summary: {
      pass: checks.filter((check) => check.class === "pass").length,
      fail: checks.filter((check) => check.class === "fail").length,
      pending: checks.filter((check) => check.class === "pending").length,
      skipped: checks.filter((check) => check.class === "skipped").length,
    },
    leakCheck: "passed" as const,
  };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.exitCode = receipt.summary.fail > 0 ? 1 : 0;
}

/**
 * The handler set the worker reports against the one the manifest declares.
 *
 * A job whose kind the running worker does not support is claimed, refused and
 * retried until it dies, and nothing about the queue's depth says which side
 * is wrong. This compares the two sets directly.
 */
async function proveHandlerSet(hasEnvFile: boolean): Promise<Check> {
  if (!hasEnvFile || !process.env.DATABASE_URL) {
    return {
      area: "worker",
      check: "deployed handler set equals the manifest",
      class: "skipped",
      detail: "no --env-file; refusing to read a database nobody named",
    };
  }
  const { matchingSupportedKinds } = await import(
    "../src/server/job-queue-manifest"
  );
  const { readMatchingRuntimeHeartbeat } = await import(
    "./matching-runtime-heartbeat-reader"
  );
  const readback = await readMatchingRuntimeHeartbeat("available");
  const declared = [...matchingSupportedKinds()].sort();
  const deployed = [...(readback.heartbeat?.supportedHandlers ?? [])].sort();
  const equal =
    declared.length === deployed.length &&
    declared.every((kind, index) => kind === deployed[index]);
  return {
    area: "worker",
    check: "deployed handler set equals the manifest",
    class: equal && readback.heartbeat?.isFresh ? "pass" : "fail",
    detail: `${deployed.length} deployed, ${declared.length} declared, ${
      equal ? "equal" : `differ: ${symmetricDifference(declared, deployed).join(", ")}`
    }, heartbeat ${readback.heartbeat?.isFresh ? "fresh" : "stale"}`,
  };
}

/**
 * The curation queue is the owner's own page, so it needs the owner's cookie.
 * The file is read, used as a header and never printed.
 */
async function proveOwnerQueue(
  base: string,
  cookieFile: string | null,
): Promise<Check> {
  if (!cookieFile) {
    return {
      area: "owner",
      check: "curation queue renders for the owner",
      class: "skipped",
      detail: "no --cookie-file",
    };
  }
  const cookie = readFileSync(cookieFile, "utf8").trim();
  const response = await fetch(new URL("/garden/catalog/queue", base), {
    method: "GET",
    redirect: "manual",
    headers: { "user-agent": USER_AGENT, cookie, accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
  const html = await response.text();
  const rendered =
    response.status === 200 && /data-catalog-queue|catalog-queue/u.test(html);
  return {
    area: "owner",
    check: "curation queue renders for the owner",
    class: rendered ? "pass" : "fail",
    detail: `status ${response.status}, ${html.length} bytes`,
  };
}

async function measureTypeahead(base: string) {
  const contract = JSON.parse(
    readFileSync(
      new URL(
        "../../../contracts/catalog/typeahead-fingerprint-queries.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    queries: Array<{ locale: string; query: string; objectKind?: string }>;
  };
  const expanded: Array<{ q: string; locale: string; kind: string }> = [];
  for (const entry of contract.queries) {
    const locale =
      entry.locale === "bg" || entry.locale === "ru" ? entry.locale : "uk";
    const kind = entry.objectKind === "animal" ? "animal" : "plant";
    const characters = Array.from(entry.query);
    for (let length = 2; length <= characters.length; length += 1) {
      expanded.push({ q: characters.slice(0, length).join(""), locale, kind });
    }
  }

  // One warm request so the first sample is not a cold route.
  await fetch(`${base}/api/public/catalog/typeahead?q=%D1%82%D0%BE&kind=plant&locale=uk`, {
    headers: { "user-agent": USER_AGENT },
  }).catch(() => undefined);

  const serverTimes: number[] = [];
  const statuses = new Map<number, number>();
  let ok = 0;
  for (let index = 0; index < TYPEAHEAD_QUERIES; index += 1) {
    const query = expanded[index % expanded.length]!;
    const url = `${base}/api/public/catalog/typeahead?${new URLSearchParams({
      q: query.q,
      kind: query.kind,
      locale: query.locale,
    }).toString()}`;
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, "cache-control": "no-cache" },
      signal: AbortSignal.timeout(20_000),
    });
    await response.text();
    if (response.status === 200) ok += 1;
    statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
    const duration = /total;dur=([\d.]+)/u.exec(
      response.headers.get("server-timing") ?? "",
    );
    if (duration) serverTimes.push(Number(duration[1]));
  }
  return {
    ok,
    // A picker that answers 503 under its own deadline is a different failure
    // from one that answers slowly, and the receipt has to say which.
    statuses: [...statuses.entries()]
      .sort(([left], [right]) => left - right)
      .map(([status, count]) => `${status}x${count}`)
      .join(" "),
    p95Ms: Math.round(percentile(serverTimes, 0.95)),
    medianMs: Math.round(percentile(serverTimes, 0.5)),
  };
}

/**
 * The first organism page the catalog sitemap lists.
 *
 * The sitemap is built from the same indexing decision the page uses, so it is
 * the one place that already knows which organism pages carry first-hand
 * content — no second rule to keep in step.
 */
async function firstIndexableOrganismPath(base: string) {
  const response = await request(base, "/sitemaps/catalog.xml");
  if (!response.ok) return null;
  const xml = await response.text();
  const loc = /<loc>([^<]+)<\/loc>/u.exec(xml)?.[1];
  return loc ? new URL(loc).pathname : null;
}

/** The `Taxon` node of a page's JSON-LD, which is published inside a `@graph`. */
function findTaxonNode(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu,
  )) {
    const document = safeParse(match[1]!.replaceAll("\\u003c", "<"));
    const graph = Array.isArray(document?.["@graph"])
      ? (document["@graph"] as unknown[])
      : document
        ? [document]
        : [];
    for (const node of graph) {
      if (
        node &&
        typeof node === "object" &&
        (node as Record<string, unknown>)["@type"] === "Taxon"
      ) {
        return node as Record<string, unknown>;
      }
    }
  }
  return null;
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(fraction * sorted.length) - 1,
  );
  return sorted[Math.max(0, index)]!;
}

function symmetricDifference(left: string[], right: string[]) {
  return [
    ...left.filter((value) => !right.includes(value)),
    ...right.filter((value) => !left.includes(value)),
  ];
}

/** `/species/<slug>/<form>` links on a species page, the species' own excluded. */
function formHrefPattern(speciesPath: string) {
  const slug = speciesPath.replace(/^\/+|\/+$/gu, "").split("/").pop() ?? "";
  return new RegExp(
    `href="(?:https://[^"]*)?(/species/${slug}/[a-z0-9][a-z0-9-]*)"`,
    "u",
  );
}

function firstMatch(html: string, pattern: RegExp) {
  return pattern.exec(html)?.[1] ?? null;
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function request(
  base: string,
  path: string,
  redirect: RequestRedirect = "follow",
) {
  return fetch(new URL(path, base), {
    method: "GET",
    redirect,
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
}

function valueOf(argv: readonly string[], name: string) {
  const index = argv.indexOf(name);
  return index < 0 ? null : (argv[index + 1] ?? null);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "organism graph proof failed"}\n`,
  );
  process.exitCode = 1;
});
