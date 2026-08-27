import { describe, expect, it } from "vitest";

import {
  EPPO_OPEN_LICENCE_URL,
  EPPO_SOURCE_CONTRACT_CONCURRENCY,
  inspectEppoSourceContract,
  type EppoSourceContractOptions,
} from "./eppo-source-contract";
import {
  EPPO_API_BASE_URL,
  EPPO_LYPES_PATH,
  EPPO_OPENAPI_URL,
  type EppoFetch,
} from "../../../scripts/verify-eppo-api-access";

const FIXTURE_CREDENTIAL = "eppo_fixture_contract_2445ed2f3b8b4a74";
const FIXTURE_BASELINE = "534e8d18ef402095ae1e77880e03749536066f6f";

const OPENAPI_FIXTURE = `openapi: 3.0.0
servers:
  - url: https://api.eppo.int/gd/v2
paths:
  /taxons/list:
    get:
      operationId: getGDTaxons
      responses:
        '200':
          content:
            application/json: {}
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
  /taxons/taxon/{EPPOCODE}/names:
    get:
      operationId: getGDTaxonNames
      responses:
        '200':
          content:
            application/json: {}
  /taxons/taxon/{EPPOCODE}/taxonomy:
    get:
      operationId: getGDTaxonTaxonomy
      responses:
        '200':
          content:
            application/json: {}
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

const options: EppoSourceContractOptions = {
  timeoutMs: 15_000,
  maxAttempts: 2,
  concurrency: EPPO_SOURCE_CONTRACT_CONCURRENCY,
};

function response(input: {
  status?: number;
  contentType?: string;
  text?: string;
  json?: unknown;
}) {
  const status = input.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => input.contentType ?? "application/json" },
    text: async () => input.text ?? OPENAPI_FIXTURE,
    json: async () => input.json,
  };
}

function fixtureFetcher(
  overrides: Partial<Record<string, ReturnType<typeof response>>> = {},
): EppoFetch {
  return async (input) => {
    if (overrides[input]) return overrides[input];
    if (input === EPPO_OPENAPI_URL) {
      return response({
        contentType: "application/yaml",
        text: OPENAPI_FIXTURE,
      });
    }
    if (input === EPPO_OPEN_LICENCE_URL) {
      return response({
        contentType: "application/pdf",
        text: "fixture licence",
      });
    }
    if (input.includes("/taxons/list?")) {
      return response({
        json: {
          pagination: { offset: 0, limit: 1, count: 1, total: 129_188 },
          data: [{}],
        },
      });
    }
    if (input === `${EPPO_API_BASE_URL}${EPPO_LYPES_PATH}`) {
      return response({ json: { eppocode: "LYPES" } });
    }
    if (input.endsWith("/names") || input.endsWith("/taxonomy")) {
      return response({ json: [] });
    }
    throw new Error(`Unexpected fixture URL: ${input}`);
  };
}

describe("EPPO source contract decision", () => {
  it("records a deterministic blocked_manifest decision without emitting raw payload or credentials", async () => {
    const receipt = await inspectEppoSourceContract(
      FIXTURE_CREDENTIAL,
      options,
      {
        fetch: fixtureFetcher(),
        baselineSha: FIXTURE_BASELINE,
        now: () => 100,
      },
    );

    expect(receipt).toMatchObject({
      class: "contract_decision",
      terminalState: "blocked_manifest",
      baselineSha: FIXTURE_BASELINE,
      sourceClasses: {
        taxon_list: "supported",
        taxon_overview: "supported",
        taxon_names: "supported",
        taxon_taxonomy: "supported",
      },
      taxonomyCount: 129_188,
      concurrency: 1,
      cleanup: "completed",
    });
    expect(JSON.stringify(receipt)).not.toContain(FIXTURE_CREDENTIAL);
    expect(JSON.stringify(receipt)).not.toContain("LYPES");
  });

  it("derives the same decision identity when timing evidence differs", async () => {
    const first = await inspectEppoSourceContract(FIXTURE_CREDENTIAL, options, {
      fetch: fixtureFetcher(),
      baselineSha: FIXTURE_BASELINE,
      now: (() => {
        let calls = 0;
        return () => (calls++ === 0 ? 0 : 50);
      })(),
    });
    const second = await inspectEppoSourceContract(
      FIXTURE_CREDENTIAL,
      options,
      {
        fetch: fixtureFetcher(),
        baselineSha: FIXTURE_BASELINE,
        now: (() => {
          let calls = 0;
          return () => (calls++ === 0 ? 0 : 100);
        })(),
      },
    );

    expect(first.durationMs).not.toBe(second.durationMs);
    expect(first.decisionId).toBe(second.decisionId);
  });

  it("fails closed on an undocumented response shape", async () => {
    const listUrl = `${EPPO_API_BASE_URL}/taxons/list?orderBy=eppocode&orderAsc=true&limit=1&offset=0`;
    const receipt = await inspectEppoSourceContract(
      FIXTURE_CREDENTIAL,
      options,
      {
        fetch: fixtureFetcher({
          [listUrl]: response({ json: { pagination: { total: 1 }, data: [] } }),
        }),
        baselineSha: FIXTURE_BASELINE,
      },
    );

    expect(receipt.terminalState).toBe("blocked_schema");
    expect(receipt.sourceClasses.taxon_list).toBe("not_checked");
  });

  it("uses no more than two serial attempts when the documented API rate-limits", async () => {
    const listUrl = `${EPPO_API_BASE_URL}/taxons/list?orderBy=eppocode&orderAsc=true&limit=1&offset=0`;
    let requests = 0;
    const fetcher = fixtureFetcher({
      [listUrl]: response({ status: 429 }),
    });
    const countedFetcher: EppoFetch = async (input, init) => {
      if (input === listUrl) requests += 1;
      return fetcher(input, init);
    };

    const receipt = await inspectEppoSourceContract(
      FIXTURE_CREDENTIAL,
      options,
      {
        fetch: countedFetcher,
        baselineSha: FIXTURE_BASELINE,
        sleep: async () => undefined,
      },
    );

    expect(receipt.terminalState).toBe("blocked_rate_limit");
    expect(requests).toBe(2);
    expect(receipt.concurrency).toBe(1);
  });

  it("returns a bounded timeout receipt before a late provider response can be admitted", async () => {
    let clock = 0;
    const receipt = await inspectEppoSourceContract(
      FIXTURE_CREDENTIAL,
      options,
      {
        fetch: fixtureFetcher(),
        baselineSha: FIXTURE_BASELINE,
        now: () => {
          clock += 16_000;
          return clock;
        },
      },
    );

    expect(receipt.terminalState).toBe("blocked_timeout");
    expect(receipt.sourceClasses).toEqual({
      taxon_list: "not_checked",
      taxon_overview: "not_checked",
      taxon_names: "not_checked",
      taxon_taxonomy: "not_checked",
    });
  });

  it("keeps the request deadline active until the provider body is consumed", async () => {
    let nowCalls = 0;
    const receipt = await inspectEppoSourceContract(
      FIXTURE_CREDENTIAL,
      options,
      {
        fetch: async (input, init) => {
          const fixture = await fixtureFetcher()(input, init);
          if (input !== EPPO_OPENAPI_URL) return fixture;
          return {
            ...fixture,
            text: () =>
              new Promise<string>((resolve, reject) => {
                const lateBody = setTimeout(() => resolve(OPENAPI_FIXTURE), 25);
                init.signal?.addEventListener(
                  "abort",
                  () => {
                    clearTimeout(lateBody);
                    reject(new DOMException("aborted", "AbortError"));
                  },
                  { once: true },
                );
              }),
          };
        },
        baselineSha: FIXTURE_BASELINE,
        now: () => (nowCalls++ === 0 ? 0 : 14_999),
      },
    );

    expect(receipt.terminalState).toBe("blocked_timeout");
    expect(receipt.sourceClasses.taxon_list).toBe("not_checked");
  });

  it("fences an explicit terminal cancellation before contacting an official endpoint", async () => {
    const cancellation = new AbortController();
    cancellation.abort();
    let requests = 0;
    const receipt = await inspectEppoSourceContract(
      FIXTURE_CREDENTIAL,
      options,
      {
        fetch: async (input, init) => {
          requests += 1;
          return fixtureFetcher()(input, init);
        },
        baselineSha: FIXTURE_BASELINE,
        signal: cancellation.signal,
      },
    );

    expect(receipt.terminalState).toBe("blocked_timeout");
    expect(requests).toBe(0);
  });
});
