import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL_ORIGIN = "https://over.garden";
const DIRECTORY_ROUTES = [
  "/bg",
  "/bg/objects",
  "/bg/journals",
  "/bg/knowledge",
  "/bg/communities",
  "/bg/privacy",
  "/garden",
] as const;
const FIXTURE_ROUTES = [
  "/__visual-fixtures",
  "/__visual-fixtures/intent/ove174-i001",
  "/api/__visual-fixtures/journal-creation",
] as const;
const PRODUCTION_SKELETON_REQUESTS = [
  {
    evidenceKey: "pageGet",
    route: "/skeleton",
    method: "GET",
    accept: "text/html",
  },
  {
    evidenceKey: "apiGet",
    route: "/api/skeleton/journal",
    method: "GET",
    accept: "application/json",
  },
  {
    evidenceKey: "apiPost",
    route: "/api/skeleton/journal",
    method: "POST",
    accept: "application/json",
  },
] as const;
const FORBIDDEN_PUBLIC_MARKERS = [
  "visual-fixtures/",
  "__visual-fixtures",
  "@visual-fixtures.invalid",
  "quarantine/",
  "owner_user_id",
  "latitude",
  "longitude",
  "coordinates",
] as const;

export interface Drive2ProductionSmokeOptions {
  baseUrl: string;
  expectedCommitSha: string;
  deployedCommitSha: string;
  profilePath: string;
  fetchImpl?: typeof fetch;
}

export interface Drive2ProductionSmokeReport {
  issue: "OVE-186";
  evidenceClass: "canonical-production-smoke";
  commitMatch: true;
  guestRead: {
    directoryRoutes: number;
    objectPassport: true;
    journalEntry: true;
    gardenerProfile: true;
    authRedirects: 0;
  };
  mutationAuth: {
    comment: "auth-intent";
    follow: "auth-intent";
    bookmark: "auth-intent";
    create: "auth-intent";
  };
  fixtureIsolation: {
    blockedRoutes: number;
    sitemapClean: true;
    publicHtmlClean: true;
  };
  productionSkeletonBoundary: {
    issue: "OVE-191";
    pageGet: 404;
    apiGet: 404;
    apiPost: 404;
    responseBodiesRecorded: false;
  };
  indexingAndPrivacy: {
    privateNoStoreHtml: true;
    selectedLocaleFoundation: true;
    privateMarkersAbsent: true;
  };
}

