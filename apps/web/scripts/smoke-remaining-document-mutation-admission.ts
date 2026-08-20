import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import {
  buildAuthenticatedMutationDeploymentReceipt,
  type AuthenticatedMutationDeploymentReceipt,
} from "../src/server/authenticated-mutation-deployment-receipt";

const ADMISSION_HEADER = "x-overgarden-document-generation";
const READBACK_PATH = "/api/document-mutation-admission/readback";
const CONTINUITY_PATH = "/api/document-mutation-admission/continuity";
const SESSION_PATH = "/api/auth/get-session?disableCookieCache=true";
const NOTIFICATION_RECEIPT_PATH = "/api/notifications/receipts";
const UNLINK_ACCOUNT_PATH = "/api/auth/unlink-account";
const GOOGLE_SIGN_IN_PATH = "/api/auth/sign-in/social";
const FACEBOOK_CALLBACK_PATH = "/api/auth/callback/facebook?code=reject-only";
const SIGNED_OWNER_DOCUMENT_PATH = "/garden/profile";
const REQUEST_TIMEOUT_MS = 10_000;

export type RemainingDocumentMutationSmokeFamily =
  | "remainder"
  | "account-disconnect"
  | "provider-authority-negative";

const REQUIRED_FAMILIES: readonly RemainingDocumentMutationSmokeFamily[] = [
  "remainder",
  "account-disconnect",
  "provider-authority-negative",
];

export interface RemainingDocumentMutationSmokeSessions {
  ownerACookie: string;
  ownerBCookie: string;
}

export interface RemainingDocumentMutationEffectCounts {
  notificationReceipts: number;
  ownerBGoogleAccounts: number;
  facebookAccounts: number;
}

interface EffectCountScope {
  eventKey: string;
  ownerBUserId: string;
}

interface OwnerDocumentJourneyInput {
  baseUrl: string;
  ownerACookie: string;
  commonHeaders: Record<string, string>;
}

interface OwnerDocumentJourneyReceipt {
  documentGeneration: string;
  ownerDocumentRendered: true;
}

export interface RemainingDocumentMutationAdmissionSmokeOptions {
  environment: string;
  mode: string;
  baseUrl: string;
  expectedSha: string;
  families: readonly RemainingDocumentMutationSmokeFamily[];
  excludeExplicitGoogleLink: boolean;
  redacted: boolean;
  sessions: RemainingDocumentMutationSmokeSessions;
  fetchImpl?: typeof fetch;
  readEffectCounts: (
    scope: EffectCountScope,
  ) => Promise<RemainingDocumentMutationEffectCounts>;
  readOwnerDocumentGeneration: (
    input: OwnerDocumentJourneyInput,
  ) => Promise<OwnerDocumentJourneyReceipt>;
  protectionBypass?: string;
}

export interface RemainingDocumentMutationAdmissionSmokeReport {
  issue: "OVE-291";
  evidenceClass: "exact-sha-reject-only-zero-effect";
  exactSha: true;
  deploymentReceipts: {
    registryDigestMatch: true;
    enforcementReceiptDigestMatch: true;
    explicitGoogleLinkOwnershipDigestMatch: true;
  };
  rejectionFamilies: {
    remainderUser: true;
    accountDisconnect: true;
  };
  documentContinuity: {
    ownerDocumentRendered: true;
  };
  providerAuthorities: {
    ordinaryGoogleOpen: true;
    facebookInitiationRetired: true;
    facebookCallbackRetired: true;
    explicitGoogleLinkInvoked: false;
  };
  effects: {
    before: RemainingDocumentMutationEffectCounts;
    after: RemainingDocumentMutationEffectCounts;
    digestMatch: true;
  };
  evidenceSafety: "counts_digests_classes_and_sha_only";
}

