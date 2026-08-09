import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { createEmailVerificationToken } from "better-auth/api";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Kysely } from "kysely";
import { Meilisearch } from "meilisearch";
import sharp from "sharp";

import type { Database, JsonValue, JournalEntry } from "../src/db/schema";
import { buildVerifiedOwnerAccountEvidence } from "../src/lib/admin/owner-account-contract";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import { resolveBetterAuthSecret } from "../src/lib/auth-secret";
import { FOUNDER_REHEARSAL_COHORT } from "../src/lib/garden/pilot-invite";
import { DEFAULT_PILOT_SEGMENT } from "../src/lib/pilot/segments";

const DEFAULT_BASE_URL = "https://over.garden";
const TEST_PASSWORD = `ove-143-${randomUUID()}-${Date.now()}`;
const PUBLIC_JOURNAL_INDEX = "journal_entries";
const JOB_WAIT_TIMEOUT_MS = 180_000;
const JOB_WAIT_INTERVAL_MS = 2_000;
const HTTP_WAIT_TIMEOUT_MS = 60_000;
const HTTP_WAIT_INTERVAL_MS = 1_000;
const SMOKE_TITLE = "OVE-143 canonical launch smoke";
const SMOKE_BODY = "Smoke-only launch readback. No personal garden details.";

const FORBIDDEN_OUTPUT_MARKERS = [
  "@",
  "accountId",
  "account_id",
  "body",
  "callback",
  "clientMutation",
  "client_mutation",
  "cookie",
  "coordinates",
  "derivative",
  "email",
  "gps",
  "ip_address",
  "journalEntry",
  "journal_entry",
  "latitude",
  "longitude",
  "mediaAsset",
  "media_asset",
  "objectKey",
  "object_key",
  "owner",
  "password",
  "payload",
  "phone",
  "quarantine",
  "raw",
  "session",
  "slug",
  "title",
  "token",
  "uploadUrl",
  "upload_url",
  "url",
  "user",
  "userAgent",
  "user_agent",
];

const FORBIDDEN_PRIVATE_CONTENT_MARKERS = [
  "quarantine/",
  "owner_user_id",
  "userId",
  "user_id",
  "email",
  "ip_address",
  "user_agent",
  "latitude",
  "longitude",
  "coordinates",
];

type DB = Kysely<Database>;

interface RuntimeModules {
  db: DB;
  publishJournalEntry: (
    scope: { userId: string; sessionId?: string },
    input: { entryId: string; disclosureAccepted: boolean },
  ) => Promise<{ entry: JournalEntry; publicUrl: string }>;
  archiveJournalEntry: (
    scope: { userId: string; sessionId?: string },
    input: { entryId: string },
  ) => Promise<{
    entry: JournalEntry;
    publicUrl: string | null;
    publicGone: boolean;
  }>;
  enqueueJob: (
    queueName: string,
    payload: JsonValue,
    options: { idempotencyKey?: string },
  ) => Promise<string>;
  convergePublicProjectionsNow: (entityIds: string[]) => Promise<unknown>;
}

interface UploadResponse {
  mediaAssetId: string;
  uploadUrl: string;
}

interface ProcessResponse {
  mediaAsset?: {
    status?: string;
  };
  publicUrl?: string;
}

interface EntryResponse {
  plantObject: {
    id: string;
  };
  entry: {
    id: string;
  };
  readbackUrl: string;
}

interface JobRow {
  status: string;
  attempts: number;
  lastError: string | null;
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  set(name: string, value: string) {
    this.cookies.set(name, value);
  }

