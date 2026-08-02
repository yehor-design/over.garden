import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  assertValidEppoCredential,
  eppoCredentialFingerprintPrefix,
  resolveEppoCredential,
} from "../src/server/catalog-source/eppo-credentials";

export const EPPO_OPENAPI_URL = "https://api.eppo.int/gd/v2/eppo_api_gd_v2.yml";
export const EPPO_API_BASE_URL = "https://api.eppo.int/gd/v2";
export const EPPO_LYPES_CODE = "LYPES";
export const EPPO_LYPES_OPERATION_ID = "getGDTaxon";
export const EPPO_LYPES_PATH = `/taxons/taxon/${EPPO_LYPES_CODE}/overview`;
export const EPPO_API_KEY_HEADER = "X-Api-Key";
export const EPPO_REQUEST_TIMEOUT_MS = 15_000;
export const EPPO_MAX_REQUEST_ATTEMPTS = 3;

export type EppoApiAccessErrorCode =
  | "openapi_fetch_failed"
  | "openapi_invalid"
  | "openapi_drift"
  | "request_timeout"
  | "authentication_rejected"
  | "authorization_rejected"
  | "rate_limited"
  | "api_unavailable"
  | "response_schema_mismatch";

export class EppoApiAccessError extends Error {
  constructor(readonly code: EppoApiAccessErrorCode) {
    super(`EPPO API access verification failed: ${code}`);
    this.name = "EppoApiAccessError";
  }
}

export interface EppoFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: Pick<Headers, "get">;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type EppoFetch = (
  input: string,
  init: RequestInit,
) => Promise<EppoFetchResponse>;

export interface EppoOpenApiContract {
  openApiDigest: string;
  apiBaseUrl: typeof EPPO_API_BASE_URL;
  operationId: typeof EPPO_LYPES_OPERATION_ID;
  operationPath: typeof EPPO_LYPES_PATH;
  authHeader: typeof EPPO_API_KEY_HEADER;
}

export interface EppoApiAccessReceipt extends EppoOpenApiContract {
  class: "verified";
  httpStatusClass: "2xx";
  latencyMs: number;
  fingerprintPrefix: string;
}

