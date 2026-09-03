import { beforeEach, describe, expect, it, vi } from "vitest";

const admission = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
}));
const capability = vi.hoisted(() => ({
  issueEphemeralStagingSessionToken: vi.fn(),
}));

vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: admission.resolveMutationScope,
  ownerUserIdFromRequest: (request: Request) =>
    request.headers.get("x-overgarden-document-generation"),
  mutationScopeResponse: (result: { statusCode: number; code: string }) =>
    Response.json({ code: result.code }, { status: result.statusCode }),
}));
vi.mock("@/server/media/ephemeral-staging-capability", () => ({
  issueEphemeralStagingSessionToken:
    capability.issueEphemeralStagingSessionToken,
}));

import { POST } from "./route";

const SESSION = "00000000-0000-4000-8000-000000000002";
const OWNER = "00000000-0000-4000-8000-000000000001";
const TOKEN =
  "eyJhbGciOiJIUzI1NiIsImtpZCI6IjEifQ.eyJraW5kIjoic3RhZ2luZ19zZXNzaW9uIn0.c2lnbmF0dXJlLXZhbHVl";
const NOW = 1_777_000_000;

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://over.garden/api/media/staging/sessions", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/media/staging/sessions (OVE-372)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admission.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope: { userId: OWNER, sessionId: "session" },
    });
    capability.issueEphemeralStagingSessionToken.mockResolvedValue({
      capability: TOKEN,
      issuedAtSeconds: NOW,
      expiresAtSeconds: NOW + 900,
    });
  });

  it("issues one session capability for the owner's session id as private no-store JSON", async () => {
    const response = await POST(request({ stagingSessionId: SESSION }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      stagingSessionId: SESSION,
      sessionCapability: TOKEN,
      expiresAt: NOW + 900,
    });
    expect(capability.issueEphemeralStagingSessionToken).toHaveBeenCalledWith({
      ownerUserId: OWNER,
      stagingSessionId: SESSION,
    });
  });

  it("authenticates before reading the body and refuses anything but a session id", async () => {
    admission.resolveMutationScope.mockResolvedValueOnce({
      status: "rejected",
      statusCode: 401,
      code: "session_required",
    });
    const unauthenticated = await POST(request({ stagingSessionId: SESSION }));
    expect(unauthenticated.status).toBe(401);
    expect(capability.issueEphemeralStagingSessionToken).not.toHaveBeenCalled();

    for (const body of [
      { stagingSessionId: "not-a-session" },
      { stagingSessionId: SESSION, extra: true },
      {},
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        code: "staging_session_invalid",
      });
    }
  });

  it("answers 503 without leaking when signing is unavailable", async () => {
    capability.issueEphemeralStagingSessionToken.mockRejectedValueOnce(
      new Error("ephemeral_media_signing_unavailable"),
    );
    const response = await POST(request({ stagingSessionId: SESSION }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "staging_session_unavailable",
    });
  });
});