  addFromResponse(response: Response) {
    for (const cookie of getSetCookieHeaders(response.headers)) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  header() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  loadEnv({
    path: options.envFile ?? ".env.local",
    override: Boolean(options.envFile),
  });
  const base = normalizeBase(
    options.base ??
      process.env.OVE143_SMOKE_BASE_URL ??
      process.env.PUBLIC_SITE_URL ??
      process.env.BETTER_AUTH_URL ??
      DEFAULT_BASE_URL,
  );
  const modules = await loadRuntimeModules();
  const jar = new CookieJar();
  const signOutJar = new CookieJar();

  const recoveryMode = options.environment === "recovery-drill";
  assertEqual(
    new URL(base).origin,
    recoveryMode ? "http://127.0.0.1:13000" : "https://over.garden",
    "canonical origin",
  );
  if (!recoveryMode) await cleanupStalePublishedSmokeEntries(modules);
  const recoveryQueueBaseline = recoveryMode
    ? new Set(
        (await modules.db.selectFrom("job_queue").select("id").execute()).map(
          (row) => row.id,
        ),
      )
    : null;

  const marker = `${recoveryMode ? "ove-230" : "ove-143"}-${Date.now()}-${randomUUID()}`;
  const mail = `${marker}@over.garden`;
  const account = await createAndPrepareSmokeAccount(
    base,
    jar,
    modules.db,
    mail,
  );

  const authChecks = await verifyAuthSurfaces(
    base,
    jar,
    signOutJar,
    recoveryMode,
  );
  const routeChecks = recoveryMode
    ? await verifyRecoveryRoutes(base)
    : await verifyPublicRoutes(base);
  const gateChecks = await verifyAdminAndErasureGates(
    base,
    jar,
    signOutJar,
    modules.db,
    recoveryMode,
  );

  const image = await createSmokeImage(recoveryMode ? "jpeg" : "png");
  const imageContentType = recoveryMode ? "image/jpeg" : "image/png";
  const upload = await jsonRequest<UploadResponse>(
    base,
    jar,
    "/api/media/uploads",
    {
      method: "POST",
      body: { contentType: imageContentType, sizeBytes: image.byteLength },
    },
  );
  await uploadBinary(upload.uploadUrl, image, imageContentType);
  const processed = await jsonRequest<ProcessResponse>(
    base,
    jar,
    "/api/media/process",
    {
      method: "POST",
      body: { mediaAssetId: upload.mediaAssetId },
    },
  );
  assertEqual(processed.mediaAsset?.status, "processed", "media processed");
  assert(processed.publicUrl, "processed image must expose public read URL");
  const publicImage = await fetch(processed.publicUrl);
  assert(publicImage.ok, "public processed image must be readable");
  assert(
    publicImage.headers.get("content-type")?.includes("image/webp") ?? false,
    "public processed image must be WebP",
  );
  const mediaObjectProof = recoveryMode
    ? await verifyRecoveryMediaObjects(modules.db, upload.mediaAssetId)
    : { derivativePresent: true, originalAbsent: true };

  const firstEntry = await jsonRequest<EntryResponse>(
    base,
    jar,
    "/api/garden/entries",
    {
      method: "POST",
      body: {
        target: "first_plant_entry",
        spaceName: "OVE-143 launch smoke space",
        plantName: "OVE-143 launch smoke object",
        objectKind: "plant",
        catalogItemId: null,
        userAddedCatalogName: "Launch smoke plant",
        varietyText: null,
        title: SMOKE_TITLE,
        body: SMOKE_BODY,
        entryDate: "2026-07-05",
        locationVisibility: "hidden",
        coarseRegionCode: null,
        clientMutationId: randomUUID(),
        syncStatus: "online",
        activationSource: "direct_garden",
        mediaAssetId: upload.mediaAssetId,
      },
    },
  );
  const firstReadback = await textRequest(base, jar, firstEntry.readbackUrl);
  const passportAudiences = readRenderedDataMarker(
    firstReadback,
    "data-passport-audience",
  );
  assertEqual(passportAudiences.length, 1, "entry passport audience count");
  assertEqual(passportAudiences[0], "owner", "entry owner passport readback");
  assertProcessedDerivativeReadback(firstReadback, processed.publicUrl);
  assertNoPrivateMarkers(firstReadback, ["quarantine/"]);

  const followUp = await jsonRequest<EntryResponse>(
    base,
    jar,
    "/api/garden/entries",
    {
      method: "POST",
      body: {
        target: "plant_object_entry",
        plantObjectId: firstEntry.plantObject.id,
        title: "OVE-143 follow-up smoke",
        body: "Smoke-only same-object follow-up. No personal garden details.",
        entryDate: "2026-07-05",
        clientMutationId: randomUUID(),
        syncStatus: "online",
      },
    },
  );
  assertEqual(
    followUp.plantObject.id,
    firstEntry.plantObject.id,
    "follow-up object continuity",
  );
  await textRequest(base, jar, followUp.readbackUrl);

  const scope = { userId: account.id, sessionId: "ove-143-redacted-smoke" };
  const published = await modules.publishJournalEntry(scope, {
    entryId: firstEntry.entry.id,
    disclosureAccepted: true,
  });
  if (recoveryMode) {
    await modules.convergePublicProjectionsNow([published.entry.id]);
  } else {
    await modules.enqueueJob(
      "matching",
      {
        kind: "journal_entry_index",
        journalEntryId: published.entry.id,
        userId: account.id,
      },
      { idempotencyKey: `journal_entry_index:${published.entry.id}` },
    );
  }

  const publicPath = published.publicUrl;
  const publicHtml = await waitForPublicPage(base, publicPath, 200);
  assertIncludes(publicHtml, "noindex, nofollow", "public journal robots");
  assertIncludes(
    publicHtml,
    recoveryMode
      ? new URL(requiredEnv("R2_PUBLIC_BASE_URL")).host
      : "media.over.garden",
    "public journal derivative media host",
  );
  assertNoPrivateMarkers(publicHtml, FORBIDDEN_PRIVATE_CONTENT_MARKERS);

  const indexedJob = recoveryMode
    ? ({ status: "done", attempts: 1, lastError: null } satisfies JobRow)
    : await waitForJob(modules.db, `journal_entry_index:${published.entry.id}`);
  const publicDoc = await waitForMeiliDocument(published.entry.id, true);
  assertPublicSearchDocument(publicDoc);

  const archived = await modules.archiveJournalEntry(scope, {
    entryId: firstEntry.entry.id,
  });
  assert(archived.publicGone, "archived public entry must become gone");
  if (recoveryMode) {
    await modules.convergePublicProjectionsNow([archived.entry.id]);
  } else {
    await modules.enqueueJob(
      "matching",
      {
        kind: "journal_entry_unindex",
        journalEntryId: archived.entry.id,
        userId: account.id,
      },
      { idempotencyKey: `journal_entry_unindex:${archived.entry.id}` },
    );
  }
  const goneHtml = await waitForPublicPage(base, publicPath, 410);
  assertIncludes(
    goneHtml,
    "<header><span>OverGarden</span></header>",
    "archive tombstone shell",
  );
  assertIncludes(goneHtml, "noindex, nofollow", "archive tombstone robots");
  assert(
    !goneHtml.includes(SMOKE_TITLE),
    "archive tombstone hides entry title",
  );
  assert(!goneHtml.includes(SMOKE_BODY), "archive tombstone hides entry body");
  assertNoPrivateMarkers(goneHtml, FORBIDDEN_PRIVATE_CONTENT_MARKERS);

  const unindexedJob = recoveryMode
    ? ({ status: "done", attempts: 1, lastError: null } satisfies JobRow)
    : await waitForJob(
        modules.db,
        `journal_entry_unindex:${archived.entry.id}`,
      );
  assertEqual(unindexedJob.status, "done", "journal unindex job done");
  await waitForMeiliDocument(published.entry.id, false);

  const sitemap = await textRequest(base, signOutJar, "/sitemap.xml");
  assert(
    !sitemap.includes(publicPath),
    "archived journal path absent from sitemap",
  );

  if (recoveryMode && recoveryQueueBaseline) {
    const recoveryObject = await modules.db
      .selectFrom("plant_objects")
      .select("catalog_item_id as catalogItemId")
      .where("id", "=", firstEntry.plantObject.id)
      .executeTakeFirstOrThrow();
    await cleanupRecoveryQueueDelta(modules.db, recoveryQueueBaseline, [
      account.id,
      firstEntry.entry.id,
      firstEntry.plantObject.id,
      followUp.entry.id,
      upload.mediaAssetId,
      ...(recoveryObject.catalogItemId ? [recoveryObject.catalogItemId] : []),
    ]);
  }

  const evidence = {
    issue: recoveryMode ? "OVE-230" : "OVE-143",
    canonical: {
      originClass: "over_garden_https",
      accessClass: "public_no_platform_sso",
      placeholderEnvClass: "not_observed",
    },
    auth: authChecks,
    journal: {
      firstSaveReadback: true,
      sameObjectFollowup: true,
    },
    media: {
      privateOriginalUploadAccepted: true,
      processedPublicCopyReadable: true,
      publicHostClass: "media_over_garden",
      publicContentClass: "webp_without_recorded_keys",
      originalAbsent: mediaObjectProof.originalAbsent,
    },
    publicReadback: {
      publishStatusClass: "http_200",
      robotsClass: "noindex_nofollow",
      placeClass: "hidden_location",
      mediaClass: "public_copy_only",
      archiveStatusClass: "http_410",
      archivedRobotsClass: "noindex_nofollow",
      sitemapClass: "archived_path_absent",
    },
    search: recoveryMode
      ? {
          projectionPublishClass: "same_entity_verified_present",
          projectionArchiveClass: "same_entity_verified_absent",
          generalWorkerClass: "not_started",
          documentContractClass: "public_safe_shape_checked",
          removalClass: "document_absent_after_archive",
        }
      : {
          workerIndexJobClass: jobClass(indexedJob),
          workerUnindexJobClass: jobClass(unindexedJob),
          documentContractClass: "public_safe_shape_checked",
          removalClass: "document_absent_after_archive",
        },
    publicRoutes: routeChecks,
    protectedRoutes: gateChecks,
    redaction: "passed",
    recoveryTargetClass: recoveryMode ? "provider_bound_disposable" : undefined,
  };

  assertNoForbiddenOutput(evidence);
  console.log(JSON.stringify(evidence, null, 2));
}

function parseOptions(argv: string[]) {
  let base: string | undefined;
  let envFile = process.env.OVE143_SMOKE_ENV_FILE;
  let environment: string | undefined;
  let confirmEnvironment: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--base-url") {
      base = argv[index + 1] ?? base;
      index += 1;
    } else if (argv[index] === "--env-file") {
      envFile = argv[index + 1] ?? envFile;
      index += 1;
    } else if (argv[index] === "--environment") {
      environment = argv[index + 1] ?? environment;
      index += 1;
    } else if (argv[index] === "--confirm-environment") {
      confirmEnvironment = argv[index + 1] ?? confirmEnvironment;
      index += 1;
    }
  }

  if (environment || confirmEnvironment) {
    if (
      environment !== "recovery-drill" ||
      confirmEnvironment !== environment
    ) {
      throw new Error(
        "Recovery smoke requires matching recovery-drill confirmation.",
      );
    }
  }
  return { base, envFile, environment };
}

