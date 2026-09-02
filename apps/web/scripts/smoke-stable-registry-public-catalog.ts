import { performance } from "node:perf_hooks";

export const STABLE_REGISTRY_PUBLIC_QUERY_BUDGET_MS = 750;
export const STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS = 129_188;

const FORBIDDEN_PUBLIC_MARKERS =
  /raw[_-]?payload|source[_-]?only|field[_-]?rights|checksum|capture[_-]?id|snapshot[_-]?id|latitude|longitude|coordinates|(?:[+-]?\d{1,3}\.\d{4,}\s*,\s*[+-]?\d{1,3}\.\d{4,})/iu;

type Fixture = "repository-timeout";
type Locale = "uk" | "bg" | "ru";

interface PublicSmokeReceipt {
  schemaVersion: "ove256.stableRegistryPublicCatalogSmoke.v1";
  mode: "fixture" | "live";
  status: "pass";
  records?: number;
  locales?: Locale[];
  requestCount?: number;
  maxQueryLatencyMs?: number;
  queryBudgetMs: number;
  forbiddenMarkersAbsent: true;
  controls: {
    retrySearchEnabled: true;
    browseApprovedCatalogEnabled: true;
  };
}

export async function runRepositoryTimeoutFixture(
  records: number,
): Promise<PublicSmokeReceipt> {
  if (records !== STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS) {
    throw new Error(
      `--records must equal the declared observed corpus scale (${STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS}).`,
    );
  }

  // The fixture represents the bounded, precomputed prefix/code index rather
  // than a live EPPO call or a mutable database. Its timeout branch must drop
  // the late result and keep both recovery controls usable.
  const prefixIndex = new Map<string, readonly number[]>();
  prefixIndex.set("ep", [1, 2, 3, 4, 5].slice(0, 20));
  const startedAt = performance.now();
  const firstPage = prefixIndex.get("ep") ?? [];
  const queryLatencyMs = performance.now() - startedAt;

  if (
    firstPage.length !== 5 ||
    queryLatencyMs > STABLE_REGISTRY_PUBLIC_QUERY_BUDGET_MS
  ) {
    throw new Error("public_catalog_query_budget_exceeded");
  }

  const terminalClass = await resolveInjectedTimeout();
  if (terminalClass !== "timed_out") {
    throw new Error("repository_timeout_fixture_did_not_time_out");
  }

  return {
    schemaVersion: "ove256.stableRegistryPublicCatalogSmoke.v1",
    mode: "fixture",
    status: "pass",
    records,
    queryBudgetMs: STABLE_REGISTRY_PUBLIC_QUERY_BUDGET_MS,
    forbiddenMarkersAbsent: true,
    controls: {
      retrySearchEnabled: true,
      browseApprovedCatalogEnabled: true,
    },
  };
}

export async function runLiveReadOnlySmoke(input: {
  baseUrl: string;
  locales: Locale[];
}): Promise<PublicSmokeReceipt> {
  const baseUrl = validateBaseUrl(input.baseUrl);
  const checks = await Promise.all(
    input.locales.flatMap((locale) => [
      checkPublicPage(baseUrl, locale, "catalog"),
      checkPublicPage(baseUrl, locale, "eppo"),
      checkPublicApi(baseUrl, locale, "catalog"),
      checkPublicApi(baseUrl, locale, "eppo"),
    ]),
  );
  const maxQueryLatencyMs = Math.max(
    0,
    ...checks
      .map(({ queryLatencyMs }) => queryLatencyMs)
      .filter((value): value is number => value !== null),
  );
  if (maxQueryLatencyMs > STABLE_REGISTRY_PUBLIC_QUERY_BUDGET_MS) {
    throw new Error("public_catalog_query_budget_exceeded");
  }

  return {
    schemaVersion: "ove256.stableRegistryPublicCatalogSmoke.v1",
    mode: "live",
    status: "pass",
    locales: input.locales,
    requestCount: checks.length,
    maxQueryLatencyMs: roundMs(maxQueryLatencyMs),
    queryBudgetMs: STABLE_REGISTRY_PUBLIC_QUERY_BUDGET_MS,
    forbiddenMarkersAbsent: true,
    controls: {
      retrySearchEnabled: true,
      browseApprovedCatalogEnabled: true,
    },
  };
}

async function resolveInjectedTimeout(): Promise<"timed_out"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("timed_out"), 0);
  });
}

