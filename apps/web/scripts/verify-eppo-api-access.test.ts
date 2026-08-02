import { describe, expect, it } from "vitest";

import {
  EPPO_API_KEY_HEADER,
  EPPO_LYPES_CODE,
  EPPO_LYPES_OPERATION_ID,
  EPPO_LYPES_PATH,
  EPPO_OPENAPI_URL,
  EppoApiAccessError,
  eppoApiAccessFailureCode,
  type EppoFetch,
  inspectOfficialEppoOpenApi,
  verifyEppoApiAccess,
} from "./verify-eppo-api-access";
import { EppoCredentialError } from "../src/server/catalog-source/eppo-credentials";

const FIXTURE_CREDENTIAL = "eppo_fixture_credential_4fd9d606a6b74d9a";

const OFFICIAL_OPENAPI_FIXTURE = `openapi: 3.0.0
servers:
  - url: https://api.eppo.int/gd/v2
paths:
  /taxons/taxon/{EPPOCODE}/overview:
    get:
      operationId: getGDTaxon
      security:
        - ApiKeyAuth: [ ]
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TaxonResponse'
  /another/path:
    get:
      operationId: ignored
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      name: X-Api-Key
      in: header
  schemas:
    TaxonResponse:
      type: object
      properties:
        eppocode:
          $ref: '#/components/schemas/EPPOCode'
`;

function response(input: {
  status?: number;
  contentType?: string | null;
  text?: string;
  json?: unknown;
}) {
  const status = input.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => input.contentType ?? "application/json" },
    text: async () => input.text ?? OFFICIAL_OPENAPI_FIXTURE,
    json: async () => input.json ?? { eppocode: EPPO_LYPES_CODE },
  };
}

describe("EPPO API v2 verifier", () => {
  it("keeps canonical credential policy failures observable without exposing a value", () => {
    expect(
      eppoApiAccessFailureCode(new EppoCredentialError("missing_credential")),
    ).toBe("missing_credential");
    expect(eppoApiAccessFailureCode(new Error("credential=do-not-print"))).toBe(
      "unexpected_failure",
    );
  });

  it("pins the official host, header, LYPES taxon operation, and schema", async () => {
    const seen: Array<{ input: string; init: RequestInit }> = [];
    const fetcher: EppoFetch = async (input, init) => {
      seen.push({ input, init });
      return input === EPPO_OPENAPI_URL
        ? response({ text: OFFICIAL_OPENAPI_FIXTURE })
        : response({ json: { eppocode: EPPO_LYPES_CODE } });
    };

    const receipt = await verifyEppoApiAccess(FIXTURE_CREDENTIAL, {
      fetch: fetcher,
      now: () => 100,
    });

    expect(receipt).toMatchObject({
      class: "verified",
      operationId: EPPO_LYPES_OPERATION_ID,
      operationPath: EPPO_LYPES_PATH,
      authHeader: EPPO_API_KEY_HEADER,
      httpStatusClass: "2xx",
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject({
      input: `https://api.eppo.int/gd/v2${EPPO_LYPES_PATH}`,
      init: {
        method: "GET",
        redirect: "error",
        headers: {
          Accept: "application/json",
          [EPPO_API_KEY_HEADER]: FIXTURE_CREDENTIAL,
        },
      },
    });
  });

  it.each([
    OFFICIAL_OPENAPI_FIXTURE.replace("X-Api-Key", "Authorization"),
    OFFICIAL_OPENAPI_FIXTURE.replace("getGDTaxon", "mutatingTaxon"),
    OFFICIAL_OPENAPI_FIXTURE.replace("application/json", "text/html"),
    OFFICIAL_OPENAPI_FIXTURE.replace(
      "https://api.eppo.int/gd/v2",
      "https://example.invalid/gd/v2",
    ),
  ])("fails closed on OpenAPI contract drift", async (openApi) => {
    const fetcher: EppoFetch = async () => response({ text: openApi });

    await expect(
      inspectOfficialEppoOpenApi({ fetch: fetcher }),
    ).rejects.toMatchObject({
      code: "openapi_drift",
    });
  });

  it.each([
    [401, "authentication_rejected"],
    [403, "authorization_rejected"],
  ] as const)(
    "classifies deterministic HTTP %i without leaking the key",
    async (status, code) => {
      const fetcher: EppoFetch = async (input) =>
        input === EPPO_OPENAPI_URL
          ? response({ text: OFFICIAL_OPENAPI_FIXTURE })
          : response({ status });

      await expect(
        verifyEppoApiAccess(FIXTURE_CREDENTIAL, { fetch: fetcher }),
      ).rejects.toMatchObject({ code } satisfies Partial<EppoApiAccessError>);
    },
  );

  it("retries a transient rate limit at most twice", async () => {
    let lypesRequests = 0;
    const fetcher: EppoFetch = async (input) => {
      if (input === EPPO_OPENAPI_URL) {
        return response({ text: OFFICIAL_OPENAPI_FIXTURE });
      }
      lypesRequests += 1;
      return lypesRequests < 3
        ? response({ status: 429 })
        : response({ json: { eppocode: EPPO_LYPES_CODE } });
    };
    const waits: number[] = [];

    await expect(
      verifyEppoApiAccess(FIXTURE_CREDENTIAL, {
        fetch: fetcher,
        sleep: async (milliseconds) => {
          waits.push(milliseconds);
        },
      }),
    ).resolves.toMatchObject({ class: "verified" });
    expect(lypesRequests).toBe(3);
    expect(waits).toHaveLength(2);
  });

  it("rejects a 2xx response that does not identify LYPES", async () => {
    const fetcher: EppoFetch = async (input) =>
      input === EPPO_OPENAPI_URL
        ? response({ text: OFFICIAL_OPENAPI_FIXTURE })
        : response({ json: { eppocode: "BEMITA" } });

    await expect(
      verifyEppoApiAccess(FIXTURE_CREDENTIAL, { fetch: fetcher }),
    ).rejects.toMatchObject({ code: "response_schema_mismatch" });
  });
});
