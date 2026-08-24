import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/document-mutation-admission/readback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns only the non-secret protocol, deployment, TTL, and artifact receipts", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "synthetic-deployment-sha");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv(
      "R2_ENDPOINT",
      "https://cb03b15042adc74edfe2d8201636300a.r2.cloudflarestorage.com",
    );
    vi.stubEnv("R2_FORCE_PATH_STYLE", "true");

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      protocol: "overgarden.document-mutation-generation.v1",
      deploymentSha: "synthetic-deployment-sha",
      enforcement: "enabled",
      ephemeralMediaCapabilityTtlSeconds: 900,
      r2Addressing: {
        schemaVersion: "overgarden.r2-addressing.v1",
        environmentClass: "production",
        addressingClass: "path_style",
        enforcement: "verified",
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

  it("reports a closed refusal class without disclosing provider configuration", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv(
      "R2_ENDPOINT",
      "https://cb03b15042adc74edfe2d8201636300a.r2.cloudflarestorage.com",
    );
    vi.stubEnv("R2_FORCE_PATH_STYLE", "false");

    const response = GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.r2Addressing).toEqual({
      schemaVersion: "overgarden.r2-addressing.v1",
      environmentClass: "production",
      addressingClass: "virtual_hosted_style",
      enforcement: "refused",
    });
    expect(JSON.stringify(payload.r2Addressing)).not.toMatch(
      /cloudflarestorage|bucket|access|secret/i,
    );
  });

  it("reports only the bounded disabled rollback class", async () => {
    vi.stubEnv("DOCUMENT_MUTATION_ADMISSION_ENABLED", "false");

    const response = GET();
    const payload = (await response.json()) as { enforcement?: unknown };

    expect(response.status).toBe(200);
    expect(payload.enforcement).toBe("disabled");
  });
});