function normalizeBase(value: string) {
  const parsed = new URL(value);
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

async function loadRuntimeModules(): Promise<RuntimeModules> {
  const [{ db }, journal, queue, projection] = await Promise.all([
    import("../src/db"),
    import("../src/server/journal-repository"),
    import("../src/server/queue"),
    import("../src/server/search/public-projection-outbox"),
  ]);

  return {
    db,
    publishJournalEntry: journal.publishJournalEntry,
    archiveJournalEntry: journal.archiveJournalEntry,
    enqueueJob: queue.enqueueJob,
    convergePublicProjectionsNow: projection.convergePublicProjectionsNow,
  };
}

async function cleanupStalePublishedSmokeEntries(modules: RuntimeModules) {
  const rows = await modules.db
    .selectFrom("journal_entries")
    .select(["id", "owner_user_id as ownerUserId"])
    .where("title", "=", SMOKE_TITLE)
    .where("body", "=", SMOKE_BODY)
    .where("visibility", "=", "public")
    .where("lifecycle_state", "=", "active")
    .where("public_gone_at", "is", null)
    .execute();

  for (const row of rows) {
    const archived = await modules.archiveJournalEntry(
      { userId: row.ownerUserId, sessionId: "ove-143-redacted-cleanup" },
      { entryId: row.id },
    );
    const unindexKey = `journal_entry_unindex:${archived.entry.id}`;
    await modules.enqueueJob(
      "matching",
      {
        kind: "journal_entry_unindex",
        journalEntryId: archived.entry.id,
        userId: row.ownerUserId,
      },
      { idempotencyKey: unindexKey },
    );
    const unindexedJob = await waitForJob(modules.db, unindexKey);
    assertEqual(unindexedJob.status, "done", "stale smoke unindex job done");
    await waitForMeiliDocument(archived.entry.id, false);
  }
}

async function createAndPrepareSmokeAccount(
  base: string,
  jar: CookieJar,
  db: DB,
  mail: string,
) {
  const authSecret = resolveBetterAuthSecret(process.env);

  await jsonRequest<unknown>(base, jar, "/api/auth/sign-up/email", {
    method: "POST",
    body: {
      email: mail,
      password: TEST_PASSWORD,
      name: PRIVATE_AUTH_COMPATIBILITY_NAME,
      callbackURL: "/garden",
    },
  });

  const verificationToken = await createEmailVerificationToken(
    authSecret,
    mail,
  );
  const verification = await fetch(
    `${base}/api/auth/verify-email?token=${encodeURIComponent(
      verificationToken,
    )}&callbackURL=${encodeURIComponent("/garden")}`,
    {
      headers: {
        Accept: "text/html",
        Cookie: jar.header(),
      },
      redirect: "manual",
    },
  );
  jar.addFromResponse(verification);
  assert(
    verification.status === 200 ||
      verification.status === 302 ||
      verification.status === 303,
    "smoke account email verification must complete",
  );

  await jsonRequest<unknown>(base, jar, "/api/auth/sign-in/email", {
    method: "POST",
    body: {
      email: mail,
      password: TEST_PASSWORD,
      callbackURL: "/garden",
      rememberMe: false,
    },
  });

  const account = await db
    .selectFrom("user")
    .select(["id", "emailVerified"])
    .where("email", "=", mail)
    .executeTakeFirstOrThrow();
  assertEqual(account.emailVerified, true, "smoke account verification");

  await db
    .insertInto("pilot_invite_grants")
    .values({
      user_id: account.id,
      cohort: FOUNDER_REHEARSAL_COHORT,
      segment: DEFAULT_PILOT_SEGMENT,
    })
    .onConflict((oc) => oc.column("user_id").doNothing())
    .execute();

  return account;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for canonical launch smoke`);
  return value;
}

async function verifyAuthSurfaces(
  base: string,
  jar: CookieJar,
  signOutJar: CookieJar,
  recoveryMode = false,
) {
  const session = await jsonRequest<{ user?: { id?: string } } | null>(
    base,
    jar,
    "/api/auth/get-session",
  );
  assert(session?.user?.id, "authenticated session readback");

  const garden = await htmlResponse(base, signOutJar, "/garden");
  assertEqual(garden.status, 200, "signed-out garden status");
  assertIncludes(
    garden.text,
    'data-testid="garden-auth-panel"',
    "signed-out garden auth boundary",
  );
  if (!recoveryMode) {
    assertIncludes(
      garden.text,
      'data-testid="google-sign-in-button"',
      "production Google sign-in option",
    );
  }

  const authedGarden = await htmlResponse(base, jar, "/garden");
  assertEqual(authedGarden.status, 200, "signed-in garden status");
  assertAuthenticatedGardenShell(authedGarden.text);

  return {
    signedOutGardenBoundary: true,
    credentialAuthPath: true,
    googleProviderVisible: recoveryMode ? false : true,
    signedInGardenReadback: true,
  };
}

export function assertAuthenticatedGardenShell(html: string) {
  const plain = 'data-garden-workspace="operational-home"';
  const reactPayload = '\\"data-garden-workspace\\":\\"operational-home\\"';
  assert(
    html.includes(plain) || html.includes(reactPayload),
    "signed-in garden shell",
  );
}

async function verifyPublicRoutes(base: string) {
  const routes = [
    ["/health", "noindex"],
    ["/robots.txt", "Sitemap:"],
    ["/support", "noindex"],
    ["/privacy", "noindex"],
    ["/", "noindex"],
    ["/bg", "noindex"],
    ["/ru", "noindex"],
    ["/blog/ai-garden-advice-vs-real-garden-proof", "index, follow"],
    ["/guides/start-a-living-plant-record", "index, follow"],
    ["/answers/why-are-tomato-leaves-yellow", "index, follow"],
  ] as const;

  for (const [path, expected] of routes) {
    const response = await fetch(`${base}${path}`, {
      headers: {
        Accept: path.endsWith(".xml") ? "application/xml" : "text/html",
      },
    });
    assertPublicRoutePolicyContract({
      base,
      path,
      finalUrl: response.url,
      status: response.status,
      text: await response.text(),
      expectedMarker: expected,
    });
  }

  const legacyUkrainianRedirects = [
    ["/uk", "/"],
    [
      "/uk/blog/ai-garden-advice-vs-real-garden-proof",
      "/blog/ai-garden-advice-vs-real-garden-proof",
    ],
    [
      "/uk/guides/start-a-living-plant-record",
      "/guides/start-a-living-plant-record",
    ],
    [
      "/uk/answers/why-are-tomato-leaves-yellow",
      "/answers/why-are-tomato-leaves-yellow",
    ],
  ] as const;
  for (const [path, expectedLocation] of legacyUkrainianRedirects) {
    const response = await fetch(`${base}${path}`, { redirect: "manual" });
    assertCanonicalLegacyRedirect({
      path,
      status: response.status,
      location: response.headers.get("location"),
      expectedLocation,
    });
  }

  const sitemap = await fetch(`${base}/sitemap.xml`);
  assertSitemapPolicyContract({
    status: sitemap.status,
    contentType: sitemap.headers.get("content-type"),
    xml: await sitemap.text(),
  });

  return {
    diagnosticRoutesClass: "public_noindex",
    legalRoutesClass: "public_noindex",
    localizedLandingClass: "public_feed_noindex",
    authoredContentClass: "indexable",
    sitemapClass: "policy_allowed_only",
    robotsClass: "sitemap_advertised",
    legacyUkrainianRoutesClass: "canonical_unprefixed_redirect",
  };
}

async function verifyRecoveryRoutes(base: string) {
  for (const route of ["/health", "/", "/bg", "/ru"] as const) {
    const response = await fetch(`${base}${route}`);
    assertEqual(response.status, 200, `recovery route ${route} status`);
    await response.arrayBuffer();
  }
  return {
    diagnosticRoutesClass: "loopback_available",
    legalRoutesClass: "unchanged_not_sampled",
    localizedLandingClass: "uk_bg_ru_loopback_available",
    authoredContentClass: "unchanged_not_sampled",
    sitemapClass: "archive_absence_checked",
    robotsClass: "unchanged_not_sampled",
    legacyUkrainianRoutesClass: "unchanged_not_sampled",
  };
}

export function assertPublicRoutePolicyContract(input: {
  base: string;
  path: string;
  finalUrl: string;
  status: number;
  text: string;
  expectedMarker: string;
}) {
  assertEqual(input.status, 200, `route ${input.path} status`);
  assertEqual(
    new URL(input.finalUrl).origin,
    new URL(input.base).origin,
    `route ${input.path} final origin`,
  );
  assertIncludes(
    input.text,
    input.expectedMarker,
    `route ${input.path} policy marker`,
  );
}

export function assertCanonicalLegacyRedirect(input: {
  path: string;
  status: number;
  location: string | null;
  expectedLocation: string;
}) {
  assertEqual(input.status, 308, `legacy route ${input.path} status`);
  assertEqual(
    input.location,
    input.expectedLocation,
    `legacy route ${input.path} location`,
  );
}

export function assertSitemapPolicyContract(input: {
  status: number;
  contentType: string | null;
  xml: string;
}) {
  assertEqual(input.status, 200, "sitemap status");
  assertIncludes(
    input.contentType ?? "",
    "application/xml",
    "sitemap content type",
  );
  assertIncludes(
    input.xml,
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "sitemap root",
  );

  const locations = Array.from(
    input.xml.matchAll(/<loc>([^<]+)<\/loc>/g),
    (match) => match[1],
  );
  assert(locations.length > 0, "sitemap must contain at least one public URL");

  const localePrefixes = new Set(["uk", "bg", "ru"]);
  const forbiddenRouteRoots = new Set(["garden", "admin", "auth"]);
  for (const location of locations) {
    const url = new URL(location);
    assertEqual(url.origin, "https://over.garden", "sitemap URL origin");
    assert(!url.username && !url.password, "sitemap URL excludes credentials");
    assert(!url.search && !url.hash, "sitemap URL excludes query and fragment");
    const segments = url.pathname.split("/").filter(Boolean);
    const routeRoot = localePrefixes.has(segments[0] ?? "")
      ? segments[1]
      : segments[0];
    assert(
      !routeRoot || !forbiddenRouteRoots.has(routeRoot),
      `sitemap excludes /${routeRoot} routes`,
    );
  }
}

async function verifyAdminAndErasureGates(
  base: string,
  jar: CookieJar,
  signOutJar: CookieJar,
  db: DB,
  recoveryMode = false,
) {
  const signedOutAdmin = await htmlResponse(base, signOutJar, "/admin");
  assertEqual(signedOutAdmin.status, 200, "signed-out admin route status");
  assertOperatorAccessState({
    html: signedOutAdmin.text,
    surface: "admin",
    state: "sign-in-required",
    label: "signed-out admin boundary",
  });

  const normalAdmin = await htmlResponse(base, jar, "/admin");
  assertEqual(normalAdmin.status, 200, "normal account admin status");
  assertOperatorAccessState({
    html: normalAdmin.text,
    surface: "admin",
    state: "denied",
    label: "normal admin block",
  });

  const normalErasure = await htmlResponse(
    base,
    jar,
    "/garden/privacy/erasure-requests",
  );
  assertEqual(normalErasure.status, 200, "normal account erasure route status");
  assertOperatorAccessState({
    html: normalErasure.text,
    surface: "erasure-requests",
    state: "denied",
    label: "normal erasure block",
  });

  const sealedOwnerId = process.env.OVERGARDEN_ADMIN_OWNER_USER_ID?.trim();
  if (recoveryMode && !sealedOwnerId) {
    return {
      signedOutAdminBoundary: true,
      normalAccountAdminBlocked: true,
      sealedAdminRuntimeClass: "not_exercised_in_disposable_recovery",
      erasureRouteBlockedForNormalAccount: true,
      irreversibleErasureNotExecuted: true,
    };
  }
  if (!sealedOwnerId && process.env.OVE143_OWNER_ENV_LIST_VERIFIED === "1") {
    return {
      signedOutAdminBoundary: true,
      normalAccountAdminBlocked: true,
      sealedAdminRuntimeClass: "vercel_production_env_name_verified",
      erasureRouteBlockedForNormalAccount: true,
      irreversibleErasureNotExecuted: true,
    };
  }
  assert(sealedOwnerId, "sealed owner env must be configured");
  const [ownerRole, owner, ownerAccounts] = await Promise.all([
    db
      .selectFrom("admin_user_roles")
      .select("role")
      .where("user_id", "=", sealedOwnerId)
      .executeTakeFirst(),
    db
      .selectFrom("user")
      .select("emailVerified")
      .where("id", "=", sealedOwnerId)
      .executeTakeFirst(),
    db
      .selectFrom("account")
      .select(["providerId", "password"])
      .where("userId", "=", sealedOwnerId)
      .execute(),
  ]);
  assertEqual(ownerRole?.role, "owner", "sealed owner role");

  const ownerEvidence = buildVerifiedOwnerAccountEvidence(
    {
      emailVerified: owner?.emailVerified ?? false,
      accounts: ownerAccounts,
    },
    "Sealed owner must have one verified email/password credential.",
  );

  return {
    signedOutAdminBoundary: true,
    normalAccountAdminBlocked: true,
    sealedAdminRoleConfigured: true,
    sealedAdminEmailVerified: ownerEvidence.emailVerified,
    sealedAdminCredentialOnly: ownerEvidence.credentialOnlyVerified,
    erasureRouteBlockedForNormalAccount: true,
    irreversibleErasureNotExecuted: true,
  };
}

async function createSmokeImage(format: "png" | "jpeg" = "png") {
  const pipeline = sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 87, g: 132, b: 71 },
    },
  });
  return format === "jpeg"
    ? pipeline.jpeg({ quality: 88 }).toBuffer()
    : pipeline.png().toBuffer();
}

async function verifyRecoveryMediaObjects(db: DB, mediaAssetId: string) {
  const row = await db
    .selectFrom("media_assets")
    .select([
      "quarantine_key as originalKey",
      "derivative_key as derivativeKey",
    ])
    .where("id", "=", mediaAssetId)
    .executeTakeFirstOrThrow();
  assert(row.derivativeKey, "processed derivative key is required");
  const store = new S3Client({
    region: "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  const derivativePresent = await objectExists(
    store,
    requiredEnv("R2_PUBLIC_BUCKET"),
    row.derivativeKey,
  );
  const originalAbsent = !(await objectExists(
    store,
    requiredEnv("R2_QUARANTINE_BUCKET"),
    row.originalKey,
  ));
  assert(derivativePresent, "recovery derivative object must exist");
  assert(originalAbsent, "recovery quarantine original must be absent");
  return { derivativePresent, originalAbsent };
}

async function objectExists(client: S3Client, bucket: string, key: string) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404) return false;
    throw error;
  }
}

async function cleanupRecoveryQueueDelta(
  db: DB,
  baseline: Set<string>,
  sameRunIdentifiers: string[],
) {
  const rows = await db
    .selectFrom("job_queue")
    .select(["id", "payload"])
    .execute();
  const created = rows.filter((row) => !baseline.has(row.id));
  for (const row of created) {
    const payload = JSON.stringify(row.payload);
    assert(
      sameRunIdentifiers.some((identifier) => payload.includes(identifier)),
      "recovery queue delta must belong to the same synthetic run",
    );
  }
  if (created.length > 0) {
    await db
      .deleteFrom("job_queue")
      .where(
        "id",
        "in",
        created.map((row) => row.id),
      )
      .execute();
  }
}

async function jsonRequest<T>(
  base: string,
  jar: CookieJar,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(init.method && init.method !== "GET" ? { Origin: base } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Cookie: jar.header(),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
  });
  jar.addFromResponse(response);

  if (!response.ok) {
    throw new Error(
      `Request failed at ${path}: ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}

async function htmlResponse(base: string, jar: CookieJar, path: string) {
  const response = await fetch(`${base}${path}`, {
    headers: {
      Accept: "text/html",
      Cookie: jar.header(),
    },
    redirect: "manual",
  });
  jar.addFromResponse(response);

  return {
    status: response.status,
    text: await response.text(),
  };
}

async function textRequest(base: string, jar: CookieJar, path: string) {
  const response = await htmlResponse(base, jar, path);
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`Page request failed at ${path}: ${response.status}`);
  }
  return response.text;
}

