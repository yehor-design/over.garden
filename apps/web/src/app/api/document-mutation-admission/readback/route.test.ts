import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/document-mutation-admission/readback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns only the non-secret protocol, deployment, TTL, and artifact receipts", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "synthetic-deployment-sha");
    vi.stubEnv("R2_UPLOAD_URL_TTL_SECONDS", "900");

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      protocol: "overgarden.document-mutation-generation.v1",
      deploymentSha: "synthetic-deployment-sha",
      enforcement: "enabled",
      r2UploadUrlTtl: {
        source: "environment",
        effectiveSeconds: 900,
        maximumSeconds: 900,
      },
      authenticatedMutation: {
        schemaVersion:
          "overgarden.authenticated-mutation-deployment-receipt.v1",
        registry: {
          digest: expect.stringMatching(/^[a-f0-9]{64}$/),
          sourceReceiptDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          entrypointCount: expect.any(Number),
          consumerEdgeCount: expect.any(Number),
        },
        enforcement: {
          receiptDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          ove291EntrypointCount: expect.any(Number),
          ove291ConsumerEdgeCount: expect.any(Number),
        },
        explicitGoogleLink: {
          ownershipDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          entrypointCount: 5,
          consumerEdgeCount: 15,
        },
      },
    });
  });

  it("fails closed without disclosing malformed environment input", async () => {
    vi.stubEnv("R2_UPLOAD_URL_TTL_SECONDS", "901");

    const response = GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "MUTATION_ADMISSION_UNAVAILABLE",
    });
  });

  it("reports only the bounded disabled rollback class", async () => {
    vi.stubEnv("DOCUMENT_MUTATION_ADMISSION_ENABLED", "false");

    const response = GET();
    const payload = (await response.json()) as { enforcement?: unknown };

    expect(response.status).toBe(200);
    expect(payload.enforcement).toBe("disabled");
  });
});