export interface EppoApiAccessDependencies {
  fetch?: EppoFetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

function defaultFetch(input: string, init: RequestInit) {
  return fetch(input, init) as Promise<EppoFetchResponse>;
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function eppoApiError(code: EppoApiAccessErrorCode): never {
  throw new EppoApiAccessError(code);
}

/**
 * Strictly validates the exact serialized facets of the current official
 * OpenAPI document that authorize this one read-only witness. It intentionally
 * rejects an unfamiliar YAML shape instead of attempting permissive recovery.
 */
export function parseOfficialEppoOpenApi(source: string): EppoOpenApiContract {
  if (
    !/^openapi:\s*3\.0\.0\s*$/mu.test(source) ||
    !/^servers:\n(?: {2}- url: https:\/\/api\.eppo\.int\/gd\/v2\s*\n)/mu.test(
      source,
    )
  ) {
    eppoApiError("openapi_drift");
  }

  const operation = yamlPathBlock(
    source,
    "  /taxons/taxon/{EPPOCODE}/overview:",
  );
  if (
    !/^ {4}get:\n/mu.test(operation) ||
    !/^ {6}operationId: getGDTaxon\s*$/mu.test(operation) ||
    !/^ {6}security:\n {8}- ApiKeyAuth: \[ ?\]\s*$/mu.test(operation) ||
    !/^ {8}'200':\n[\s\S]*?^ {12}application\/json:\n[\s\S]*?^ {16}\$ref: '#\/components\/schemas\/TaxonResponse'\s*$/mu.test(
      operation,
    )
  ) {
    eppoApiError("openapi_drift");
  }

  const securityScheme = yamlMappingBlock(
    source,
    "  securitySchemes:",
    "    ApiKeyAuth:",
  );
  if (
    !/^ {6}type: apiKey\s*$/mu.test(securityScheme) ||
    !/^ {6}name: X-Api-Key\s*$/mu.test(securityScheme) ||
    !/^ {6}in: header\s*$/mu.test(securityScheme)
  ) {
    eppoApiError("openapi_drift");
  }

  const taxonResponse = yamlMappingBlock(
    source,
    "  schemas:",
    "    TaxonResponse:",
  );
  if (
    !/^ {6}type: object\s*$/mu.test(taxonResponse) ||
    !/^ {8}eppocode:\n {10}\$ref: '#\/components\/schemas\/EPPOCode'\s*$/mu.test(
      taxonResponse,
    )
  ) {
    eppoApiError("openapi_drift");
  }

  return {
    openApiDigest: createHash("sha256").update(source, "utf8").digest("hex"),
    apiBaseUrl: EPPO_API_BASE_URL,
    operationId: EPPO_LYPES_OPERATION_ID,
    operationPath: EPPO_LYPES_PATH,
    authHeader: EPPO_API_KEY_HEADER,
  };
}

export async function inspectOfficialEppoOpenApi(
  dependencies: EppoApiAccessDependencies = {},
): Promise<EppoOpenApiContract> {
  const response = await boundedFetch(
    dependencies.fetch ?? defaultFetch,
    EPPO_OPENAPI_URL,
    {
      method: "GET",
      headers: { Accept: "application/yaml, text/yaml;q=0.9" },
      redirect: "error",
    },
    "openapi_fetch_failed",
  );

  if (!response.ok || response.status !== 200) {
    eppoApiError("openapi_fetch_failed");
  }

  let source: string;
  try {
    source = await response.text();
  } catch {
    eppoApiError("openapi_invalid");
  }

  if (!source || source.length > 2_000_000) {
    eppoApiError("openapi_invalid");
  }

  return parseOfficialEppoOpenApi(source);
}

export async function verifyEppoApiAccess(
  credential: string,
  dependencies: EppoApiAccessDependencies = {},
): Promise<EppoApiAccessReceipt> {
  const candidate = assertValidEppoCredential(credential);
  const fetcher = dependencies.fetch ?? defaultFetch;
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? defaultSleep;
  const startedAt = now();
  const contract = await inspectOfficialEppoOpenApi({ fetch: fetcher });

  for (let attempt = 1; attempt <= EPPO_MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const response = await boundedFetch(
      fetcher,
      `${contract.apiBaseUrl}${contract.operationPath}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          [contract.authHeader]: candidate,
        },
        redirect: "error",
      },
      "request_timeout",
    );

    if (response.ok && response.status >= 200 && response.status < 300) {
      if (!isJsonMediaType(response.headers.get("content-type"))) {
        eppoApiError("response_schema_mismatch");
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        eppoApiError("response_schema_mismatch");
      }

      if (
        !body ||
        typeof body !== "object" ||
        (body as Record<string, unknown>).eppocode !== EPPO_LYPES_CODE
      ) {
        eppoApiError("response_schema_mismatch");
      }

      return {
        ...contract,
        class: "verified",
        httpStatusClass: "2xx",
        latencyMs: Math.max(0, now() - startedAt),
        fingerprintPrefix: eppoCredentialFingerprintPrefix(candidate),
      };
    }

    if (response.status === 401) eppoApiError("authentication_rejected");
    if (response.status === 403) eppoApiError("authorization_rejected");

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < EPPO_MAX_REQUEST_ATTEMPTS) {
      await sleep(retryAfterMilliseconds(response.headers.get("retry-after")));
      continue;
    }

    if (response.status === 429) eppoApiError("rate_limited");
    if (response.status >= 500) eppoApiError("api_unavailable");
    eppoApiError("response_schema_mismatch");
  }

  eppoApiError("api_unavailable");
}

async function boundedFetch(
  fetcher: EppoFetch,
  input: string,
  init: RequestInit,
  failureCode: "openapi_fetch_failed" | "request_timeout",
): Promise<EppoFetchResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EPPO_REQUEST_TIMEOUT_MS);

  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch {
    eppoApiError(failureCode);
  } finally {
    clearTimeout(timeout);
  }
}

function yamlPathBlock(source: string, pathKey: string): string {
  const start = source.indexOf(`${pathKey}\n`);
  if (start < 0) eppoApiError("openapi_drift");
  const nextPath = source.indexOf("\n  /", start + pathKey.length + 1);
  if (nextPath < 0) eppoApiError("openapi_drift");
  return source.slice(start, nextPath);
}

function yamlMappingBlock(
  source: string,
  parentKey: string,
  childKey: string,
): string {
  const parentStart = source.indexOf(`${parentKey}\n`);
  if (parentStart < 0) eppoApiError("openapi_drift");
  const childStart = source.indexOf(`${childKey}\n`, parentStart);
  if (childStart < 0) eppoApiError("openapi_drift");
  const nextSibling = source
    .slice(childStart + childKey.length + 1)
    .search(/^ {4}\S/mu);
  if (nextSibling < 0) return source.slice(childStart);
  return source.slice(
    childStart,
    childStart + childKey.length + 1 + nextSibling,
  );
}

function isJsonMediaType(contentType: string | null): boolean {
  return Boolean(contentType?.toLowerCase().startsWith("application/json"));
}

function retryAfterMilliseconds(value: string | null): number {
  if (!value || !/^\d{1,2}$/u.test(value)) return 250;
  return Math.min(Number(value) * 1_000, 10_000);
}

function cliArguments() {
  const supplied = process.argv.slice(2);
  const args = supplied[0] === "--" ? supplied.slice(1) : supplied;
  const allowed = new Set(["--runtime", "--json"]);
  if (args.some((argument) => !allowed.has(argument))) {
    throw new EppoApiAccessError("openapi_invalid");
  }
  return { runtime: args.includes("--runtime"), json: args.includes("--json") };
}

async function runCli() {
  const args = cliArguments();
  const result = args.runtime
    ? await verifyEppoApiAccess(resolveEppoCredential())
    : await inspectOfficialEppoOpenApi();
  const safeResult =
    "class" in result
      ? result
      : {
          class: "contract_verified" as const,
          openApiDigest: result.openApiDigest,
          operationId: result.operationId,
          operationPath: result.operationPath,
          authHeader: result.authHeader,
        };

  process.stdout.write(
    args.json
      ? `${JSON.stringify(safeResult)}\n`
      : `eppo_api_access=${safeResult.class} operation=${safeResult.operationId} openapi_digest=${safeResult.openApiDigest}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCli().catch((error: unknown) => {
    const code =
      error instanceof EppoApiAccessError ? error.code : "unexpected_failure";
    process.stderr.write(`eppo_api_access=failed code=${code}\n`);
    process.exitCode = 1;
  });
}