export async function runRemainingDocumentMutationAdmissionSmoke(
  options: RemainingDocumentMutationAdmissionSmokeOptions,
): Promise<RemainingDocumentMutationAdmissionSmokeReport> {
  if (options.environment !== "production" || options.mode !== "reject-only") {
    throw new Error("OVE-291 smoke requires production reject-only execution.");
  }
  const baseUrl = normalizeImmutableDeploymentBase(options.baseUrl);
  requireCommit(options.expectedSha);
  requireExactFamilies(options.families);
  if (!options.excludeExplicitGoogleLink || !options.redacted) {
    throw new Error(
      "OVE-291 smoke requires explicit-link exclusion and redacted evidence.",
    );
  }
  const sessions = requireSessions(options.sessions);
  const commonHeaders: Record<string, string> = {};
  if (options.protectionBypass) {
    commonHeaders["x-vercel-protection-bypass"] = requireBoundedOpaque(
      options.protectionBypass,
    );
  }

  const requestedPaths: string[] = [];
  const fetchImpl = options.fetchImpl ?? fetch;
  const smokeFetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    requestedPaths.push(url.pathname);
    if (
      url.pathname === "/api/auth/link-social" ||
      url.pathname === "/api/auth/callback/google"
    ) {
      throw new Error("OVE-291 explicit Google-link runtime was invoked.");
    }
    return fetchImpl(input, init);
  };

  const sourceReceipt = buildAuthenticatedMutationDeploymentReceipt();
  const readback = await fetchJson(smokeFetch, `${baseUrl}${READBACK_PATH}`, {
    headers: commonHeaders,
  });
  requireReadback(readback, options.expectedSha, sourceReceipt);

  const [ownerAUserId, ownerBUserId] = await Promise.all([
    readSessionUserId(
      smokeFetch,
      baseUrl,
      sessions.ownerACookie,
      commonHeaders,
    ),
    readSessionUserId(
      smokeFetch,
      baseUrl,
      sessions.ownerBCookie,
      commonHeaders,
    ),
  ]);
  if (ownerAUserId === ownerBUserId) {
    throw new Error("OVE-291 smoke requires two distinct session owners.");
  }

  const eventKey = randomBytes(16).toString("hex");
  const effectScope = { eventKey, ownerBUserId };
  const before = normalizeEffectCounts(
    await options.readEffectCounts(effectScope),
  );
  requireRejectOnlyPreState(before);

  const ownerDocument = await options.readOwnerDocumentGeneration({
    baseUrl,
    ownerACookie: sessions.ownerACookie,
    commonHeaders,
  });
  const documentGeneration = requireGeneration(
    ownerDocument.documentGeneration,
  );
  if (!ownerDocument.ownerDocumentRendered) {
    throw new Error("OVE-291 owner document receipt was incomplete.");
  }

  await expectContinuityMatch({
    fetchImpl: smokeFetch,
    baseUrl,
    cookie: sessions.ownerACookie,
    generation: documentGeneration,
    commonHeaders,
  });
  await expectOwnerChanged({
    fetchImpl: smokeFetch,
    url: `${baseUrl}${NOTIFICATION_RECEIPT_PATH}`,
    cookie: sessions.ownerBCookie,
    generation: documentGeneration,
    commonHeaders,
    body: new URLSearchParams({
      eventKey,
      receiptState: "read",
      returnTo: "/notifications",
    }),
    contentType: "application/x-www-form-urlencoded",
  });
  await expectOwnerChanged({
    fetchImpl: smokeFetch,
    url: `${baseUrl}${UNLINK_ACCOUNT_PATH}`,
    cookie: sessions.ownerBCookie,
    generation: documentGeneration,
    commonHeaders,
    body: JSON.stringify({ providerId: "google" }),
    contentType: "application/json",
  });

  await proveProviderAuthorities(smokeFetch, baseUrl, commonHeaders);

  const after = normalizeEffectCounts(
    await options.readEffectCounts(effectScope),
  );
  requireRejectOnlyPostState(after);
  if (effectCountDigest(before) !== effectCountDigest(after)) {
    throw new Error("OVE-291 reject-only effect counts changed.");
  }
  if (
    requestedPaths.includes("/api/auth/link-social") ||
    requestedPaths.includes("/api/auth/callback/google")
  ) {
    throw new Error("OVE-291 explicit Google-link runtime was invoked.");
  }

  return {
    issue: "OVE-291",
    evidenceClass: "exact-sha-reject-only-zero-effect",
    exactSha: true,
    deploymentReceipts: {
      registryDigestMatch: true,
      enforcementReceiptDigestMatch: true,
      explicitGoogleLinkOwnershipDigestMatch: true,
    },
    rejectionFamilies: {
      remainderUser: true,
      accountDisconnect: true,
    },
    documentContinuity: { ownerDocumentRendered: true },
    providerAuthorities: {
      ordinaryGoogleOpen: true,
      facebookInitiationRetired: true,
      facebookCallbackRetired: true,
      explicitGoogleLinkInvoked: false,
    },
    effects: { before, after, digestMatch: true },
    evidenceSafety: "counts_digests_classes_and_sha_only",
  };
}

