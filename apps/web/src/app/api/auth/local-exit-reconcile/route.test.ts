import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CURRENT_SESSION_BINDING_HEADER,
  SIGN_OUT_ADAPTER_FAILURE_CODE,
  SIGN_OUT_BINDING_FAILURE_CODE,
} from "@/lib/auth/sign-out-hardening";

const signOut = vi.hoisted(() => vi.fn());
const authHandler = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: { handler: authHandler, api: { signOut } },
}));

const BINDING_A = "A".repeat(43);

describe("local-exit reconciliation route", () => {
  beforeEach(() => {
    vi.resetModules();
    signOut.mockReset();
    authHandler.mockReset();
    warn.mockReset();
    vi.spyOn(console, "warn").mockImplementation(warn);
  });

  it("re-enters Better Auth through the canonical HTTP boundary for the exact-session delete", async () => {
    authHandler.mockResolvedValue(
      betterAuthResponse(200, { success: true }, expiredSessionCookie()),
    );
    const { POST } = await import("./route");

    const response = await POST(reconcileRequest());

    expect(response.status).toBe(204);
    expect(authHandler).toHaveBeenCalledOnce();
    const canonicalRequest = authHandler.mock.calls[0]?.[0] as Request;
    expect(new URL(canonicalRequest.url).pathname).toBe("/api/auth/sign-out");
    expect(canonicalRequest.method).toBe("POST");
    expect(canonicalRequest.headers.get("content-type")).toBe(
      "application/json",
    );
    expect(await canonicalRequest.json()).toEqual({});
    expect(signOut).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[auth] local-exit reconciliation outcome: revoked_confirmed",
    );
  });

  it("returns a bodyless receipt with the library cookie expiry for the exact current session", async () => {
    authHandler.mockResolvedValue(
      betterAuthResponse(200, { success: true }, expiredSessionCookie()),
    );
    const { POST } = await import("./route");

    const response = await POST(reconcileRequest());

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("set-cookie")).toContain(
      "overgarden.session_token=",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(authHandler).toHaveBeenCalledOnce();
    const canonicalRequest = authHandler.mock.calls[0]?.[0] as Request;
    expect(canonicalRequest.headers.get("cookie")).toBe(
      "overgarden.session_token=signed-a",
    );
    expect(signOut).not.toHaveBeenCalled();
  });

  it("still emits the library expiry when exact-session adapter deletion fails", async () => {
    authHandler.mockResolvedValueOnce(
      betterAuthResponse(500, {
        code: SIGN_OUT_ADAPTER_FAILURE_CODE,
      }),
    );
    signOut.mockResolvedValueOnce(
      betterAuthResponse(200, { success: true }, expiredSessionCookie()),
    );
    const { POST } = await import("./route");

    const response = await POST(reconcileRequest());

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(authHandler).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledOnce();
    const expiryHeaders = signOut.mock.calls[0]?.[0].headers as Headers;
    expect(expiryHeaders.has("cookie")).toBe(false);
    expect(expiryHeaders.has(CURRENT_SESSION_BINDING_HEADER)).toBe(false);
  });

  it("gives a stale account-A binding zero account-B cookie or session effect", async () => {
    authHandler.mockResolvedValue(
      betterAuthResponse(409, {
        code: SIGN_OUT_BINDING_FAILURE_CODE,
      }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      reconcileRequest({ cookie: "overgarden.session_token=signed-b" }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(authHandler).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[auth] local-exit reconciliation outcome: stale_operation",
    );
  });

  it.each([
    reconcileRequest({ origin: "https://attacker.example" }),
    reconcileRequest({ fetchSite: "cross-site" }),
    reconcileRequest({ binding: "malformed" }),
    reconcileRequest({ body: "{}" }),
  ])(
    "returns the same empty response with zero auth effect for denied input",
    async (request) => {
      const { POST } = await import("./route");

      const response = await POST(request);

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(authHandler).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    },
  );
});

function reconcileRequest(
  overrides: {
    origin?: string;
    fetchSite?: string;
    binding?: string;
    cookie?: string;
    body?: string;
  } = {},
) {
  return new Request("https://over.garden/api/auth/local-exit-reconcile", {
    method: "POST",
    headers: {
      origin: overrides.origin ?? "https://over.garden",
      "sec-fetch-site": overrides.fetchSite ?? "same-origin",
      [CURRENT_SESSION_BINDING_HEADER]: overrides.binding ?? BINDING_A,
      cookie: overrides.cookie ?? "overgarden.session_token=signed-a",
      ...(overrides.body ? { "content-type": "application/json" } : {}),
    },
    body: overrides.body,
  });
}

function betterAuthResponse(
  status: number,
  body: Record<string, unknown>,
  setCookie?: string,
) {
  return Response.json(body, {
    status,
    headers: setCookie ? { "set-cookie": setCookie } : undefined,
  });
}

function expiredSessionCookie() {
  return "overgarden.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax";
}
