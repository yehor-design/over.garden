import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getAuthoritativeCurrentSession: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getAuthoritativeCurrentSession: mocks.getAuthoritativeCurrentSession,
  getSessionId: (session: { session?: { id?: unknown } } | null) =>
    typeof session?.session?.id === "string" ? session.session.id : null,
}));

import {
  mutationScopeResponse,
  ownerUserIdFromFormData,
  ownerUserIdFromRequest,
  resolveMutationScope,
} from "./mutation-scope";

const owner = {
  user: { id: "owner-a" },
  session: { id: "session-a" },
};

describe("mutation scope (ADR-0022, D6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue(owner);
    mocks.getAuthoritativeCurrentSession.mockResolvedValue(owner);
  });

  it("admits the cookie-cached session and derives the repository scope", async () => {
    await expect(resolveMutationScope()).resolves.toEqual({
      status: "admitted",
      scope: { userId: "owner-a", sessionId: "session-a" },
    });
    expect(mocks.getCurrentSession).toHaveBeenCalledTimes(1);
    expect(mocks.getAuthoritativeCurrentSession).not.toHaveBeenCalled();
  });

  it("admits when the rendered owner matches and refuses another account with 409", async () => {
    await expect(
      resolveMutationScope({ expectedOwnerUserId: "owner-a" }),
    ).resolves.toMatchObject({ status: "admitted" });
    await expect(
      resolveMutationScope({ expectedOwnerUserId: "owner-b" }),
    ).resolves.toEqual({
      status: "rejected",
      code: "session_account_changed",
      statusCode: 409,
    });
  });

  it("refuses a signed-out or failing session read with 401", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    await expect(resolveMutationScope()).resolves.toEqual({
      status: "rejected",
      code: "session_required",
      statusCode: 401,
    });
    mocks.getCurrentSession.mockRejectedValueOnce(new Error("auth down"));
    await expect(resolveMutationScope()).resolves.toMatchObject({
      status: "rejected",
      code: "session_required",
    });
  });

  it("bypasses the cookie cache only when asked", async () => {
    await resolveMutationScope({ authoritative: true });
    expect(mocks.getAuthoritativeCurrentSession).toHaveBeenCalledTimes(1);
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
  });

  it("reads the rendered owner from the header or the hidden field", () => {
    const request = new Request("https://over.garden/api/garden/entries", {
      headers: { "x-overgarden-owner-user-id": "  owner-a  " },
    });
    expect(ownerUserIdFromRequest(request)).toBe("owner-a");
    expect(ownerUserIdFromRequest(new Request("https://over.garden/"))).toBe(
      null,
    );
    const formData = new FormData();
    formData.set("ownerUserId", "owner-a");
    expect(ownerUserIdFromFormData(formData)).toBe("owner-a");
    expect(ownerUserIdFromFormData(new FormData())).toBe(null);
  });

  it("answers a refusal as private JSON with the code only", async () => {
    const response = mutationScopeResponse({
      status: "rejected",
      code: "session_account_changed",
      statusCode: 409,
    });
    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      code: "session_account_changed",
    });
  });
});
