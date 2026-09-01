import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const admission = vi.hoisted(() => ({
  admitDocumentMutation: vi.fn(),
}));
const capability = vi.hoisted(() => ({
  issueEphemeralStagingCapability: vi.fn(),
}));

vi.mock("@/server/document-mutation-admission", () => ({
  admitDocumentMutation: admission.admitDocumentMutation,
  documentMutationGenerationFromRequest: (request: Request) =>
    request.headers.get("x-overgarden-document-generation"),
  documentMutationAdmissionResponse: (result: {
    statusCode: number;
    transportResult: string;
  }) =>
    Response.json(
      { code: result.transportResult },
      { status: result.statusCode },
    ),
}));
vi.mock("@/server/media/ephemeral-staging-capability", () => ({
  issueEphemeralStagingCapability: capability.issueEphemeralStagingCapability,
}));

import {
  buildEphemeralMediaUploadReservation,
  parseEphemeralMediaUploadReservation,
} from "@/lib/media/ephemeral-staging-contract";

import { POST } from "./route";

// A capability the shared contract accepts. The previous fixture was
// "opaque.capability", which the browser parser would always have refused.
const CAPABILITY =
  "eyJhbGciOiJIUzI1NiIsImtpZCI6IjEifQ.eyJraW5kIjoiY2FwYWJpbGl0eSJ9.c2lnbmF0dXJlLXZhbHVl";
const NOW = 1_777_000_000;

const VALID_BODY = {
  stagingSessionId: "00000000-0000-4000-8000-000000000002",
  mediaAssetId: "00000000-0000-4000-8000-000000000003",
  generation: 1,
  sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  sizeBytes: 4_096,
  width: 800,
  height: 600,
};

describe("POST /api/media/staging/reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admission.admitDocumentMutation.mockResolvedValue({
      status: "admitted",
      scope: {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session",
      },
    });
    capability.issueEphemeralStagingCapability.mockResolvedValue({
      capability: CAPABILITY,
      issuedAtSeconds: NOW,
      expiresAtSeconds: NOW + 900,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("authenticates before reading private JSON and returns no-store JSON only", async () => {
    admission.admitDocumentMutation.mockResolvedValueOnce({
      status: "rejected",
      statusCode: 401,
      transportResult: "AUTHENTICATION_REQUIRED",
    });
    let reads = 0;
    const request = new Request(
      "http://localhost/api/media/staging/reservations",
      {
        method: "POST",
        body: JSON.stringify({ privateCaption: "not observable" }),
      },
    );
    Object.defineProperty(request, "json", {
      value: async () => {
        reads += 1;
        return VALID_BODY;
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(reads).toBe(0);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(capability.issueEphemeralStagingCapability).not.toHaveBeenCalled();
  });

  it("issues an owner-bound upload capability without a repository write", async () => {
    const response = await POST(requestFor(VALID_BODY));

    expect(response.status).toBe(200);
    const body = await response.json();
    // The expectation is built from the shared declaration, so this suite and
    // the browser suite can no longer drift apart on the wire shape.
    expect(body).toEqual(
      buildEphemeralMediaUploadReservation({
        stagingOrigin: "https://media-stage.over.garden",
        binding: {
          stagingSessionId: VALID_BODY.stagingSessionId,
          mediaAssetId: VALID_BODY.mediaAssetId,
          generation: VALID_BODY.generation,
        },
        uploadCapability: CAPABILITY,
        expiresAtSeconds: NOW + 900,
        nowSeconds: NOW,
      }),
    );
    // And the browser's own parser accepts exactly what the route serialized.
    expect(
      parseEphemeralMediaUploadReservation(body, {
        expectedOrigin: "https://media-stage.over.garden",
        binding: {
          stagingSessionId: VALID_BODY.stagingSessionId,
          mediaAssetId: VALID_BODY.mediaAssetId,
          generation: VALID_BODY.generation,
        },
        nowSeconds: NOW,
      }),
    ).not.toBeNull();
    expect(capability.issueEphemeralStagingCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: "00000000-0000-4000-8000-000000000001",
        ...VALID_BODY,
      }),
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    ["non-HTTP localhost URL", "ftp://localhost"],
    ["credential-bearing URL", "https://user:pass@media-stage.over.garden"],
  ])("fails closed for a %s", async (_label, stagingBaseUrl) => {
    vi.stubEnv("EPHEMERAL_MEDIA_STAGING_BASE_URL", stagingBaseUrl);

    const response = await POST(requestFor(VALID_BODY));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "staging_reservation_unavailable",
    });
  });

  it("pins the exact staging origin in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv(
      "EPHEMERAL_MEDIA_STAGING_BASE_URL",
      "https://media-stage.example.com",
    );

    const response = await POST(requestFor(VALID_BODY));

    expect(response.status).toBe(503);
  });

  it("rejects a chunked body above 4 KiB before capability issuance", async () => {
    const oversizedWhitespace = " ".repeat(4_097);
    const response = await POST(
      new Request("http://localhost/api/media/staging/reservations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-overgarden-document-generation": "generation",
        },
        body: `${JSON.stringify(VALID_BODY)}${oversizedWhitespace}`,
      }),
    );

    expect(response.status).toBe(400);
    expect(capability.issueEphemeralStagingCapability).not.toHaveBeenCalled();
  });

  it.each([
    ["non-WebP-sized body", { ...VALID_BODY, sizeBytes: 32 * 1024 * 1024 + 1 }],
    ["zero generation", { ...VALID_BODY, generation: 0 }],
    ["invalid digest", { ...VALID_BODY, sha256: "not-a-sha" }],
    ["oversized dimensions", { ...VALID_BODY, width: 20_000 }],
    ["unknown field", { ...VALID_BODY, journalText: "must not cross" }],
  ])("rejects %s before issuing a capability", async (_label, body) => {
    const response = await POST(requestFor(body));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "staging_reservation_invalid",
    });
    expect(capability.issueEphemeralStagingCapability).not.toHaveBeenCalled();
  });
});

function requestFor(body: unknown) {
  return new Request("http://localhost/api/media/staging/reservations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-overgarden-document-generation": "generation",
    },
    body: JSON.stringify(body),
  });
}