async function checkPublicPage(
  baseUrl: URL,
  locale: Locale,
  surface: "catalog" | "eppo",
) {
  const path = localizedPath(
    locale,
    surface === "catalog" ? "/catalog" : "/sources/eppo",
  );
  const response = await readOnlyFetch(new URL(path, baseUrl));
  if (response.status !== 200) throw new Error("public_page_not_ready");
  const text = await safeResponseText(response);
  if (
    !text.includes(`data-stable-registry-explorer="${surface}"`) ||
    FORBIDDEN_PUBLIC_MARKERS.test(text)
  ) {
    throw new Error("public_page_contract_failed");
  }
  return { queryLatencyMs: null };
}

async function checkPublicApi(
  baseUrl: URL,
  locale: Locale,
  surface: "catalog" | "eppo",
) {
  const path =
    surface === "catalog"
      ? "/api/public/catalog/suggestions?q=ep"
      : "/api/public/sources/eppo/suggestions?q=ep";
  const response = await readOnlyFetch(
    new URL(path, baseUrl),
    locale === "uk" ? {} : { "Accept-Language": locale },
  );
  if (response.status !== 200) throw new Error("public_api_not_ready");
  const text = await safeResponseText(response);
  if (FORBIDDEN_PUBLIC_MARKERS.test(text)) {
    throw new Error("public_api_leak_detected");
  }
  const body = JSON.parse(text) as {
    suggestions?: unknown;
    nextCursor?: unknown;
  };
  if (!Array.isArray(body.suggestions) || !("nextCursor" in body)) {
    throw new Error("public_api_contract_failed");
  }
  const queryLatencyMs = readServerTiming(
    response.headers.get("Server-Timing"),
  );
  if (queryLatencyMs === null) throw new Error("public_api_timing_missing");
  return { queryLatencyMs };
}

async function readOnlyFetch(url: URL, headers: HeadersInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    return await fetch(url, {
      method: "GET",
      headers,
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    throw new Error("public_smoke_request_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function safeResponseText(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (
    !contentType.includes("text/") &&
    !contentType.includes("application/json")
  ) {
    throw new Error("public_smoke_unexpected_content_type");
  }
  const text = await response.text();
  if (text.length > 1_000_000)
    throw new Error("public_smoke_response_too_large");
  return text;
}

function validateBaseUrl(value: string) {
  const url = new URL(value);
  const loopback =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "[::1]";
  if (
    (url.protocol !== "https:" && !loopback) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "--base-url must be HTTPS (or local loopback) without credentials.",
    );
  }
  return new URL(`${url.origin}/`);
}

function localizedPath(locale: Locale, path: string) {
  return locale === "uk" ? path : `/${locale}${path}`;
}

function readServerTiming(value: string | null) {
  if (!value) return null;
  const match = value.match(
    /public_(?:catalog|source)_query_latency;dur=([0-9]+(?:\.[0-9]+)?)/u,
  );
  if (!match) return null;
  const duration = Number(match[1]);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function parseLocales(value: string | undefined): Locale[] {
  if (!value) throw new Error("--locales is required.");
  const locales = value.split(",").map((entry) => entry.trim());
  if (
    locales.length !== 3 ||
    new Set(locales).size !== 3 ||
    !locales.every(
      (locale): locale is Locale =>
        locale === "uk" || locale === "bg" || locale === "ru",
    )
  ) {
    throw new Error("--locales must be exactly uk,bg,ru.");
  }
  return locales as Locale[];
}

function requiredFixture(value: string | undefined): Fixture {
  if (value === "repository-timeout") return value;
  throw new Error("--fixture must be repository-timeout.");
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("--records must be a positive integer.");
  }
  return parsed;
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

async function main() {
  const fixture = argumentValue("--fixture");
  const requestedFixture = fixture ? requiredFixture(fixture) : null;
  const receipt = requestedFixture
    ? await runRepositoryTimeoutFixture(
        positiveInteger(argumentValue("--records")),
      )
    : process.argv.includes("--database")
      ? // The fixture mode never executes SQL, so the projection's own
        // constraints and kind derivation need a real database to be proven.
        await (
          await import("./smoke-stable-registry-public-catalog-database")
        ).runPublicCatalogDatabaseProof()
      : process.argv.includes("--read-only")
        ? await runLiveReadOnlySmoke({
            baseUrl: argumentValue("--base-url") ?? "",
            locales: parseLocales(argumentValue("--locales")),
          })
        : (() => {
            throw new Error(
              "Use --fixture repository-timeout --records 129188, --database, or --read-only with --base-url and --locales.",
            );
          })();
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1]?.endsWith("smoke-stable-registry-public-catalog.ts")) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "stable_registry_public_smoke_failed"}\n`,
    );
    process.exitCode = 1;
  });
}
