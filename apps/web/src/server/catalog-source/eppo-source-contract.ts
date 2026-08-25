import "server-only";

// Historical OVE-253 decision receipt; not an acquisition or current release
// gate. ADR-0016 and docs/STABLE_REGISTRY.md own future observed captures.

import { createHash } from "node:crypto";

import {
  EPPO_API_BASE_URL,
  EPPO_API_KEY_HEADER,
  EPPO_LYPES_CODE,
  EPPO_LYPES_PATH,
  EPPO_OPENAPI_URL,
  type EppoFetch,
  type EppoFetchResponse,
  parseOfficialEppoOpenApi,
} from "../../../scripts/verify-eppo-api-access";
import { assertValidEppoCredential } from "./eppo-credentials";

export const EPPO_OPEN_LICENCE_URL =
  "https://data.eppo.int/data/Open_Licence.pdf";
export const EPPO_SOURCE_CONTRACT_TIMEOUT_MAX_MS = 21_600_000;
export const EPPO_SOURCE_CONTRACT_REQUEST_TIMEOUT_MS = 15_000;
export const EPPO_SOURCE_CONTRACT_MAX_ATTEMPTS = 2;
export const EPPO_SOURCE_CONTRACT_CONCURRENCY = 1;

const EPPO_LIST_PATH =
  "/taxons/list?orderBy=eppocode&orderAsc=true&limit=1&offset=0";
const EPPO_NAMES_PATH = `/taxons/taxon/${EPPO_LYPES_CODE}/names`;
const EPPO_TAXONOMY_PATH = `/taxons/taxon/${EPPO_LYPES_CODE}/taxonomy`;

export const EPPO_SOURCE_CONTRACT_TERMINAL_STATES = [
  "contract_approved",
  "blocked_manifest",
  "blocked_rights",
  "blocked_capability",
  "blocked_schema",
  "blocked_rate_limit",
  "blocked_timeout",
] as const;

export type EppoSourceContractTerminalState =
  (typeof EPPO_SOURCE_CONTRACT_TERMINAL_STATES)[number];

type EppoSourceClass =
  | "taxon_list"
  | "taxon_overview"
  | "taxon_names"
  | "taxon_taxonomy";

type EppoSourceClassStatus = "supported" | "not_checked";

export type EppoSourceContractErrorCode =
  | "invalid_timeout"
  | "invalid_max_attempts"
  | "invalid_concurrency"
  | "invalid_baseline"
  | "openapi_fetch_failed"
  | "openapi_drift"
  | "license_fetch_failed"
  | "license_schema_mismatch"
  | "request_timeout"
  | "authentication_rejected"
  | "authorization_rejected"
  | "rate_limited"
  | "api_unavailable"
  | "response_schema_mismatch";

export class EppoSourceContractError extends Error {
  constructor(readonly code: EppoSourceContractErrorCode) {
    super(`EPPO source contract verification failed: ${code}`);
    this.name = "EppoSourceContractError";
  }
}

export type EppoSourceContractReceipt = {
  class: "contract_decision";
  baselineSha: string;
  decisionId: string;
  terminalState: EppoSourceContractTerminalState;
  openApiDigest?: string;
  licenseDocumentDigest?: string;
  sourceClasses: Record<EppoSourceClass, EppoSourceClassStatus>;
  taxonomyCount?: number;
  releaseIdentity: "missing_official_versioned_checksum_manifest";
  closureMethod: "not_authorized_without_official_release_manifest";
  rightsEvidence:
    | "official_open_licence_document_fetched_attribution_required"
    | "unavailable";
  missingAuthority: string;
  attempts: number;
  concurrency: 1;
  durationMs: number;
  cleanup: "completed";
};

export type EppoSourceContractDependencies = {
  fetch?: EppoFetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  baselineSha?: string;
  signal?: AbortSignal;
};

export type EppoSourceContractOptions = {
  timeoutMs: number;
  maxAttempts: number;
  concurrency: number;
};

const DEFAULT_SOURCE_CLASSES: Record<EppoSourceClass, EppoSourceClassStatus> = {
  taxon_list: "not_checked",
  taxon_overview: "not_checked",
  taxon_names: "not_checked",
  taxon_taxonomy: "not_checked",
};

