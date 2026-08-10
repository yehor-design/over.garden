import { createHash, randomUUID } from "node:crypto";
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

const ADMISSION_HEADER = "x-overgarden-document-generation";
const READBACK_PATH = "/api/document-mutation-admission/readback";
const MUTATION_PATH = "/api/garden/entries";
const REQUEST_TIMEOUT_MS = 10_000;

export interface DocumentMutationSmokeSessionSet {
  ownerA1Cookie: string;
  ownerA2Cookie: string;
  ownerBCookie: string;
  ownerA1DocumentGeneration: string;
}

export interface DocumentMutationEffectCounts {
  journalEntries: number;
  mutationReceipts: number;
}

export interface DocumentMutationAdmissionSmokeOptions {
  environment: string;
  mode: string;
  baseUrl: string;
  expectedSha: string;
  r2TtlReadback: string;
  redacted: boolean;
  sessions: DocumentMutationSmokeSessionSet;
  fetchImpl?: typeof fetch;
  readEffectCounts: (
    clientMutationIds: readonly string[],
  ) => Promise<DocumentMutationEffectCounts>;
  protectionBypass?: string;
}

export interface DocumentMutationAdmissionSmokeReport {
  issue: "OVE-290";
  evidenceClass: "exact-sha-reject-only-zero-effect";
  exactSha: true;
  enforcement: "enabled";
  r2UploadUrlTtl: {
    source: "default" | "environment";
    effectiveSeconds: 900;
    maximumSeconds: 900;
  };
  rejectionClasses: {
    ownerChanged: true;
    sameOwnerSessionRefresh: true;
    protocolRefresh: true;
  };
  distinctAuthorities: {
    guestGarden: true;
    publicSessionRead: true;
  };
  effectCounts: {
    before: DocumentMutationEffectCounts;
    after: DocumentMutationEffectCounts;
    digestMatch: true;
  };
  evidenceSafety: "counts_digests_classes_and_sha_only";
}

export async function runDocumentMutationAdmissionSmoke(
  options: DocumentMutationAdmissionSmokeOptions,
): Promise<DocumentMutationAdmissionSmokeReport> {
  if (options.environment !== "production" || options.mode !== "reject-only") {
    throw new Error("OVE-290 smoke requires production reject-only execution.");
  }
  if (options.r2TtlReadback !== "required" || !options.redacted) {
    throw new Error("OVE-290 smoke requires redacted TTL read-back.");
  }
  const baseUrl = normalizeImmutableDeploymentBase(options.baseUrl);
  requireCommit(options.expectedSha);
  const sessions = requireSessions(options.sessions);
  const fetchImpl = options.fetchImpl ?? fetch;
  const commonHeaders: Record<string, string> = {};
  if (options.protectionBypass) {
    commonHeaders["x-vercel-protection-bypass"] = requireBoundedOpaque(
      options.protectionBypass,
    );
  }

  const readback = await fetchJson(fetchImpl, `${baseUrl}${READBACK_PATH}`, {
    headers: commonHeaders,
  });
  const ttl = requireReadback(readback, options.expectedSha);
  await proveDistinctAuthorities(fetchImpl, baseUrl, commonHeaders);

  const clientMutationIds = Array.from(
    { length: 3 },
    () => `ove290-reject-only-${randomUUID()}`,
  );
  const before = normalizeEffectCounts(
    await options.readEffectCounts(clientMutationIds),
  );
  requireZeroEffectCounts(before, "pre-state");

  await expectRejectedMutation({
    fetchImpl,
    url: `${baseUrl}${MUTATION_PATH}`,
    cookie: sessions.ownerBCookie,
    generation: sessions.ownerA1DocumentGeneration,
    clientMutationId: clientMutationIds[0]!,
    expectedCode: "DOCUMENT_OWNER_CHANGED",
    commonHeaders,
  });
  await expectRejectedMutation({
    fetchImpl,
    url: `${baseUrl}${MUTATION_PATH}`,
    cookie: sessions.ownerA2Cookie,
    generation: sessions.ownerA1DocumentGeneration,
    clientMutationId: clientMutationIds[1]!,
    expectedCode: "DOCUMENT_SESSION_REFRESH_REQUIRED",
    commonHeaders,
  });
  await expectRejectedMutation({
    fetchImpl,
    url: `${baseUrl}${MUTATION_PATH}`,
    cookie: sessions.ownerA1Cookie,
    generation: "malformed",
    clientMutationId: clientMutationIds[2]!,
    expectedCode: "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
    commonHeaders,
  });

  const after = normalizeEffectCounts(
    await options.readEffectCounts(clientMutationIds),
  );
  requireZeroEffectCounts(after, "post-state");
  const beforeDigest = effectCountDigest(before);
  const afterDigest = effectCountDigest(after);
  if (beforeDigest !== afterDigest) {
    throw new Error("OVE-290 reject-only effect counts changed.");
  }

  return {
    issue: "OVE-290",
    evidenceClass: "exact-sha-reject-only-zero-effect",
    exactSha: true,
    enforcement: "enabled",
    r2UploadUrlTtl: ttl,
    rejectionClasses: {
      ownerChanged: true,
      sameOwnerSessionRefresh: true,
      protocolRefresh: true,
    },
    distinctAuthorities: {
      guestGarden: true,
      publicSessionRead: true,
    },
    effectCounts: { before, after, digestMatch: true },
    evidenceSafety: "counts_digests_classes_and_sha_only",
  };
}

