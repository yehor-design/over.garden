import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { statfsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { resolveDatabaseConnection } from "../src/db/connection";
import {
  EPPO_API_BASE_URL,
  EPPO_API_KEY_HEADER,
  EPPO_OBSERVED_DETAIL_ENDPOINT_CLASSES as EPPO_DETAIL_ENDPOINT_CLASSES,
  type EppoObservedDetailEndpointClass as EppoDetailEndpointClass,
} from "../src/server/catalog-source/eppo-api-constants";
import type {
  EppoCapturedInventory,
  EppoCaptureFinalReceipt,
} from "../src/server/catalog-source/eppo-observed-capture-repository";

type EppoCaptureRepositoryModule =
  typeof import("../src/server/catalog-source/eppo-observed-capture-repository");
type EppoCaptureExecutor = Parameters<
  Parameters<EppoCaptureRepositoryModule["withEppoCaptureWriterLock"]>[0]
>[0];

let captureRepositoryPromise: Promise<EppoCaptureRepositoryModule> | undefined;
let captureRepositoryModule: EppoCaptureRepositoryModule | undefined;

async function loadCaptureRepository(): Promise<EppoCaptureRepositoryModule> {
  captureRepositoryPromise ??=
    import("../src/server/catalog-source/eppo-observed-capture-repository");
  captureRepositoryModule ??= await captureRepositoryPromise;
  return captureRepositoryModule;
}

type EppoCaptureRepositoryMethodName = {
  [Name in keyof EppoCaptureRepositoryModule]: EppoCaptureRepositoryModule[Name] extends (
    ...args: never[]
  ) => unknown
    ? Name
    : never;
}[keyof EppoCaptureRepositoryModule];

function lazyCaptureRepositoryMethod<
  Key extends EppoCaptureRepositoryMethodName,
>(name: Key): EppoCaptureRepositoryModule[Key] {
  return ((...args: unknown[]) => {
    const method = captureRepositoryModule?.[name];
    if (typeof method !== "function") {
      throw new Error("capture_repository_not_loaded");
    }
    return Reflect.apply(method, captureRepositoryModule, args);
  }) as EppoCaptureRepositoryModule[Key];
}

const parseEppoInventoryPage = lazyCaptureRepositoryMethod(
  "parseEppoInventoryPage",
);
const digestCanonicalJson = lazyCaptureRepositoryMethod("digestCanonicalJson");
const readEppoZeroProductFingerprint = lazyCaptureRepositoryMethod(
  "readEppoZeroProductFingerprint",
);
const createEppoCapture = lazyCaptureRepositoryMethod("createEppoCapture");
const transitionEppoCapture = lazyCaptureRepositoryMethod(
  "transitionEppoCapture",
);
const recordEppoInventoryPage = lazyCaptureRepositoryMethod(
  "recordEppoInventoryPage",
);
const readEppoCapturedInventory = lazyCaptureRepositoryMethod(
  "readEppoCapturedInventory",
);
const claimNextEppoCaptureUnit = lazyCaptureRepositoryMethod(
  "claimNextEppoCaptureUnit",
);
const completeEppoCaptureUnit = lazyCaptureRepositoryMethod(
  "completeEppoCaptureUnit",
);
const failEppoCaptureUnit = lazyCaptureRepositoryMethod("failEppoCaptureUnit");
const releaseCancelledEppoCaptureClaim = lazyCaptureRepositoryMethod(
  "releaseCancelledEppoCaptureClaim",
);
const recoverStaleEppoCaptureClaims = lazyCaptureRepositoryMethod(
  "recoverStaleEppoCaptureClaims",
);
const readEppoCaptureSafeStatus = lazyCaptureRepositoryMethod(
  "readEppoCaptureSafeStatus",
);
const readLatestResumableEppoCaptureId = lazyCaptureRepositoryMethod(
  "readLatestResumableEppoCaptureId",
);
const readLatestCompletedEppoCaptureId = lazyCaptureRepositoryMethod(
  "readLatestCompletedEppoCaptureId",
);
const verifyCompletedEppoCapture = lazyCaptureRepositoryMethod(
  "verifyCompletedEppoCapture",
);
const withEppoCaptureWriterLock = lazyCaptureRepositoryMethod(
  "withEppoCaptureWriterLock",
);
const finalizeEppoCapture = lazyCaptureRepositoryMethod("finalizeEppoCapture");

export type EppoCaptureMode = "plan" | "capture" | "resume" | "verify";
export type EppoCaptureFixture = "timeout" | "complete" | "drift";

export type EppoCaptureOptions = {
  mode: EppoCaptureMode;
  environment: "local";
  confirmEnvironment: "local";
  concurrency: 1;
  requestTimeoutMs: 15_000;
  maxAttempts: 2;
  captureId?: string;
  fixture?: EppoCaptureFixture;
  statusOnly: boolean;
};

const REQUIRED_NUMERIC_OPTIONS = {
  "--concurrency": 1,
  "--request-timeout-ms": 15_000,
  "--max-attempts": 2,
} as const;

function requiredValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name}_requires_value`);
  }
  return value;
}

export function parseEppoCaptureOptions(args: string[]): EppoCaptureOptions {
  const parsed = new Map<string, string>();
  let statusOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]!;
    if (name === "--" && index === 0) continue;
    if (name === "--status-only") {
      statusOnly = true;
      continue;
    }
    if (
      ![
        "--mode",
        "--environment",
        "--confirm-environment",
        "--concurrency",
        "--request-timeout-ms",
        "--max-attempts",
        "--capture-id",
        "--fixture",
      ].includes(name)
    ) {
      throw new Error(`unknown_argument:${name}`);
    }
    if (parsed.has(name)) throw new Error(`duplicate_argument:${name}`);
    parsed.set(name, requiredValue(args, index, name));
    index += 1;
  }

  const mode = parsed.get("--mode");
  if (
    !(["plan", "capture", "resume", "verify"] as string[]).includes(mode ?? "")
  ) {
    throw new Error("invalid_mode");
  }
  if (parsed.get("--environment") !== "local") {
    throw new Error("non_local_environment_refused");
  }
  if (parsed.get("--confirm-environment") !== "local") {
    throw new Error("environment_confirmation_mismatch");
  }
  for (const [name, exact] of Object.entries(REQUIRED_NUMERIC_OPTIONS)) {
    if (Number(parsed.get(name)) !== exact) {
      throw new Error(`invalid_${name.slice(2).replaceAll("-", "_")}`);
    }
  }

  const captureId = parsed.get("--capture-id");
  if (
    captureId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      captureId,
    )
  ) {
    throw new Error("invalid_capture_id");
  }
  const fixture = parsed.get("--fixture");
  if (
    fixture &&
    !(["timeout", "complete", "drift"] as string[]).includes(fixture)
  ) {
    throw new Error("invalid_fixture");
  }

  return {
    mode: mode as EppoCaptureMode,
    environment: "local",
    confirmEnvironment: "local",
    concurrency: 1,
    requestTimeoutMs: 15_000,
    maxAttempts: 2,
    ...(captureId ? { captureId } : {}),
    ...(fixture ? { fixture: fixture as EppoCaptureFixture } : {}),
    statusOnly,
  };
}

export function assertLocalEppoCaptureEnvironment(
  options: EppoCaptureOptions,
  env: Record<string, string | undefined> = process.env,
): { databaseHost: "loopback"; environment: "local" } {
  if (
    options.environment !== "local" ||
    options.confirmEnvironment !== "local" ||
    options.concurrency !== 1 ||
    options.requestTimeoutMs !== 15_000 ||
    options.maxAttempts !== 2
  ) {
    throw new Error("bounded_local_contract_mismatch");
  }
  const resolution = resolveDatabaseConnection(env);
  if (!resolution.connectionString) throw new Error("database_target_missing");
  let target: URL;
  try {
    target = new URL(resolution.connectionString);
  } catch {
    throw new Error("database_target_invalid");
  }
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(target.hostname)) {
    throw new Error("non_local_database_refused");
  }
  if (
    !target.pathname ||
    target.pathname === "/" ||
    target.pathname === "/postgres"
  ) {
    throw new Error("unsafe_local_database_refused");
  }
  return { databaseHost: "loopback", environment: "local" };
}

export function buildEppoEndpointUrl(
  eppoCode: string,
  endpointClass: EppoDetailEndpointClass,
): string {
  if (!/^[0-9A-Z]{5,6}$/u.test(eppoCode)) {
    throw new Error("invalid_eppo_code");
  }
  if (!EPPO_DETAIL_ENDPOINT_CLASSES.includes(endpointClass)) {
    throw new Error("undocumented_endpoint_class");
  }
  const suffix: Record<EppoDetailEndpointClass, string> = {
    taxon_overview: "overview",
    taxon_names: "names",
    taxon_taxonomy: "taxonomy",
  };
  return `${EPPO_API_BASE_URL}/taxons/taxon/${eppoCode}/${suffix[endpointClass]}`;
}

export type EppoRequestErrorCode =
  | "request_timeout"
  | "request_cancelled"
  | "authentication_rejected"
  | "authorization_rejected"
  | "rate_limited"
  | "not_applicable"
  | "api_unavailable"
  | "response_schema_mismatch"
  | "network_failure";

export class EppoCaptureRequestError extends Error {
  constructor(
    readonly code: EppoRequestErrorCode,
    readonly statusClass: "none" | "4xx" | "5xx" = "none",
    readonly retryAfterMs = 0,
  ) {
    super(`EPPO capture request failed: ${code}`);
    this.name = "EppoCaptureRequestError";
  }
}

function boundedRetryAfter(value: string | null): number {
  if (!value || !/^\d{1,2}$/u.test(value)) return 250;
  return Math.min(Number(value) * 1_000, 10_000);
}

function assertOfficialRequestUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_provider_url");
  }
  if (
    url.origin !== "https://api.eppo.int" ||
    !url.pathname.startsWith("/gd/v2/") ||
    url.username ||
    url.password
  ) {
    throw new Error("unofficial_provider_url_refused");
  }
}

export async function requestEppoJson(
  url: string,
  credential: string,
  dependencies: {
    timeoutMs: number;
    fetch?: typeof fetch;
    signal?: AbortSignal;
    now?: () => number;
  },
): Promise<{
  payload: unknown;
  durationMs: number;
  statusClass: "2xx";
}> {
  assertOfficialRequestUrl(url);
  if (!credential || /[\r\n\u0000]/u.test(credential)) {
    throw new Error("invalid_credential");
  }
  if (
    !Number.isSafeInteger(dependencies.timeoutMs) ||
    dependencies.timeoutMs < 1
  ) {
    throw new Error("invalid_request_timeout");
  }

  const controller = new AbortController();
  const externalAbort = () => controller.abort("external_cancellation");
  dependencies.signal?.addEventListener("abort", externalAbort, { once: true });
  const timeout = setTimeout(
    () => controller.abort("request_timeout"),
    dependencies.timeoutMs,
  );
  const now = dependencies.now ?? (() => performance.now());
  const startedAt = now();

  try {
    const response = await (dependencies.fetch ?? fetch)(url, {
      method: "GET",
      headers: {
        [EPPO_API_KEY_HEADER]: credential,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const durationMs = Math.max(0, Math.ceil(now() - startedAt));
    if (controller.signal.aborted) {
      throw new EppoCaptureRequestError(
        dependencies.signal?.aborted ? "request_cancelled" : "request_timeout",
      );
    }
    if (response.status === 401) {
      throw new EppoCaptureRequestError("authentication_rejected", "4xx");
    }
    if (response.status === 403) {
      throw new EppoCaptureRequestError("authorization_rejected", "4xx");
    }
    if (response.status === 404) {
      throw new EppoCaptureRequestError("not_applicable", "4xx");
    }
    if (response.status === 429) {
      throw new EppoCaptureRequestError(
        "rate_limited",
        "4xx",
        boundedRetryAfter(response.headers.get("retry-after")),
      );
    }
    if (response.status >= 500) {
      throw new EppoCaptureRequestError(
        "api_unavailable",
        "5xx",
        boundedRetryAfter(response.headers.get("retry-after")),
      );
    }
    if (!response.ok) {
      throw new EppoCaptureRequestError("response_schema_mismatch", "4xx");
    }
    if (
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      throw new EppoCaptureRequestError("response_schema_mismatch");
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new EppoCaptureRequestError("response_schema_mismatch");
    }
    if (controller.signal.aborted) {
      throw new EppoCaptureRequestError(
        dependencies.signal?.aborted ? "request_cancelled" : "request_timeout",
      );
    }
    return { payload, durationMs, statusClass: "2xx" };
  } catch (error) {
    if (error instanceof EppoCaptureRequestError) throw error;
    if (controller.signal.aborted) {
      throw new EppoCaptureRequestError(
        dependencies.signal?.aborted ? "request_cancelled" : "request_timeout",
      );
    }
    throw new EppoCaptureRequestError("network_failure");
  } finally {
    clearTimeout(timeout);
    dependencies.signal?.removeEventListener("abort", externalAbort);
  }
}

export async function runEppoTimeoutFixture(input: { timeoutMs: number }) {
  const startedAt = performance.now();
  let lateWriteAccepted = false;
  const fetcher: typeof fetch = async (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  try {
    await requestEppoJson(
      `${EPPO_API_BASE_URL}/taxons/taxon/LYPES/overview`,
      "fixture-secret-never-rendered",
      { timeoutMs: input.timeoutMs, fetch: fetcher },
    );
    lateWriteAccepted = true;
  } catch (error) {
    if (
      !(error instanceof EppoCaptureRequestError) ||
      error.code !== "request_timeout"
    ) {
      throw error;
    }
  }

  return {
    class: "fixture" as const,
    fixture: "timeout" as const,
    state: "timed_out" as const,
    providerConcurrency: 1 as const,
    durationMs: Math.ceil(performance.now() - startedAt),
    requestBudgetMs: input.timeoutMs,
    lateWriteAccepted,
    controls: {
      cancellation: "responsive" as const,
      status: "responsive" as const,
    },
    cleanup: "completed" as const,
  };
}

const INVENTORY_PAGE_LIMIT = 1_000;
const STALE_CLAIM_SECONDS = 300;
const MAX_JOB_DURATION_MS = 86_400_000;

type SafeEppoPlanReceipt = {
  class: "observed_capture_plan";
  authority: "overgarden_observed_capture";
  environment: "local";
  sourceHost: "api.eppo.int";
  providerConcurrency: 1;
  requestTimeoutMs: 15_000;
  maxAttempts: 2;
  taxonomyTotal: number;
  inventoryPageCount: number;
  openApiSha256: string;
  licenseSha256: string;
  documentedSourceClasses: 4;
  projectedProviderRequests: number;
  projectedStorageBytes: number;
  filesystemAvailableBytes: number;
  databaseSizeBytes: number;
  headroom: "verified";
  observedAt: string;
};

function currentGitRevision(): string {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: path.resolve(fileURLToPath(new URL("../../..", import.meta.url))),
    encoding: "utf8",
  }).trim();
  if (!/^[a-f0-9]{40}$/u.test(revision)) {
    throw new Error("invalid_capture_tool_revision");
  }
  return revision;
}

export function buildEppoInventoryUrl(offset: number, limit: number): string {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > INVENTORY_PAGE_LIMIT
  ) {
    throw new Error("invalid_inventory_page");
  }
  const query = new URLSearchParams({
    orderBy: "eppocode",
    orderAsc: "true",
    limit: String(limit),
    offset: String(offset),
  });
  return `${EPPO_API_BASE_URL}/taxons/list?${query.toString()}`;
}

function assertEndpointPayload(
  endpointClass: EppoDetailEndpointClass,
  eppoCode: string,
  payload: unknown,
): void {
  if (endpointClass === "taxon_overview") {
    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>).eppocode !== eppoCode
    ) {
      throw new EppoCaptureRequestError("response_schema_mismatch");
    }
    return;
  }
  if (
    !Array.isArray(payload) ||
    !payload.every(
      (row) => row !== null && typeof row === "object" && !Array.isArray(row),
    )
  ) {
    throw new EppoCaptureRequestError("response_schema_mismatch");
  }
}

async function readDatabaseSizeBytes(): Promise<number> {
  const [{ db }, { sql }] = await Promise.all([
    import("../src/db"),
    import("kysely"),
  ]);
  const row = await db
    .selectNoFrom(
      sql<string>`pg_database_size(current_database())::text`.as("size"),
    )
    .executeTakeFirstOrThrow();
  const value = Number(row.size);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("database_size_unavailable");
  }
  return value;
}

async function runOfficialPlan(
  options: EppoCaptureOptions,
  credential: string,
  signal?: AbortSignal,
): Promise<SafeEppoPlanReceipt> {
  const { EPPO_SOURCE_CONTRACT_CONCURRENCY, inspectEppoSourceContract } =
    await import("../src/server/catalog-source/eppo-source-contract");
  const captureToolRevision = currentGitRevision();
  const contract = await inspectEppoSourceContract(
    credential,
    {
      timeoutMs: 120_000,
      maxAttempts: options.maxAttempts,
      concurrency: EPPO_SOURCE_CONTRACT_CONCURRENCY,
    },
    { baselineSha: captureToolRevision, signal },
  );
  if (
    contract.terminalState !== "blocked_manifest" ||
    !contract.openApiDigest ||
    !contract.licenseDocumentDigest ||
    !contract.taxonomyCount ||
    contract.rightsEvidence !==
      "official_open_licence_document_fetched_attribution_required" ||
    Object.values(contract.sourceClasses).some((value) => value !== "supported")
  ) {
    throw new Error(`provider_capability_${contract.terminalState}`);
  }

  const firstResponse = await requestEppoJson(
    buildEppoInventoryUrl(0, INVENTORY_PAGE_LIMIT),
    credential,
    { timeoutMs: options.requestTimeoutMs, signal },
  );
  const firstPage = parseEppoInventoryPage(firstResponse.payload, {
    offset: 0,
    limit: INVENTORY_PAGE_LIMIT,
  });
  if (firstPage.total !== contract.taxonomyCount) {
    throw new Error("provider_total_drift_during_plan");
  }
  const tailOffset =
    Math.floor((firstPage.total - 1) / INVENTORY_PAGE_LIMIT) *
    INVENTORY_PAGE_LIMIT;
  const tailResponse = await requestEppoJson(
    buildEppoInventoryUrl(tailOffset, INVENTORY_PAGE_LIMIT),
    credential,
    { timeoutMs: options.requestTimeoutMs, signal },
  );
  const tailPage = parseEppoInventoryPage(tailResponse.payload, {
    offset: tailOffset,
    limit: INVENTORY_PAGE_LIMIT,
  });
  if (tailPage.total !== firstPage.total) {
    throw new Error("provider_total_drift_during_plan");
  }

  const sampleCode = firstPage.codes[0];
  if (!sampleCode) throw new Error("provider_inventory_empty");
  let projectedBytesPerCode = 1_024;
  for (const endpointClass of EPPO_DETAIL_ENDPOINT_CLASSES) {
    const response = await requestEppoJson(
      buildEppoEndpointUrl(sampleCode, endpointClass),
      credential,
      { timeoutMs: options.requestTimeoutMs, signal },
    );
    assertEndpointPayload(endpointClass, sampleCode, response.payload);
    projectedBytesPerCode += Math.max(
      4_096,
      Buffer.byteLength(JSON.stringify(response.payload), "utf8"),
    );
  }

  // Units plus normalized source rows duplicate the captured JSON by design.
  // A third copy-equivalent covers indexes, TOAST overhead, and variance.
  const projectedStorageBytes =
    firstPage.total * projectedBytesPerCode * 3 + 512 * 1024 * 1024;
  const filesystem = statfsSync(process.cwd(), { bigint: true });
  const filesystemAvailableBytes = Number(filesystem.bavail * filesystem.bsize);
  const databaseSizeBytes = await readDatabaseSizeBytes();
  if (
    !Number.isSafeInteger(filesystemAvailableBytes) ||
    filesystemAvailableBytes < projectedStorageBytes * 1.25
  ) {
    throw new Error("database_headroom_insufficient");
  }

  return {
    class: "observed_capture_plan",
    authority: "overgarden_observed_capture",
    environment: "local",
    sourceHost: "api.eppo.int",
    providerConcurrency: 1,
    requestTimeoutMs: 15_000,
    maxAttempts: 2,
    taxonomyTotal: firstPage.total,
    inventoryPageCount: Math.ceil(firstPage.total / INVENTORY_PAGE_LIMIT),
    openApiSha256: contract.openApiDigest,
    licenseSha256: contract.licenseDocumentDigest,
    documentedSourceClasses: 4,
    projectedProviderRequests:
      Math.ceil(firstPage.total / INVENTORY_PAGE_LIMIT) + firstPage.total * 3,
    projectedStorageBytes,
    filesystemAvailableBytes,
    databaseSizeBytes,
    headroom: "verified",
    observedAt: new Date().toISOString(),
  };
}

async function fetchOfficialInventory(
  credential: string,
  options: EppoCaptureOptions,
  input: {
    captureId?: string;
    signal?: AbortSignal;
    executor: EppoCaptureExecutor;
  },
): Promise<EppoCapturedInventory> {
  const codes: string[] = [];
  let total: number | null = null;
  let pageCount = 0;

  for (
    let offset = 0;
    total === null || offset < total;
    offset += INVENTORY_PAGE_LIMIT
  ) {
    const response = await requestEppoJson(
      buildEppoInventoryUrl(offset, INVENTORY_PAGE_LIMIT),
      credential,
      { timeoutMs: options.requestTimeoutMs, signal: input.signal },
    );
    const page = parseEppoInventoryPage(response.payload, {
      offset,
      limit: INVENTORY_PAGE_LIMIT,
    });
    total ??= page.total;
    if (page.total !== total) throw new Error("inventory_total_drift");
    codes.push(...page.codes);
    pageCount += 1;
    if (input.captureId) {
      await recordEppoInventoryPage(
        {
          captureId: input.captureId,
          offset,
          limit: INVENTORY_PAGE_LIMIT,
          payload: response.payload as never,
          observedAt: new Date(),
        },
        input.executor,
      );
    }
  }
  if (
    total === null ||
    codes.length !== total ||
    new Set(codes).size !== total
  ) {
    throw new Error("inventory_closure_mismatch");
  }
  return { total, pageCount, codes, sha256: digestCanonicalJson(codes) };
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function hydrateOfficialEndpoints(input: {
  captureId: string;
  credential: string;
  options: EppoCaptureOptions;
  signal: AbortSignal;
  jobStartedAt: number;
  executor: EppoCaptureExecutor;
}): Promise<void> {
  await recoverStaleEppoCaptureClaims(
    {
      captureId: input.captureId,
      staleBefore: new Date(Date.now() - STALE_CLAIM_SECONDS * 1_000),
      maxAttempts: input.options.maxAttempts,
    },
    input.executor,
  );
  let processed = 0;

  while (!input.signal.aborted) {
    if (performance.now() - input.jobStartedAt >= MAX_JOB_DURATION_MS) {
      throw new Error("capture_job_deadline");
    }
    const claim = await claimNextEppoCaptureUnit(
      {
        captureId: input.captureId,
        claimToken: randomUUID(),
        claimedAt: new Date(),
        maxAttempts: input.options.maxAttempts,
      },
      input.executor,
    );
    if (!claim) break;

    try {
      const response = await requestEppoJson(
        buildEppoEndpointUrl(claim.eppoCode, claim.endpointClass),
        input.credential,
        {
          timeoutMs: input.options.requestTimeoutMs,
          signal: input.signal,
        },
      );
      assertEndpointPayload(
        claim.endpointClass,
        claim.eppoCode,
        response.payload,
      );
      await completeEppoCaptureUnit(
        {
          captureId: input.captureId,
          unitId: claim.id,
          claimToken: claim.claimToken,
          observedAt: new Date(),
          httpStatusClass: "2xx",
          payload: response.payload as never,
        },
        input.executor,
      );
    } catch (error) {
      if (
        error instanceof EppoCaptureRequestError &&
        error.code === "request_cancelled"
      ) {
        await releaseCancelledEppoCaptureClaim(
          {
            captureId: input.captureId,
            unitId: claim.id,
            claimToken: claim.claimToken,
            releasedAt: new Date(),
          },
          input.executor,
        );
        throw error;
      }
      if (
        error instanceof EppoCaptureRequestError &&
        error.code === "not_applicable"
      ) {
        await completeEppoCaptureUnit(
          {
            captureId: input.captureId,
            unitId: claim.id,
            claimToken: claim.claimToken,
            observedAt: new Date(),
            httpStatusClass: "4xx",
            payload: [],
            state: "not_applicable",
          },
          input.executor,
        );
        continue;
      }
      const errorClass =
        error instanceof EppoCaptureRequestError
          ? error.code
          : "response_schema_mismatch";
      const failed = await failEppoCaptureUnit(
        {
          captureId: input.captureId,
          unitId: claim.id,
          claimToken: claim.claimToken,
          errorClass,
          failedAt: new Date(),
        },
        input.executor,
      );
      const retryable =
        error instanceof EppoCaptureRequestError &&
        [
          "request_timeout",
          "rate_limited",
          "api_unavailable",
          "network_failure",
        ].includes(error.code);
      if (retryable && failed.attemptCount < input.options.maxAttempts) {
        await sleep(error.retryAfterMs || 250);
        continue;
      }
      throw error;
    }

    processed += 1;
    if (processed % 1_000 === 0) {
      const status = await readEppoCaptureSafeStatus(
        input.captureId,
        input.executor,
      );
      console.log(
        JSON.stringify({
          class: "observed_capture_progress",
          captureId: input.captureId,
          phase: "hydrating",
          terminalUnitCount: status.terminalUnitCount,
          pendingUnitCount: status.pendingUnitCount,
          failedUnitCount: status.failedUnitCount,
        }),
      );
    }
  }

  if (input.signal.aborted) {
    throw new EppoCaptureRequestError("request_cancelled");
  }
  const status = await readEppoCaptureSafeStatus(
    input.captureId,
    input.executor,
  );
  if (
    status.pendingUnitCount !== 0 ||
    status.inProgressUnitCount !== 0 ||
    status.failedUnitCount !== 0
  ) {
    throw new Error("endpoint_units_incomplete");
  }
}

async function runNewOfficialCapture(
  options: EppoCaptureOptions,
  credential: string,
  plan: SafeEppoPlanReceipt,
  signal: AbortSignal,
  jobStartedAt: number,
  executor: EppoCaptureExecutor,
): Promise<EppoCaptureFinalReceipt> {
  const captureId = randomUUID();
  const baseline = await readEppoZeroProductFingerprint(executor);
  await createEppoCapture(
    {
      id: captureId,
      captureToolRevision: currentGitRevision(),
      openApiSha256: plan.openApiSha256,
      licenseSha256: plan.licenseSha256,
      observedStartedAt: new Date(),
      preflightReceipt: plan,
      zeroProductBaseline: baseline,
    },
    executor,
  );
  console.log(
    JSON.stringify({
      class: "observed_capture_started",
      captureId,
      authority: "overgarden_observed_capture",
      environment: "local",
      phase: "planned",
    }),
  );
  await transitionEppoCapture(
    {
      captureId,
      fromStates: ["planned"],
      toState: "inventorying",
    },
    executor,
  );
  try {
    const inventory = await fetchOfficialInventory(credential, options, {
      captureId,
      signal,
      executor,
    });
    if (inventory.total !== plan.taxonomyTotal) {
      throw new Error("inventory_plan_total_drift");
    }
    await transitionEppoCapture(
      {
        captureId,
        fromStates: ["inventorying"],
        toState: "hydrating",
        updates: {
          inventoryStartTotal: inventory.total,
          inventoryUniqueCodes: inventory.total,
          inventoryPageCount: inventory.pageCount,
          inventoryStartSha256: inventory.sha256,
        },
      },
      executor,
    );
    await hydrateOfficialEndpoints({
      captureId,
      credential,
      options,
      signal,
      jobStartedAt,
      executor,
    });
    await transitionEppoCapture(
      {
        captureId,
        fromStates: ["hydrating"],
        toState: "verifying",
      },
      executor,
    );
    const endingInventory = await fetchOfficialInventory(credential, options, {
      signal,
      executor,
    });
    return await finalizeEppoCapture(
      {
        captureId,
        endingInventory,
        observedEndedAt: new Date(),
      },
      executor,
    );
  } catch (error) {
    const status = await readEppoCaptureSafeStatus(captureId, executor);
    const deadlineReached =
      error instanceof Error && error.message === "capture_job_deadline";
    if (
      ["inventorying", "hydrating", "verifying"].includes(
        status.captureState,
      ) &&
      (signal.aborted || deadlineReached)
    ) {
      await transitionEppoCapture(
        {
          captureId,
          fromStates: [status.captureState],
          toState: "paused",
          updates: {
            lastErrorClass: deadlineReached
              ? "capture_job_deadline"
              : "operator_cancelled",
          },
        },
        executor,
      );
    } else if (
      ["inventorying", "hydrating", "verifying"].includes(status.captureState)
    ) {
      await transitionEppoCapture(
        {
          captureId,
          fromStates: [status.captureState],
          toState: "failed",
          updates: {
            lastErrorClass:
              error instanceof EppoCaptureRequestError
                ? error.code
                : "capture_failed",
          },
        },
        executor,
      );
    }
    throw error;
  }
}

async function resumeOfficialCapture(
  options: EppoCaptureOptions,
  credential: string,
  plan: SafeEppoPlanReceipt,
  signal: AbortSignal,
  jobStartedAt: number,
  executor: EppoCaptureExecutor,
): Promise<EppoCaptureFinalReceipt> {
  const captureId =
    options.captureId ?? (await readLatestResumableEppoCaptureId(executor));
  if (!captureId) throw new Error("resumable_capture_missing");
  let status = await readEppoCaptureSafeStatus(captureId, executor);
  if (
    status.captureToolRevision !== currentGitRevision() ||
    status.openApiSha256 !== plan.openApiSha256 ||
    status.licenseSha256 !== plan.licenseSha256
  ) {
    throw new Error("capture_contract_drift");
  }
  try {
    if (status.captureState === "planned") {
      await transitionEppoCapture(
        {
          captureId,
          fromStates: ["planned"],
          toState: "inventorying",
        },
        executor,
      );
      status = await readEppoCaptureSafeStatus(captureId, executor);
    }
    if (
      status.captureState === "inventorying" ||
      (status.captureState === "paused" && status.inventoryStartTotal === null)
    ) {
      const inventory = await fetchOfficialInventory(credential, options, {
        captureId,
        signal,
        executor,
      });
      if (inventory.total !== plan.taxonomyTotal) {
        throw new Error("inventory_plan_total_drift");
      }
      await transitionEppoCapture(
        {
          captureId,
          fromStates: [status.captureState],
          toState: "hydrating",
          updates: {
            inventoryStartTotal: inventory.total,
            inventoryUniqueCodes: inventory.total,
            inventoryPageCount: inventory.pageCount,
            inventoryStartSha256: inventory.sha256,
            lastErrorClass: null,
          },
        },
        executor,
      );
      status = await readEppoCaptureSafeStatus(captureId, executor);
    } else if (status.captureState === "paused") {
      await transitionEppoCapture(
        {
          captureId,
          fromStates: ["paused"],
          toState: "hydrating",
          updates: { lastErrorClass: null },
        },
        executor,
      );
      status = await readEppoCaptureSafeStatus(captureId, executor);
    }
    if (status.captureState === "hydrating") {
      await hydrateOfficialEndpoints({
        captureId,
        credential,
        options,
        signal,
        jobStartedAt,
        executor,
      });
      await transitionEppoCapture(
        {
          captureId,
          fromStates: ["hydrating"],
          toState: "verifying",
        },
        executor,
      );
    } else if (status.captureState !== "verifying") {
      throw new Error(`capture_not_resumable:${status.captureState}`);
    }
    const endingInventory = await fetchOfficialInventory(credential, options, {
      signal,
      executor,
    });
    return await finalizeEppoCapture(
      {
        captureId,
        endingInventory,
        observedEndedAt: new Date(),
      },
      executor,
    );
  } catch (error) {
    status = await readEppoCaptureSafeStatus(captureId, executor);
    const deadlineReached =
      error instanceof Error && error.message === "capture_job_deadline";
    if (
      ["inventorying", "hydrating", "verifying"].includes(
        status.captureState,
      ) &&
      (signal.aborted || deadlineReached)
    ) {
      await transitionEppoCapture(
        {
          captureId,
          fromStates: [status.captureState],
          toState: "paused",
          updates: {
            lastErrorClass: deadlineReached
              ? "capture_job_deadline"
              : "operator_cancelled",
          },
        },
        executor,
      );
    } else if (
      status.captureState === "paused" &&
      (signal.aborted || deadlineReached)
    ) {
      // The interrupted resume was already checkpointed as paused.
    } else if (
      ["planned", "inventorying", "hydrating", "verifying", "paused"].includes(
        status.captureState,
      )
    ) {
      await transitionEppoCapture(
        {
          captureId,
          fromStates: [status.captureState],
          toState: "failed",
          updates: {
            lastErrorClass:
              error instanceof EppoCaptureRequestError
                ? error.code
                : "capture_failed",
          },
        },
        executor,
      );
    }
    throw error;
  }
}

function fixturePayload(code: string, endpointClass: EppoDetailEndpointClass) {
  if (endpointClass === "taxon_overview") {
    return { eppocode: code, fullname: `Fixture ${code}` };
  }
  if (endpointClass === "taxon_names") {
    return [{ name: `Fixture ${code}`, language: "en" }];
  }
  return [{ eppocode: code, name: `Fixture ${code}`, rank: "species" }];
}

async function competingEppoCaptureWriterIsBlocked(): Promise<boolean> {
  const connectionString = resolveDatabaseConnection().connectionString;
  const lockKey = captureRepositoryModule?.EPPO_CAPTURE_WRITER_LOCK_KEY;
  if (!connectionString || !lockKey) {
    throw new Error("capture_writer_probe_unavailable");
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(hashtextextended($1, 0)) as locked",
      [lockKey],
    );
    const locked = result.rows[0]?.locked === true;
    if (locked) {
      await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [
        lockKey,
      ]);
    }
    return !locked;
  } finally {
    await client.end();
  }
}

async function runCompleteFixture(): Promise<
  EppoCaptureFinalReceipt & {
    replay: "verified";
    inventoryResume: "verified";
    interruptedResume: "verified";
    singleWriter: "verified";
  }
> {
  return withEppoCaptureWriterLock(async (executor) => {
    const singleWriter = await competingEppoCaptureWriterIsBlocked();
    if (!singleWriter) throw new Error("single_writer_fixture_failed");

    const captureId = randomUUID();
    const baseline = await readEppoZeroProductFingerprint(executor);
    await createEppoCapture(
      {
        id: captureId,
        captureToolRevision: currentGitRevision(),
        openApiSha256: "a".repeat(64),
        licenseSha256: "b".repeat(64),
        observedStartedAt: new Date(),
        preflightReceipt: { environment: "local", fixture: "complete" },
        zeroProductBaseline: baseline,
      },
      executor,
    );
    await transitionEppoCapture(
      {
        captureId,
        fromStates: ["planned"],
        toState: "inventorying",
      },
      executor,
    );
    const inventoryPayload = {
      pagination: { offset: 0, limit: 3, count: 3, total: 3 },
      data: [
        { eppocode: "AAAA00", is_active: true },
        { eppocode: "AAAA.A", is_active: false, datatype: "SPB" },
        { eppocode: "ZZZZ99", is_active: true },
      ],
    };
    await recordEppoInventoryPage(
      {
        captureId,
        offset: 0,
        limit: 3,
        payload: inventoryPayload,
        observedAt: new Date(),
      },
      executor,
    );
    await transitionEppoCapture(
      {
        captureId,
        fromStates: ["inventorying"],
        toState: "paused",
        updates: { lastErrorClass: "fixture_inventory_interruption" },
      },
      executor,
    );
    // Exact inventory replay following a checkpointed interruption must
    // neither mutate the terminal page nor duplicate endpoint units.
    await recordEppoInventoryPage(
      {
        captureId,
        offset: 0,
        limit: 3,
        payload: inventoryPayload,
        observedAt: new Date(),
      },
      executor,
    );
    const inventory = await readEppoCapturedInventory(captureId, executor);
    await transitionEppoCapture(
      {
        captureId,
        fromStates: ["paused"],
        toState: "hydrating",
        updates: {
          inventoryStartTotal: inventory.total,
          inventoryUniqueCodes: inventory.total,
          inventoryPageCount: inventory.pageCount,
          inventoryStartSha256: inventory.sha256,
          lastErrorClass: null,
        },
      },
      executor,
    );

    let completed = 0;
    while (true) {
      const claim = await claimNextEppoCaptureUnit(
        {
          captureId,
          claimToken: randomUUID(),
          claimedAt: new Date(),
          maxAttempts: 2,
        },
        executor,
      );
      if (!claim) break;
      await completeEppoCaptureUnit(
        {
          captureId,
          unitId: claim.id,
          claimToken: claim.claimToken,
          observedAt: new Date(),
          httpStatusClass: "2xx",
          payload: fixturePayload(claim.eppoCode, claim.endpointClass),
        },
        executor,
      );
      completed += 1;
      if (completed === 1) {
        await transitionEppoCapture(
          {
            captureId,
            fromStates: ["hydrating"],
            toState: "paused",
            updates: { lastErrorClass: "fixture_interruption" },
          },
          executor,
        );
        await transitionEppoCapture(
          {
            captureId,
            fromStates: ["paused"],
            toState: "hydrating",
            updates: { lastErrorClass: null },
          },
          executor,
        );
      }
    }
    if (completed !== 6) throw new Error("fixture_endpoint_closure_mismatch");
    await transitionEppoCapture(
      {
        captureId,
        fromStates: ["hydrating"],
        toState: "verifying",
      },
      executor,
    );
    const receipt = await finalizeEppoCapture(
      {
        captureId,
        endingInventory: inventory,
        observedEndedAt: new Date(),
      },
      executor,
    );
    return {
      ...receipt,
      replay: "verified",
      inventoryResume: "verified",
      interruptedResume: "verified",
      singleWriter: "verified",
    };
  });
}

async function runDriftFixture() {
  return withEppoCaptureWriterLock(async (executor) => {
    const captureId = randomUUID();
    await createEppoCapture(
      {
        id: captureId,
        captureToolRevision: currentGitRevision(),
        openApiSha256: "a".repeat(64),
        licenseSha256: "b".repeat(64),
        observedStartedAt: new Date(),
        preflightReceipt: { environment: "local", fixture: "drift" },
        zeroProductBaseline: await readEppoZeroProductFingerprint(executor),
      },
      executor,
    );
    await transitionEppoCapture(
      {
        captureId,
        fromStates: ["planned"],
        toState: "inventorying",
      },
      executor,
    );
    const baseline = {
      pagination: { offset: 0, limit: 2, count: 2, total: 2 },
      data: [
        { eppocode: "ABCD01", is_active: true },
        { eppocode: "ZZZZ99", is_active: true },
      ],
    };
    await recordEppoInventoryPage(
      {
        captureId,
        offset: 0,
        limit: 2,
        payload: baseline,
        observedAt: new Date(),
      },
      executor,
    );
    let rejected = false;
    try {
      await recordEppoInventoryPage(
        {
          captureId,
          offset: 0,
          limit: 2,
          payload: {
            ...baseline,
            data: [
              { eppocode: "ABCD01", is_active: true },
              { eppocode: "YYYY98", is_active: true },
            ],
          },
          observedAt: new Date(),
        },
        executor,
      );
    } catch (error) {
      rejected =
        error instanceof Error &&
        error.message === "inventory_replay_digest_mismatch";
    }
    if (!rejected) throw new Error("inventory_drift_fixture_failed");
    await transitionEppoCapture(
      {
        captureId,
        fromStates: ["inventorying"],
        toState: "failed",
        updates: { lastErrorClass: "inventory_replay_digest_mismatch" },
      },
      executor,
    );
    return {
      class: "fixture" as const,
      fixture: "drift" as const,
      captureId,
      state: "failed" as const,
      inventoryDrift: "rejected" as const,
      productMutationCount: 0 as const,
      searchMutationCount: 0 as const,
      cleanup: "completed" as const,
    };
  });
}

async function runVerify(options: EppoCaptureOptions) {
  const captureId =
    options.captureId ?? (await readLatestCompletedEppoCaptureId());
  if (!captureId) throw new Error("completed_capture_missing");
  return verifyCompletedEppoCapture(captureId);
}

export async function runEppoObservedCapture(options: EppoCaptureOptions) {
  if (options.fixture === "timeout") {
    return runEppoTimeoutFixture({ timeoutMs: 25 });
  }
  assertLocalEppoCaptureEnvironment(options);
  await loadCaptureRepository();
  if (options.fixture === "complete") return runCompleteFixture();
  if (options.fixture === "drift") return runDriftFixture();

  if (options.statusOnly) {
    const captureId =
      options.captureId ??
      (await readLatestResumableEppoCaptureId()) ??
      (await readLatestCompletedEppoCaptureId());
    if (!captureId) throw new Error("capture_missing");
    return readEppoCaptureSafeStatus(captureId);
  }
  if (options.mode === "verify") return runVerify(options);

  const { resolveEppoCredential } =
    await import("../src/server/catalog-source/eppo-credentials");
  const credential = resolveEppoCredential();
  const controller = new AbortController();
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    controller.abort();
  };
  process.once("SIGINT", cancel);
  const jobStartedAt = performance.now();
  try {
    const plan = await runOfficialPlan(options, credential, controller.signal);
    if (options.mode === "plan") return plan;
    return await withEppoCaptureWriterLock((executor) =>
      options.mode === "capture"
        ? runNewOfficialCapture(
            options,
            credential,
            plan,
            controller.signal,
            jobStartedAt,
            executor,
          )
        : resumeOfficialCapture(
            options,
            credential,
            plan,
            controller.signal,
            jobStartedAt,
            executor,
          ),
    );
  } finally {
    process.removeListener("SIGINT", cancel);
    if (cancelled) process.exitCode = 130;
  }
}

async function main() {
  const options = parseEppoCaptureOptions(process.argv.slice(2));
  console.log(JSON.stringify(await runEppoObservedCapture(options)));
}

const isEntrypoint =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch((error: unknown) => {
    const errorClass =
      error instanceof EppoCaptureRequestError
        ? error.code
        : error instanceof Error &&
            /^[a-z0-9_]+(?::[a-z0-9_]+)?$/u.test(error.message) &&
            error.message.length <= 80
          ? error.message
          : "unknown_error";
    console.error(
      JSON.stringify({
        class: "observed_capture_error",
        state: "failed",
        errorClass,
        cleanup: "completed",
      }),
    );
    process.exitCode = 1;
  });
}
