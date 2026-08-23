import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  verifyCommitStatusRequest: vi.fn(),
  readEphemeralMediaCommitStatus: vi.fn(),
}));

vi.mock("@/server/media/ephemeral-staging-commit-status", () => boundary);

import { POST } from "./route";

describe("POST /api/media/staging/commit-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.verifyCommitStatusRequest.mockResolvedValue({
      publishId: "00000000-0000-4000-8000-000000000010",
      ownerSubjectHash: "A".repeat(43),
      stagingSessionId: "00000000-0000-4000-8000-000000000002",
    });
    boundary.readEphemeralMediaCommitStatus.mockResolvedValue("committed");
  });

  it("returns only the closed commit class after signed verification", async () => {
    const request = new Request(
      "http://localhost/api/media/staging/commit-status",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-overgarden-staging-signature": "opaque",
        },
        body: JSON.stringify({ opaque: true }),
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "committed" });
    expect(boundary.verifyCommitStatusRequest).toHaveBeenCalledWith(request);
    expect(boundary.readEphemeralMediaCommitStatus).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    ["invalid", 401, "commit_status_unauthorized"],
    ["expired", 401, "commit_status_unauthorized"],
    ["unavailable", 503, "commit_status_unavailable"],
  ])("fails closed for %s verification", async (code, status, responseCode) => {
    boundary.verifyCommitStatusRequest.mockRejectedValueOnce(
      Object.assign(new Error(code), { code }),
    );
    const response = await POST(
      new Request("http://localhost/api/media/staging/commit-status", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ code: responseCode });
    expect(boundary.readEphemeralMediaCommitStatus).not.toHaveBeenCalled();
  });
});