async function expectRejectedMutation(input: {
  fetchImpl: typeof fetch;
  url: string;
  cookie: string;
  generation: string;
  clientMutationId: string;
  expectedCode:
    | "DOCUMENT_OWNER_CHANGED"
    | "DOCUMENT_SESSION_REFRESH_REQUIRED"
    | "DOCUMENT_PROTOCOL_REFRESH_REQUIRED";
  commonHeaders: Record<string, string>;
}) {
  const response = await input.fetchImpl(input.url, {
    method: "POST",
    headers: {
      ...input.commonHeaders,
      cookie: input.cookie,
      "content-type": "application/json",
      [ADMISSION_HEADER]: input.generation,
    },
    body: JSON.stringify({
      target: "first_plant_entry",
      clientMutationId: input.clientMutationId,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => null)) as {
    code?: unknown;
  } | null;
  if (response.status !== 409 || payload?.code !== input.expectedCode) {
    throw new Error("OVE-290 returned an unexpected closed result.");
  }
  if (!response.headers.get("cache-control")?.includes("no-store")) {
    throw new Error("OVE-290 rejection was not private no-store.");
  }
}

async function proveDistinctAuthorities(
  fetchImpl: typeof fetch,
  baseUrl: string,
  commonHeaders: Record<string, string>,
) {
  const [garden, session] = await Promise.all([
    fetchImpl(`${baseUrl}/garden`, {
      headers: { ...commonHeaders, accept: "text/html" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
    fetchImpl(`${baseUrl}/api/auth/get-session`, {
      headers: commonHeaders,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
  ]);
  if (garden.status !== 200 || session.status !== 200) {
    throw new Error("A distinct public authority changed response semantics.");
  }
  const gardenText = await garden.text();
  const sessionText = await session.text();
  if (
    gardenText.includes("DOCUMENT_PROTOCOL_REFRESH_REQUIRED") ||
    sessionText.includes("DOCUMENT_PROTOCOL_REFRESH_REQUIRED")
  ) {
    throw new Error("A public authority incorrectly required a generation.");
  }
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("OVE-290 read-back was unavailable.");
  return response.json();
}

function requireReadback(
  value: unknown,
  expectedSha: string,
): DocumentMutationAdmissionSmokeReport["r2UploadUrlTtl"] {
  if (!value || typeof value !== "object") {
    throw new Error("OVE-290 read-back was malformed.");
  }
  const readback = value as {
    protocol?: unknown;
    deploymentSha?: unknown;
    enforcement?: unknown;
    r2UploadUrlTtl?: {
      source?: unknown;
      effectiveSeconds?: unknown;
      maximumSeconds?: unknown;
    };
  };
  if (
    readback.protocol !== "overgarden.document-mutation-generation.v1" ||
    readback.deploymentSha !== expectedSha ||
    readback.enforcement !== "enabled" ||
    (readback.r2UploadUrlTtl?.source !== "default" &&
      readback.r2UploadUrlTtl?.source !== "environment") ||
    readback.r2UploadUrlTtl.effectiveSeconds !== 900 ||
    readback.r2UploadUrlTtl.maximumSeconds !== 900
  ) {
    throw new Error("OVE-290 exact-SHA or TTL read-back did not match.");
  }
  return {
    source: readback.r2UploadUrlTtl.source,
    effectiveSeconds: 900,
    maximumSeconds: 900,
  };
}

function requireSessions(
  sessions: DocumentMutationSmokeSessionSet,
): DocumentMutationSmokeSessionSet {
  return {
    ownerA1Cookie: requireCookie(sessions.ownerA1Cookie),
    ownerA2Cookie: requireCookie(sessions.ownerA2Cookie),
    ownerBCookie: requireCookie(sessions.ownerBCookie),
    ownerA1DocumentGeneration: requireGeneration(
      sessions.ownerA1DocumentGeneration,
    ),
  };
}

function requireCookie(value: string) {
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

function requireGeneration(value: string) {
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

function requireBoundedOpaque(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 1_024 || /[\r\n]/.test(normalized)) {
    throw new Error("A bounded deployment protection value is required.");
  }
  return normalized;
}

function normalizeEffectCounts(
  counts: DocumentMutationEffectCounts,
): DocumentMutationEffectCounts {
  const normalized = {
    journalEntries: Number(counts.journalEntries),
    mutationReceipts: Number(counts.mutationReceipts),
  };
  if (
    !Number.isSafeInteger(normalized.journalEntries) ||
    normalized.journalEntries < 0 ||
    !Number.isSafeInteger(normalized.mutationReceipts) ||
    normalized.mutationReceipts < 0
  ) {
    throw new Error("OVE-290 effect counts were invalid.");
  }
  return normalized;
}

function requireZeroEffectCounts(
  counts: DocumentMutationEffectCounts,
  label: string,
) {
  if (counts.journalEntries !== 0 || counts.mutationReceipts !== 0) {
    throw new Error(`OVE-290 ${label} was not empty.`);
  }
}

function effectCountDigest(counts: DocumentMutationEffectCounts) {
  return createHash("sha256").update(JSON.stringify(counts)).digest("hex");
}

function normalizeImmutableDeploymentBase(value: string) {
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
    throw new Error("OVE-290 base URL must be an immutable Vercel origin.");
  }
  return url.origin;
}

function requireCommit(value: string) {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error("OVE-290 expected SHA must be a lowercase Git commit.");
  }
}

function parseCliOptions(argv: string[]) {
  const values = new Map<string, string>();
  const filtered = argv.filter((value) => value !== "--");
  const redactedIndex = filtered.indexOf("--redacted");
  const redacted = redactedIndex >= 0;
  if (redacted) filtered.splice(redactedIndex, 1);
  for (let index = 0; index < filtered.length; index += 2) {
    const key = filtered[index];
    const value = filtered[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error("OVE-290 options must use --name value pairs.");
    }
    values.set(key, value);
  }
  const required = (key: string) => {
    const value = values.get(key);
    if (!value) throw new Error(`${key} is required.`);
    return value;
  };
  return {
    environment: required("--environment"),
    mode: required("--mode"),
    baseUrl: required("--base-url"),
    expectedSha: required("--expected-sha"),
    r2TtlReadback: required("--r2-ttl-readback"),
    redacted,
  };
}

export async function runDocumentMutationAdmissionSmokeCli(input: {
  argv: string[];
  env: Record<string, string | undefined>;
}): Promise<DocumentMutationAdmissionSmokeReport> {
  const cli = parseCliOptions(input.argv);
  const sessions = {
    ownerA1Cookie: input.env.OVE290_SESSION_A1_COOKIE ?? "",
    ownerA2Cookie: input.env.OVE290_SESSION_A2_COOKIE ?? "",
    ownerBCookie: input.env.OVE290_SESSION_B_COOKIE ?? "",
    ownerA1DocumentGeneration: input.env.OVE290_DOCUMENT_A1_GENERATION ?? "",
  };
  let database: Kysely<Database> | undefined;
  try {
    return await runDocumentMutationAdmissionSmoke({
      ...cli,
      sessions,
      protectionBypass: input.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      readEffectCounts: async (clientMutationIds) => {
        database ??= createSmokeDatabase(input.env);
        const [entries, receipts] = await Promise.all([
          database
            .selectFrom("journal_entries")
            .select((builder) => builder.fn.countAll<number>().as("count"))
            .where("client_mutation_id", "in", [...clientMutationIds])
            .executeTakeFirstOrThrow(),
          database
            .selectFrom("journal_entry_mutation_receipts")
            .select((builder) => builder.fn.countAll<number>().as("count"))
            .where("client_mutation_id", "in", [...clientMutationIds])
            .executeTakeFirstOrThrow(),
        ]);
        return {
          journalEntries: Number(entries.count),
          mutationReceipts: Number(receipts.count),
        };
      },
    });
  } finally {
    await database?.destroy();
  }
}

function createSmokeDatabase(
  env: Record<string, string | undefined>,
): Kysely<Database> {
  const resolution = resolveDatabaseConnection(env);
  const connectionString = resolvePgConnectionString(env, resolution);
  if (!connectionString) {
    throw new Error("OVE-290 production database connection is required.");
  }

  const hostname = new URL(connectionString).hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  ) {
    throw new Error("OVE-290 production smoke refuses a loopback database.");
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
  const report = await runDocumentMutationAdmissionSmokeCli({
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
      message.startsWith("OVE-290 ") ||
      message.startsWith("A distinct public authority ") ||
      message.startsWith("A public authority ") ||
      message.startsWith("A bounded ")
        ? message
        : undefined;
    process.stderr.write(
      `${JSON.stringify({
        issue: "OVE-290",
        state: "inconclusive",
        errorClass: error instanceof Error ? error.name : "unknown_error",
        ...(safeDetail ? { safeDetail } : {}),
        evidenceSafety: "no_cookie_generation_identity_or_payload",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