async function expectContinuityMatch(input: {
  fetchImpl: typeof fetch;
  baseUrl: string;
  cookie: string;
  generation: string;
  commonHeaders: Record<string, string>;
}) {
  const response = await input.fetchImpl(`${input.baseUrl}${CONTINUITY_PATH}`, {
    method: "POST",
    headers: {
      ...input.commonHeaders,
      cookie: input.cookie,
      [ADMISSION_HEADER]: input.generation,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => null)) as {
    code?: unknown;
  } | null;
  if (
    response.status !== 200 ||
    payload?.code !== "MATCH" ||
    !response.headers.get("cache-control")?.includes("no-store")
  ) {
    throw new Error("OVE-291 owner-A continuity did not match.");
  }
}

async function expectOwnerChanged(input: {
  fetchImpl: typeof fetch;
  url: string;
  cookie: string;
  generation: string;
  commonHeaders: Record<string, string>;
  body: BodyInit;
  contentType: string;
}) {
  const response = await input.fetchImpl(input.url, {
    method: "POST",
    headers: {
      ...input.commonHeaders,
      cookie: input.cookie,
      "content-type": input.contentType,
      [ADMISSION_HEADER]: input.generation,
    },
    body: input.body,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => null)) as {
    code?: unknown;
  } | null;
  if (
    response.status !== 409 ||
    payload?.code !== "DOCUMENT_OWNER_CHANGED" ||
    !response.headers.get("cache-control")?.includes("no-store")
  ) {
    throw new Error("OVE-291 returned an unexpected closed result.");
  }
}

async function proveProviderAuthorities(
  fetchImpl: typeof fetch,
  baseUrl: string,
  commonHeaders: Record<string, string>,
) {
  const google = await fetchImpl(`${baseUrl}${GOOGLE_SIGN_IN_PATH}`, {
    method: "POST",
    headers: {
      ...commonHeaders,
      "content-type": "application/json",
      origin: "https://over.garden",
    },
    body: JSON.stringify({ provider: "google", callbackURL: "/garden" }),
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const googleBody = await google.text();
  const googleLocation = google.headers.get("location") ?? "";
  if (
    google.status < 200 ||
    google.status >= 400 ||
    !/accounts\.google\.com|google\.com\/o\/oauth/i.test(
      `${googleBody}\n${googleLocation}`,
    ) ||
    /DOCUMENT_(?:OWNER|SESSION|PROTOCOL)|MUTATION_ADMISSION/.test(googleBody)
  ) {
    throw new Error("OVE-291 ordinary Google authentication changed.");
  }

  const facebookInitiation = await fetchImpl(
    `${baseUrl}${GOOGLE_SIGN_IN_PATH}`,
    {
      method: "POST",
      headers: {
        ...commonHeaders,
        "content-type": "application/json",
        origin: "https://over.garden",
      },
      body: JSON.stringify({ provider: "facebook", callbackURL: "/garden" }),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  await requireRetiredFacebookDenial(facebookInitiation);

  const facebookCallback = await fetchImpl(
    `${baseUrl}${FACEBOOK_CALLBACK_PATH}`,
    {
      headers: commonHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  await requireRetiredFacebookDenial(facebookCallback);
}

async function requireRetiredFacebookDenial(response: Response) {
  const body = await response.text();
  if (
    response.status !== 404 ||
    body !== "" ||
    response.headers.get("set-cookie") !== null ||
    response.headers.get("location") !== null ||
    !response.headers.get("cache-control")?.includes("no-store")
  ) {
    throw new Error("OVE-291 retired Facebook denial changed.");
  }
}

async function readSessionUserId(
  fetchImpl: typeof fetch,
  baseUrl: string,
  cookie: string,
  commonHeaders: Record<string, string>,
): Promise<string> {
  const response = await fetchImpl(`${baseUrl}${SESSION_PATH}`, {
    headers: { ...commonHeaders, cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => null)) as {
    user?: { id?: unknown };
  } | null;
  if (!response.ok || typeof payload?.user?.id !== "string") {
    throw new Error("OVE-291 synthetic session read-back was unavailable.");
  }
  return requireBoundedIdentity(payload.user.id);
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("OVE-291 read-back was unavailable.");
  return response.json();
}

function requireReadback(
  value: unknown,
  expectedSha: string,
  sourceReceipt: AuthenticatedMutationDeploymentReceipt,
) {
  if (!value || typeof value !== "object") {
    throw new Error("OVE-291 read-back was malformed.");
  }
  const readback = value as {
    protocol?: unknown;
    deploymentSha?: unknown;
    enforcement?: unknown;
    authenticatedMutation?: unknown;
  };
  if (
    readback.protocol !== "overgarden.document-mutation-generation.v1" ||
    readback.deploymentSha !== expectedSha ||
    readback.enforcement !== "enabled"
  ) {
    throw new Error("OVE-291 exact-SHA admission read-back did not match.");
  }
  if (
    JSON.stringify(readback.authenticatedMutation) !==
    JSON.stringify(sourceReceipt)
  ) {
    throw new Error("OVE-291 deployment artifact receipt did not match.");
  }
  if (
    sourceReceipt.enforcement.ove291EntrypointCount !== 125 ||
    sourceReceipt.enforcement.ove291ConsumerEdgeCount !== 350 ||
    sourceReceipt.explicitGoogleLink.entrypointCount !== 5 ||
    sourceReceipt.explicitGoogleLink.consumerEdgeCount !== 15 ||
    sourceReceipt.explicitGoogleLink.ownershipDigest !==
      "9f9273ac6222c4e04cc77069dc14bfebc3860218d6791623055c27420687adad"
  ) {
    throw new Error("OVE-291 source artifact receipt was not final.");
  }
}

function requireExactFamilies(
  families: readonly RemainingDocumentMutationSmokeFamily[],
) {
  const normalized = [...new Set(families)].sort();
  const expected = [...REQUIRED_FAMILIES].sort();
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    throw new Error("OVE-291 smoke requires the exact three-family set.");
  }
}

function requireSessions(
  sessions: RemainingDocumentMutationSmokeSessions,
): RemainingDocumentMutationSmokeSessions {
  const ownerACookie = requireCookie(sessions.ownerACookie);
  const ownerBCookie = requireCookie(sessions.ownerBCookie);
  if (ownerACookie === ownerBCookie) {
    throw new Error("OVE-291 smoke requires distinct private sessions.");
  }
  return { ownerACookie, ownerBCookie };
}

function requireCookie(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 16 ||
    normalized.length > 8_192 ||
    /[\r\n]/.test(normalized)
  ) {
    throw new Error("A bounded private smoke session is required.");
  }
  return normalized;
}

function requireGeneration(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 1_024 ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    throw new Error("A bounded opaque document generation is required.");
  }
  return normalized;
}

function requireBoundedIdentity(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 256 ||
    /[\r\n]/.test(normalized)
  ) {
    throw new Error("OVE-291 session identity was malformed.");
  }
  return normalized;
}

function requireBoundedOpaque(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 1_024 || /[\r\n]/.test(normalized)) {
    throw new Error("A bounded deployment protection value is required.");
  }
  return normalized;
}

function normalizeEffectCounts(
  counts: RemainingDocumentMutationEffectCounts,
): RemainingDocumentMutationEffectCounts {
  const normalized = {
    notificationReceipts: Number(counts.notificationReceipts),
    ownerBGoogleAccounts: Number(counts.ownerBGoogleAccounts),
    facebookAccounts: Number(counts.facebookAccounts),
  };
  if (
    Object.values(normalized).some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    )
  ) {
    throw new Error("OVE-291 effect counts were invalid.");
  }
  return normalized;
}

function requireRejectOnlyPreState(
  counts: RemainingDocumentMutationEffectCounts,
) {
  if (
    counts.notificationReceipts !== 0 ||
    counts.ownerBGoogleAccounts !== 1 ||
    counts.facebookAccounts !== 0
  ) {
    throw new Error("OVE-291 reject-only pre-state was not clean.");
  }
}

function requireRejectOnlyPostState(
  counts: RemainingDocumentMutationEffectCounts,
) {
  if (
    counts.notificationReceipts !== 0 ||
    counts.ownerBGoogleAccounts !== 1 ||
    counts.facebookAccounts !== 0
  ) {
    throw new Error("OVE-291 reject-only post-state was not clean.");
  }
}

function effectCountDigest(counts: RemainingDocumentMutationEffectCounts) {
  return createHash("sha256").update(JSON.stringify(counts)).digest("hex");
}

function normalizeImmutableDeploymentBase(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".vercel.app") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("OVE-291 base URL must be an immutable Vercel origin.");
  }
  return url.origin;
}