function defaultFetch(input: string, init: RequestInit) {
  return fetch(input, init) as Promise<EppoFetchResponse>;
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function fail(code: EppoSourceContractErrorCode): never {
  throw new EppoSourceContractError(code);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isSafeBaselineSha(value: string | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{40}$/u.test(value));
}

function validateOptions(options: EppoSourceContractOptions): void {
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs < EPPO_SOURCE_CONTRACT_REQUEST_TIMEOUT_MS ||
    options.timeoutMs > EPPO_SOURCE_CONTRACT_TIMEOUT_MAX_MS
  ) {
    fail("invalid_timeout");
  }
  if (
    !Number.isSafeInteger(options.maxAttempts) ||
    options.maxAttempts < 1 ||
    options.maxAttempts > EPPO_SOURCE_CONTRACT_MAX_ATTEMPTS
  ) {
    fail("invalid_max_attempts");
  }
  if (options.concurrency !== EPPO_SOURCE_CONTRACT_CONCURRENCY) {
    fail("invalid_concurrency");
  }
}

function responseIsJson(response: EppoFetchResponse): boolean {
  return Boolean(
    response.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json"),
  );
}

function responseIsPdf(response: EppoFetchResponse): boolean {
  return Boolean(
    response.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/pdf"),
  );
}

function retryAfterMilliseconds(value: string | null): number {
  if (!value || !/^\d{1,2}$/u.test(value)) return 250;
  return Math.min(Number(value) * 1_000, 10_000);
}

function deadlineRemaining(
  startedAt: number,
  timeoutMs: number,
  now: () => number,
): number {
  const remaining = timeoutMs - Math.max(0, now() - startedAt);
  if (remaining < 1) fail("request_timeout");
  return remaining;
}

type BoundedFetchResult<Body> =
  | {
      response: EppoFetchResponse;
      bodyRead: true;
      body: Body;
    }
  | {
      response: EppoFetchResponse;
      bodyRead: false;
    };

async function boundedFetch<Body>(
  fetcher: EppoFetch,
  input: string,
  init: RequestInit,
  startedAt: number,
  timeoutMs: number,
  now: () => number,
  readBody: (response: EppoFetchResponse) => Promise<Body>,
  externalSignal?: AbortSignal,
): Promise<BoundedFetchResult<Body>> {
  if (externalSignal?.aborted) fail("request_timeout");
  const controller = new AbortController();
  const abortForCancellation = () => controller.abort();
  externalSignal?.addEventListener("abort", abortForCancellation, {
    once: true,
  });
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(
      EPPO_SOURCE_CONTRACT_REQUEST_TIMEOUT_MS,
      deadlineRemaining(startedAt, timeoutMs, now),
    ),
  );

  try {
    const response = await fetcher(input, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) return { response, bodyRead: false };
    const body = await readBody(response);
    if (controller.signal.aborted) fail("request_timeout");
    return { response, bodyRead: true, body };
  } catch (error) {
    if (error instanceof EppoSourceContractError) throw error;
    if (controller.signal.aborted) fail("request_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortForCancellation);
  }
}

async function readWithRetry<Body>(
  fetcher: EppoFetch,
  input: string,
  init: RequestInit,
  startedAt: number,
  options: EppoSourceContractOptions,
  now: () => number,
  sleep: (milliseconds: number) => Promise<void>,
  readBody: (response: EppoFetchResponse) => Promise<Body>,
  failureCode:
    | "openapi_fetch_failed"
    | "license_fetch_failed"
    | "api_unavailable",
  signal?: AbortSignal,
): Promise<{ response: EppoFetchResponse; body: Body }> {
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    let result: BoundedFetchResult<Body>;
    try {
      result = await boundedFetch(
        fetcher,
        input,
        init,
        startedAt,
        options.timeoutMs,
        now,
        readBody,
        signal,
      );
    } catch (error) {
      if (error instanceof EppoSourceContractError) throw error;
      fail(failureCode);
    }
    const { response } = result;
    if (response.ok) {
      if (!result.bodyRead) fail(failureCode);
      return { response, body: result.body };
    }
    if (response.status === 429) {
      if (attempt < options.maxAttempts) {
        await sleep(
          retryAfterMilliseconds(response.headers.get("retry-after")),
        );
        continue;
      }
      fail("rate_limited");
    }
    if (response.status >= 500 && attempt < options.maxAttempts) {
      await sleep(retryAfterMilliseconds(response.headers.get("retry-after")));
      continue;
    }
    if (response.status === 401) fail("authentication_rejected");
    if (response.status === 403) fail("authorization_rejected");
    fail(failureCode);
  }
  fail(failureCode);
}