export async function runDrive2ProductionSmoke(
  options: Drive2ProductionSmokeOptions,
): Promise<Drive2ProductionSmokeReport> {
  const baseUrl = normalizeCanonicalBase(options.baseUrl);
  assertExactCommit(options.expectedCommitSha, "tested main");
  assertExactCommit(options.deployedCommitSha, "deployed production");
  if (options.expectedCommitSha !== options.deployedCommitSha) {
    throw new Error("OVE-186 deployed commit does not match tested main.");
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  await assertProductionSkeletonBoundary(fetchImpl, baseUrl);

  for (const route of FIXTURE_ROUTES) {
    const response = await fetchImpl(`${baseUrl}${route}`, {
      redirect: "manual",
      headers: {
        Accept: route.startsWith("/api/") ? "application/json" : "text/html",
      },
    });
    if (response.status !== 404) {
      throw new Error(`Production fixture route ${route} must return 404.`);
    }
  }

  const htmlBodies: string[] = [];
  let feedHtml = "";
  for (const route of DIRECTORY_ROUTES) {
    const result = await fetchPublicHtml(fetchImpl, baseUrl, route);
    htmlBodies.push(result.html);
    if (route === "/bg") feedHtml = result.html;
    if (route.startsWith("/bg")) {
      assertSelectedLocaleFoundation(result.response, result.html, route);
    }
  }

  const objectPath = extractInternalHref(
    feedHtml,
    /^\/lineage\/objects\/[0-9a-f-]{36}$/,
    "living-object passport",
  );
  const journalPath = extractInternalHref(
    feedHtml,
    /^\/(?:(?:uk|bg|ru)\/)?journal\/[a-z0-9][a-z0-9-]{0,95}$/,
    "journal entry",
  );
  const profilePath = normalizeProfilePath(options.profilePath);
  const objectResult = await fetchPublicHtml(fetchImpl, baseUrl, objectPath);
  const journalResult = await fetchPublicHtml(fetchImpl, baseUrl, journalPath);
  const profileResult = await fetchPublicHtml(fetchImpl, baseUrl, profilePath);
  assertIncludes(
    objectResult.html,
    'data-living-object-passport="overview"',
    "production object passport marker",
  );
  assertIncludes(
    journalResult.html,
    'data-public-journal-entry="true"',
    "production journal marker",
  );
  assertIncludes(
    profileResult.html,
    'data-public-profile="v2"',
    "production profile marker",
  );
  htmlBodies.push(objectResult.html, journalResult.html, profileResult.html);

  const journalRef = journalPath.split("/").at(-1);
  const objectRef = objectPath.split("/").at(-1);
  if (!journalRef || !objectRef) {
    throw new Error("OVE-186 could not derive public mutation targets.");
  }
  await assertEngagementAuthBoundary(fetchImpl, baseUrl, {
    endpoint: "/api/engagement/comments",
    targetKind: "journal_entry",
    targetRef: journalRef,
    returnTo: journalPath,
  });
  await assertEngagementAuthBoundary(fetchImpl, baseUrl, {
    endpoint: "/api/engagement/follows",
    targetKind: "lineage_object",
    targetRef: objectRef,
    returnTo: objectPath,
  });
  await assertEngagementAuthBoundary(fetchImpl, baseUrl, {
    endpoint: "/api/engagement/bookmarks",
    targetKind: "journal_entry",
    targetRef: journalRef,
    returnTo: journalPath,
  });
  await assertCreateAuthBoundary(fetchImpl, baseUrl);

  const sitemapResponse = await fetchImpl(`${baseUrl}/sitemap.xml`, {
    headers: { Accept: "application/xml" },
  });
  if (!sitemapResponse.ok)
    throw new Error("Production sitemap is unavailable.");
  const sitemap = await sitemapResponse.text();
  assertNoForbiddenMarkers(sitemap, "production sitemap");
  for (const html of htmlBodies) {
    assertNoForbiddenMarkers(html, "production public HTML");
  }

  return {
    issue: "OVE-186",
    evidenceClass: "canonical-production-smoke",
    commitMatch: true,
    guestRead: {
      directoryRoutes: DIRECTORY_ROUTES.length,
      objectPassport: true,
      journalEntry: true,
      gardenerProfile: true,
      authRedirects: 0,
    },
    mutationAuth: {
      comment: "auth-intent",
      follow: "auth-intent",
      bookmark: "auth-intent",
      create: "auth-intent",
    },
    fixtureIsolation: {
      blockedRoutes: FIXTURE_ROUTES.length,
      sitemapClean: true,
      publicHtmlClean: true,
    },
    productionSkeletonBoundary: {
      issue: "OVE-191",
      pageGet: 404,
      apiGet: 404,
      apiPost: 404,
      responseBodiesRecorded: false,
    },
    indexingAndPrivacy: {
      privateNoStoreHtml: true,
      selectedLocaleFoundation: true,
      privateMarkersAbsent: true,
    },
  };
}

async function assertProductionSkeletonBoundary(
  fetchImpl: typeof fetch,
  baseUrl: string,
) {
  for (const request of PRODUCTION_SKELETON_REQUESTS) {
    const response = await fetchImpl(`${baseUrl}${request.route}`, {
      method: request.method,
      redirect: "manual",
      headers: {
        Accept: request.accept,
        ...(request.method === "POST"
          ? {
              "Content-Type": "application/json",
              Origin: baseUrl,
            }
          : {}),
      },
      ...(request.method === "POST" ? { body: "{}" } : {}),
    });

    if (response.status !== 404) {
      throw new Error(
        `OVE-191 production skeleton ${request.evidenceKey} must return exact 404.`,
      );
    }
  }
}

async function fetchPublicHtml(
  fetchImpl: typeof fetch,
  baseUrl: string,
  route: string,
) {
  const response = await fetchImpl(`${baseUrl}${route}`, {
    redirect: "follow",
    headers: { Accept: "text/html" },
  });
  if (response.status !== 200) {
    throw new Error(`Guest read ${route} returned ${response.status}.`);
  }
  const finalUrl = new URL(response.url || `${baseUrl}${route}`);
  if (finalUrl.pathname.startsWith("/auth/")) {
    throw new Error(`Guest read ${route} was authentication-gated.`);
  }
  const html = await response.text();
  assertIncludes(html, "<main", `guest read ${route} main landmark`);
  assertIncludes(html, "<h1", `guest read ${route} page heading`);
  const cacheControl =
    response.headers.get("cache-control")?.toLowerCase() ?? "";
  if (!cacheControl.includes("private") || !cacheControl.includes("no-store")) {
    throw new Error(`Guest HTML ${route} lost the private no-store boundary.`);
  }
  return { response, html };
}

async function assertEngagementAuthBoundary(
  fetchImpl: typeof fetch,
  baseUrl: string,
  input: {
    endpoint: string;
    targetKind: "journal_entry" | "lineage_object";
    targetRef: string;
    returnTo: string;
  },
) {
  const formData = new FormData();
  formData.set("targetKind", input.targetKind);
  formData.set("targetRef", input.targetRef);
  formData.set("returnTo", input.returnTo);
  formData.set("body", "OVE-186 authentication boundary check");
  formData.set("clientMutationId", "ove186-production-auth-boundary");
  const response = await fetchImpl(`${baseUrl}${input.endpoint}`, {
    method: "POST",
    body: formData,
    redirect: "manual",
    headers: { Origin: baseUrl },
  });
  const location = response.headers.get("location");
  const redirect = location ? new URL(location, baseUrl) : null;
  if (
    response.status !== 303 ||
    redirect?.pathname !== "/auth/intent" ||
    !redirect.searchParams.has("intent")
  ) {
    throw new Error(`${input.endpoint} bypassed the auth-intent boundary.`);
  }
}

async function assertCreateAuthBoundary(
  fetchImpl: typeof fetch,
  baseUrl: string,
) {
  const response = await fetchImpl(`${baseUrl}/api/garden/entries`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: baseUrl,
      "x-overgarden-auth-return": "/garden",
    },
    body: "{}",
  });
  const body = (await response.json().catch(() => null)) as {
    authIntentUrl?: unknown;
  } | null;
  if (
    response.status !== 401 ||
    typeof body?.authIntentUrl !== "string" ||
    !body.authIntentUrl.startsWith("/auth/intent?intent=")
  ) {
    throw new Error("Garden creation bypassed the auth-intent boundary.");
  }
}