function requireCommit(value: string) {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error("OVE-291 expected SHA must be a lowercase Git commit.");
  }
}

function parseCliOptions(argv: string[]) {
  const filtered = argv.filter((value) => value !== "--");
  const excludeExplicitGoogleLink = takeFlag(
    filtered,
    "--exclude-explicit-google-link",
  );
  const redacted = takeFlag(filtered, "--redacted");
  const values = new Map<string, string>();
  for (let index = 0; index < filtered.length; index += 2) {
    const key = filtered[index];
    const value = filtered[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error("OVE-291 options must use --name value pairs.");
    }
    values.set(key, value);
  }
  const required = (key: string) => {
    const value = values.get(key);
    if (!value) throw new Error(`${key} is required.`);
    return value;
  };
  const families = required("--families").split(
    ",",
  ) as RemainingDocumentMutationSmokeFamily[];
  return {
    environment: required("--environment"),
    mode: required("--mode"),
    baseUrl: required("--base-url"),
    expectedSha: required("--expected-sha"),
    families,
    excludeExplicitGoogleLink,
    redacted,
  };
}

function takeFlag(values: string[], flag: string): boolean {
  const index = values.indexOf(flag);
  if (index < 0) return false;
  values.splice(index, 1);
  return true;
}

export async function runRemainingDocumentMutationAdmissionSmokeCli(input: {
  argv: string[];
  env: Record<string, string | undefined>;
}): Promise<RemainingDocumentMutationAdmissionSmokeReport> {
  const cli = parseCliOptions(input.argv);
  normalizeImmutableDeploymentBase(cli.baseUrl);
  requireCommit(cli.expectedSha);
  requireExactFamilies(cli.families);

  const sessions = {
    ownerACookie:
      input.env.OVE291_SESSION_A_COOKIE ??
      input.env.OVE290_SESSION_A1_COOKIE ??
      "",
    ownerBCookie:
      input.env.OVE291_SESSION_B_COOKIE ??
      input.env.OVE290_SESSION_B_COOKIE ??
      "",
  };
  let database: Kysely<Database> | undefined;
  try {
    return await runRemainingDocumentMutationAdmissionSmoke({
      ...cli,
      sessions,
      protectionBypass: input.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      readEffectCounts: async ({ eventKey, ownerBUserId }) => {
        database ??= createSmokeDatabase(input.env);
        const [notifications, googleAccounts, facebook] = await Promise.all([
          database
            .selectFrom("notification_receipts")
            .select((builder) => builder.fn.countAll<number>().as("count"))
            .where("event_key", "=", eventKey)
            .executeTakeFirstOrThrow(),
          database
            .selectFrom("account")
            .select((builder) => builder.fn.countAll<number>().as("count"))
            .where("userId", "=", ownerBUserId)
            .where("providerId", "=", "google")
            .executeTakeFirstOrThrow(),
          database
            .selectFrom("account")
            .select((builder) => builder.fn.countAll<number>().as("count"))
            .where("providerId", "=", "facebook")
            .executeTakeFirstOrThrow(),
        ]);
        return {
          notificationReceipts: Number(notifications.count),
          ownerBGoogleAccounts: Number(googleAccounts.count),
          facebookAccounts: Number(facebook.count),
        };
      },
      readOwnerDocumentGeneration: readPlaywrightOwnerDocumentGeneration,
    });
  } finally {
    await database?.destroy();
  }
}