function assertDocumentedOperations(source: string): void {
  const requiredOperations = [
    ["  /taxons/list:", "      operationId: getGDTaxons"],
    ["  /taxons/taxon/{EPPOCODE}/names:", "      operationId: getGDTaxonNames"],
    [
      "  /taxons/taxon/{EPPOCODE}/taxonomy:",
      "      operationId: getGDTaxonTaxonomy",
    ],
  ] as const;

  for (const [pathKey, operationId] of requiredOperations) {
    const start = source.indexOf(`${pathKey}\n`);
    const nextPath = source.indexOf("\n  /", start + pathKey.length + 1);
    if (start < 0 || nextPath < 0) fail("openapi_drift");
    const block = source.slice(start, nextPath);
    if (!block.includes(operationId) || !block.includes("application/json")) {
      fail("openapi_drift");
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function assertListEnvelope(value: unknown): number {
  const response = asRecord(value);
  const pagination = asRecord(response?.pagination);
  if (
    !pagination ||
    pagination.offset !== 0 ||
    pagination.limit !== 1 ||
    pagination.count !== 1 ||
    !isCount(pagination.total) ||
    !Array.isArray(response?.data) ||
    response.data.length !== 1
  ) {
    fail("response_schema_mismatch");
  }
  return pagination.total;
}

function assertOverview(value: unknown): void {
  if (asRecord(value)?.eppocode !== EPPO_LYPES_CODE) {
    fail("response_schema_mismatch");
  }
}

function assertArrayResponse(value: unknown): void {
  if (!Array.isArray(value) || !value.every((item) => asRecord(item))) {
    fail("response_schema_mismatch");
  }
}

function terminalStateForError(
  error: unknown,
): EppoSourceContractTerminalState {
  if (!(error instanceof EppoSourceContractError)) return "blocked_capability";
  switch (error.code) {
    case "license_fetch_failed":
    case "license_schema_mismatch":
      return "blocked_rights";
    case "rate_limited":
      return "blocked_rate_limit";
    case "request_timeout":
      return "blocked_timeout";
    case "openapi_drift":
    case "response_schema_mismatch":
      return "blocked_schema";
    default:
      return "blocked_capability";
  }
}

function missingAuthorityFor(
  terminalState: EppoSourceContractTerminalState,
): string {
  const missingAuthority: Record<EppoSourceContractTerminalState, string> = {
    contract_approved: "none",
    blocked_manifest:
      "official versioned checksum manifest and full-corpus closure method",
    blocked_rights: "official readable licence document",
    blocked_capability: "official documented read-only API capability",
    blocked_schema: "official documented response schema",
    blocked_rate_limit: "documented request budget within the decision window",
    blocked_timeout: "bounded official response before the decision deadline",
  };
  return missingAuthority[terminalState];
}

function decisionId(input: {
  baselineSha: string;
  terminalState: EppoSourceContractTerminalState;
  openApiDigest?: string;
  licenseDocumentDigest?: string;
  taxonomyCount?: number;
}): string {
  return sha256(
    JSON.stringify({
      baselineSha: input.baselineSha,
      terminalState: input.terminalState,
      ...(input.openApiDigest ? { openApiDigest: input.openApiDigest } : {}),
      ...(input.licenseDocumentDigest
        ? { licenseDocumentDigest: input.licenseDocumentDigest }
        : {}),
      ...(input.taxonomyCount ? { taxonomyCount: input.taxonomyCount } : {}),
    }),
  );
}

function terminalReceipt(input: {
  baselineSha: string;
  terminalState: EppoSourceContractTerminalState;
  sourceClasses?: Record<EppoSourceClass, EppoSourceClassStatus>;
  openApiDigest?: string;
  licenseDocumentDigest?: string;
  taxonomyCount?: number;
  rightsEvidence?: EppoSourceContractReceipt["rightsEvidence"];
  attempts: number;
  durationMs: number;
}): EppoSourceContractReceipt {
  return {
    class: "contract_decision",
    baselineSha: input.baselineSha,
    decisionId: decisionId(input),
    terminalState: input.terminalState,
    ...(input.openApiDigest ? { openApiDigest: input.openApiDigest } : {}),
    ...(input.licenseDocumentDigest
      ? { licenseDocumentDigest: input.licenseDocumentDigest }
      : {}),
    sourceClasses: input.sourceClasses ?? { ...DEFAULT_SOURCE_CLASSES },
    ...(input.taxonomyCount ? { taxonomyCount: input.taxonomyCount } : {}),
    releaseIdentity: "missing_official_versioned_checksum_manifest",
    closureMethod: "not_authorized_without_official_release_manifest",
    rightsEvidence: input.rightsEvidence ?? "unavailable",
    missingAuthority: missingAuthorityFor(input.terminalState),
    attempts: input.attempts,
    concurrency: EPPO_SOURCE_CONTRACT_CONCURRENCY,
    durationMs: input.durationMs,
    cleanup: "completed",
  };
}

/**
 * Proves only current, official metadata capability. A paginated live API
 * response is deliberately insufficient to authorize a corpus mirror: EPPO
 * has not exposed a release/checksum manifest through this documented surface.
 */
export async function inspectEppoSourceContract(
  credential: string,
  options: EppoSourceContractOptions,
  dependencies: EppoSourceContractDependencies = {},
): Promise<EppoSourceContractReceipt> {
  validateOptions(options);
  const baselineSha = dependencies.baselineSha;
  if (!isSafeBaselineSha(baselineSha)) fail("invalid_baseline");

  const fetcher = dependencies.fetch ?? defaultFetch;
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? defaultSleep;
  const startedAt = now();
  const sourceClasses = { ...DEFAULT_SOURCE_CLASSES };
  let openApiDigest: string | undefined;
  let licenseDocumentDigest: string | undefined;
  let taxonomyCount: number | undefined;
  let rightsEvidence: EppoSourceContractReceipt["rightsEvidence"] =
    "unavailable";
  let attempts = 0;

  try {
    const candidate = assertValidEppoCredential(credential);
    const { response: openApiResponse, body: openApiSource } =
      await readWithRetry(
        fetcher,
        EPPO_OPENAPI_URL,
        {
          method: "GET",
          headers: { Accept: "application/yaml, text/yaml;q=0.9" },
          redirect: "error",
        },
        startedAt,
        options,
        now,
        sleep,
        (response) => response.text(),
        "openapi_fetch_failed",
        dependencies.signal,
      );
    attempts += 1;
    if (openApiResponse.status !== 200) fail("openapi_fetch_failed");
    if (!openApiSource || openApiSource.length > 2_000_000) {
      fail("openapi_fetch_failed");
    }
    openApiDigest = parseOfficialEppoOpenApi(openApiSource).openApiDigest;
    assertDocumentedOperations(openApiSource);

    const { response: licenceResponse, body: licenceDocument } =
      await readWithRetry(
        fetcher,
        EPPO_OPEN_LICENCE_URL,
        {
          method: "GET",
          headers: { Accept: "application/pdf" },
          redirect: "error",
        },
        startedAt,
        options,
        now,
        sleep,
        (response) => response.text(),
        "license_fetch_failed",
        dependencies.signal,
      );
    attempts += 1;
    if (licenceResponse.status !== 200 || !responseIsPdf(licenceResponse)) {
      fail("license_schema_mismatch");
    }
    if (!licenceDocument || licenceDocument.length > 2_000_000) {
      fail("license_schema_mismatch");
    }
    licenseDocumentDigest = sha256(licenceDocument);
    rightsEvidence =
      "official_open_licence_document_fetched_attribution_required";

    const readJson = async (
      path: string,
      verify: (body: unknown) => void,
      sourceClass: EppoSourceClass,
    ) => {
      const { body } = await readWithRetry(
        fetcher,
        `${EPPO_API_BASE_URL}${path}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            [EPPO_API_KEY_HEADER]: candidate,
          },
          redirect: "error",
        },
        startedAt,
        options,
        now,
        sleep,
        async (response) => {
          if (!responseIsJson(response)) fail("response_schema_mismatch");
          try {
            return await response.json();
          } catch {
            fail("response_schema_mismatch");
          }
        },
        "api_unavailable",
        dependencies.signal,
      );
      attempts += 1;
      verify(body);
      sourceClasses[sourceClass] = "supported";
      return body;
    };

    await readJson(
      EPPO_LIST_PATH,
      (body) => {
        taxonomyCount = assertListEnvelope(body);
      },
      "taxon_list",
    );
    await readJson(EPPO_LYPES_PATH, assertOverview, "taxon_overview");
    await readJson(EPPO_NAMES_PATH, assertArrayResponse, "taxon_names");
    await readJson(EPPO_TAXONOMY_PATH, assertArrayResponse, "taxon_taxonomy");

    return terminalReceipt({
      baselineSha,
      terminalState: "blocked_manifest",
      sourceClasses,
      openApiDigest,
      licenseDocumentDigest,
      taxonomyCount,
      rightsEvidence,
      attempts,
      durationMs: Math.max(0, now() - startedAt),
    });
  } catch (error) {
    return terminalReceipt({
      baselineSha,
      terminalState: terminalStateForError(error),
      sourceClasses,
      openApiDigest,
      licenseDocumentDigest,
      taxonomyCount,
      rightsEvidence,
      attempts,
      durationMs: Math.max(0, now() - startedAt),
    });
  }
}

export function eppoSourceContractFailureCode(
  error: unknown,
): EppoSourceContractErrorCode | "unexpected_failure" {
  return error instanceof EppoSourceContractError
    ? error.code
    : "unexpected_failure";
}