function assertSelectedLocaleFoundation(
  response: Response,
  html: string,
  route: string,
) {
  if (response.headers.get("content-language") !== "bg") {
    throw new Error(`Selected locale header is missing at ${route}.`);
  }
  if (!/<html[^>]+lang=["']bg["']/i.test(html)) {
    throw new Error(
      `Selected locale document language is missing at ${route}.`,
    );
  }
}

function extractInternalHref(
  html: string,
  allowed: RegExp,
  label: string,
): string {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(
    ([, href]) => href.replaceAll("&amp;", "&").split("?")[0],
  );
  const match = hrefs.find((href) => allowed.test(href));
  if (!match) throw new Error(`Production feed has no ${label} continuation.`);
  return match;
}

function normalizeProfilePath(value: string) {
  const profilePath = value.trim();
  if (!/^\/(?:(?:uk|bg|ru)\/)?@[a-z0-9_]{2,40}$/.test(profilePath)) {
    throw new Error("OVE-186 requires a safe public gardener profile path.");
  }
  return profilePath;
}

function normalizeCanonicalBase(value: string) {
  const url = new URL(value);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  const origin = url.toString().replace(/\/$/, "");
  if (origin !== CANONICAL_ORIGIN) {
    throw new Error("OVE-186 production smoke requires the canonical origin.");
  }
  return origin;
}

function assertExactCommit(value: string, label: string) {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`OVE-186 ${label} must be an exact commit SHA.`);
  }
}

function assertNoForbiddenMarkers(value: string, label: string) {
  const lower = value.toLowerCase();
  const marker = FORBIDDEN_PUBLIC_MARKERS.find((candidate) =>
    lower.includes(candidate.toLowerCase()),
  );
  if (marker)
    throw new Error(`${label} contains forbidden private fixture data.`);
}

function assertIncludes(value: string, expected: string, label: string) {
  if (!value.includes(expected)) throw new Error(`${label} is missing.`);
}

interface CliOptions {
  baseUrl: string;
  expectedCommitSha: string;
  deployedCommitSha: string;
  profilePath: string;
}

function parseCliOptions(argv: string[]): CliOptions {
  argv = argv.filter((value) => value !== "--");
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error("OVE-186 smoke options must be --name value pairs.");
    }
    values.set(key, value);
  }
  return {
    baseUrl: values.get("--base-url") ?? CANONICAL_ORIGIN,
    expectedCommitSha: values.get("--expected-commit") ?? resolveCommitSha(),
    deployedCommitSha:
      values.get("--deployed-commit") ??
      process.env.OVE186_DEPLOYED_COMMIT_SHA ??
      "",
    profilePath:
      values.get("--profile-path") ??
      process.env.OVE186_PUBLIC_PROFILE_PATH ??
      "",
  };
}

function resolveCommitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

async function main() {
  const report = await runDrive2ProductionSmoke(
    parseCliOptions(process.argv.slice(2)),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) void main();