async function readPlaywrightOwnerDocumentGeneration(
  input: OwnerDocumentJourneyInput,
): Promise<OwnerDocumentJourneyReceipt> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: input.commonHeaders,
    });
    await context.addCookies(
      cookieHeaderToPlaywrightCookies(input.ownerACookie, input.baseUrl),
    );
    const page = await context.newPage();
    const navigation = await page.goto(
      `${input.baseUrl}${SIGNED_OWNER_DOCUMENT_PATH}`,
      {
        waitUntil: "domcontentloaded",
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    if (!navigation?.ok()) {
      throw new Error("OVE-291 owner document was unavailable.");
    }

    const generationFields = page.locator(
      'input[name="__overgardenDocumentGeneration"]',
    );
    if ((await generationFields.count()) < 1) {
      throw new Error("OVE-291 owner document had no signed mutation form.");
    }
    const generation = requireGeneration(
      await generationFields.first().inputValue(),
    );

    await context.close();
    return {
      documentGeneration: generation,
      ownerDocumentRendered: true,
    };
  } finally {
    await browser.close();
  }
}

function cookieHeaderToPlaywrightCookies(
  cookieHeader: string,
  baseUrl: string,
) {
  const cookies = cookieHeader.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) return [];
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return name && value ? [{ name, value, url: baseUrl }] : [];
  });
  if (cookies.length === 0) {
    throw new Error("A bounded private smoke session is required.");
  }
  return cookies;
}

function createSmokeDatabase(
  env: Record<string, string | undefined>,
): Kysely<Database> {
  const resolution = resolveDatabaseConnection(env);
  const connectionString = resolvePgConnectionString(env, resolution);
  if (!connectionString) {
    throw new Error("OVE-291 production database connection is required.");
  }
  const hostname = new URL(connectionString).hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  ) {
    throw new Error("OVE-291 production smoke refuses a loopback database.");
  }

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: 2,
        ssl: resolveDatabaseSslConfig(env, resolution),
      }),
    }),
  });
}

async function main() {
  const report = await runRemainingDocumentMutationAdmissionSmokeCli({
    argv: process.argv.slice(2),
    env: process.env,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : "";
    const safeDetail =
      message.startsWith("OVE-291 ") || message.startsWith("A bounded ")
        ? message
        : undefined;
    process.stderr.write(
      `${JSON.stringify({
        issue: "OVE-291",
        state: "inconclusive",
        errorClass: error instanceof Error ? error.name : "unknown_error",
        ...(safeDetail ? { safeDetail } : {}),
        evidenceSafety: "no_cookie_generation_identity_or_payload",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