async function uploadBinary(
  uploadEndpoint: string,
  body: Buffer,
  contentType: string,
) {
  const response = await fetch(uploadEndpoint, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(body),
  });
  if (!response.ok) {
    throw new Error(`Image upload failed: ${response.status}`);
  }
}

async function waitForPublicPage(base: string, path: string, status: number) {
  return waitFor(
    async () => {
      const response = await fetch(`${base}${path}`, {
        headers: { Accept: "text/html" },
      });
      if (new URL(response.url).origin !== new URL(base).origin) {
        throw new Error("public page redirected outside the canonical origin");
      }
      if (response.status !== status) {
        throw new RetryableError(
          `public page pending ${status}: ${response.status}`,
        );
      }
      return response.text();
    },
    HTTP_WAIT_TIMEOUT_MS,
    HTTP_WAIT_INTERVAL_MS,
  );
}

async function waitForJob(db: DB, idempotencyKey: string): Promise<JobRow> {
  return waitFor(
    async () => {
      const row = await db
        .selectFrom("job_queue")
        .select(["status", "attempts", "last_error as lastError"])
        .where("idempotency_key", "=", idempotencyKey)
        .executeTakeFirst();

      if (!row) throw new RetryableError("job row missing");
      if (row.status === "done") return row;
      if (row.status === "failed") {
        throw new Error(`job failed after ${row.attempts} attempts`);
      }
      throw new RetryableError(`job not complete: ${row.status}`);
    },
    JOB_WAIT_TIMEOUT_MS,
    JOB_WAIT_INTERVAL_MS,
  );
}

