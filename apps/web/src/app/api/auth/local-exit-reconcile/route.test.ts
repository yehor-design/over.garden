import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";

import {
  CURRENT_SESSION_BINDING_HEADER,
  SIGN_OUT_ADAPTER_FAILURE_CODE,
  SIGN_OUT_BINDING_FAILURE_CODE,
} from "@/lib/auth/sign-out-hardening";

const signOut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: { api: { signOut } },
}));

const BINDING_A = "A".repeat(43);

describe("local-exit reconciliation route", () => {
  beforeEach(() => {
    vi.resetModules();
    signOut.mockReset();
  });

  it("returns a bodyless receipt with the library cookie expiry for the exact current session", async () => {
    signOut.mockResolvedValue(
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
    expect(signOut).toHaveBeenCalledOnce();
    expect(signOut.mock.calls[0]?.[0].headers.get("cookie")).toBe(
      "overgarden.session_token=signed-a",
    );
  });

  it("still emits the library expiry when exact-session adapter deletion fails", async () => {
    signOut
      .mockRejectedValueOnce(
        APIError.from("INTERNAL_SERVER_ERROR", {
          code: SIGN_OUT_ADAPTER_FAILURE_CODE,
          message: "Synthetic adapter failure",
        }),
      )
      .mockResolvedValueOnce(
        betterAuthResponse(200, { success: true }, expiredSessionCookie()),
      );
    const { POST } = await import("./route");

    const response = await POST(reconcileRequest());

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(signOut).toHaveBeenCalledTimes(2);
    const expiryHeaders = signOut.mock.calls[1]?.[0].headers as Headers;
    expect(expiryHeaders.has("cookie")).toBe(false);
    expect(expiryHeaders.has(CURRENT_SESSION_BINDING_HEADER)).toBe(false);
  });

  it("gives a stale account-A binding zero account-B cookie or session effect", async () => {
    signOut.mockRejectedValue(
      APIError.from("CONFLICT", {
        code: SIGN_OUT_BINDING_FAILURE_CODE,
        message: "Synthetic binding conflict",
      }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      reconcileRequest({ cookie: "overgarden.session_token=signed-b" }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(signOut).toHaveBeenCalledOnce();
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