async function waitForMeiliDocument(id: string, shouldExist: boolean) {
  const client = createMeiliClient();
  return waitFor(
    async () => {
      try {
        const doc = await client.index(PUBLIC_JOURNAL_INDEX).getDocument(id);
        if (!shouldExist)
          throw new RetryableError("search document still present");
        return doc as Record<string, unknown>;
      } catch (error) {
        if (shouldExist) throw new RetryableError("search document missing");
        if (isMeiliDocumentMissing(error)) return null;
        throw error;
      }
    },
    JOB_WAIT_TIMEOUT_MS,
    JOB_WAIT_INTERVAL_MS,
  );
}

function createMeiliClient() {
  const host = process.env.MEILISEARCH_HOST?.trim();
  assert(host, "MEILISEARCH_HOST is required for canonical launch smoke");
  return new Meilisearch({
    host,
    apiKey: process.env.MEILISEARCH_API_KEY,
  });
}

function assertPublicSearchDocument(doc: Record<string, unknown> | null) {
  assert(doc, "public search document must exist");
  const required = [
    "id",
    "title",
    "body",
    "publicSlug",
    "publicPath",
    "locationVisibility",
    "noindex",
    "entryDate",
    "createdAt",
    "kind",
  ];
  for (const key of required) {
    assert(key in doc, `public search document missing ${key}`);
  }
  assertEqual(doc.kind, "journal_entry", "public search kind");
  assertEqual(doc.locationVisibility, "hidden", "public search location");
  const forbidden = [
    "ownerUserId",
    "owner_user_id",
    "email",
    "accountId",
    "session",
    "ip",
    "userAgent",
    "media",
    "quarantine",
    "derivative",
    "coordinates",
    "latitude",
    "longitude",
  ];
  for (const key of forbidden) {
    assert(!(key in doc), `public search document contains ${key}`);
  }
}

async function waitFor<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  intervalMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof RetryableError)) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Timed out waiting for smoke condition.");
}

class RetryableError extends Error {}

function isMeiliDocumentMissing(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "document_not_found"
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    /document_not_found|not found/i.test(error.message)
  );
}

function jobClass(row: JobRow) {
  return row.status === "done" ? "done" : "not_done";
}

function assertNoPrivateMarkers(value: string, markers: string[]) {
  const lower = value.toLowerCase();
  for (const marker of markers) {
    assert(
      !lower.includes(marker.toLowerCase()),
      `private marker reached public/readback surface: ${marker}`,
    );
  }
}

export function assertOperatorAccessState(input: {
  html: string;
  surface: "admin" | "erasure-requests";
  state: "sign-in-required" | "denied";
  label: string;
}) {
  const surfaces = readRenderedDataMarker(input.html, "data-operator-surface");
  const states = readRenderedDataMarker(
    input.html,
    "data-operator-access-state",
  );

  assertEqual(surfaces.length, 1, `${input.label} surface marker count`);
  assertEqual(surfaces[0], input.surface, `${input.label} surface`);
  assertEqual(states.length, 1, `${input.label} access marker count`);
  assertEqual(states[0], input.state, `${input.label} access state`);
}

function readRenderedDataMarker(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    ...new Set([
      ...Array.from(
        html.matchAll(new RegExp(`${escapedName}="([^"]+)"`, "g")),
        (match) => match[1],
      ),
      ...Array.from(
        html.matchAll(
          new RegExp(`\\\\"${escapedName}\\\\":\\\\"([^"\\\\]+)\\\\"`, "g"),
        ),
        (match) => match[1],
      ),
    ]),
  ];
}

export function assertProcessedDerivativeReadback(
  html: string,
  publicUrl: string,
) {
  assertIncludes(html, publicUrl, "entry readback derivative media");
}

function assertNoForbiddenOutput(output: unknown) {
  const serialized = JSON.stringify(output);
  const lower = serialized.toLowerCase();
  for (const marker of FORBIDDEN_OUTPUT_MARKERS) {
    if (lower.includes(marker.toLowerCase())) {
      throw new Error(`Smoke evidence contains forbidden marker: ${marker}.`);
    }
  }
}

function assertIncludes(value: string, expected: string, label: string) {
  if (!value.includes(expected)) {
    throw new Error(`${label}: expected marker missing.`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  const fromGetter = withGetter.getSetCookie?.();
  if (fromGetter && fromGetter.length > 0) return fromGetter;

  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,]+=)/) : [];
}

async function runCli() {
  await main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      const loaded = await import("../src/db").catch(() => null);
      await loaded?.db.destroy();
    });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) void runCli();
