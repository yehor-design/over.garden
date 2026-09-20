import { beforeEach, describe, expect, it, vi } from "vitest";

import { postgresRejection } from "@test/postgres-rejection";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  cookieHeader: vi.fn(),
  readSessionStore: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
}));

// The request's `cookie` header, not the mutable cookie store: Better Auth
// clears a session cookie it cannot resolve, so by the time the probe asks,
// `cookies()` no longer knows the reader had one (`OVE-457`).
vi.mock("next/headers", () => ({
  headers: async () => ({ get: mocks.cookieHeader }),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "session-1"),
}));

// The probe reads the session store, not `select 1`: measured in a browser,
// `session` replaced by a view that raises and `select 1` answering fine is
// exactly the case that showed a signed-in gardener a sign-in panel
// (`OVE-457`).
vi.mock("@/db", () => ({ db: {} }));
vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return {
    ...actual,
    sql: Object.assign(() => ({ execute: mocks.readSessionStore }), actual.sql),
  };
});

import { AdminAccessDeniedError } from "@/server/admin-access";
import {
  resolveWorkspaceAdminAccess,
  resolveWorkspaceViewer,
} from "./workspace-access";

describe("resolveWorkspaceViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieHeader.mockReturnValue(null);
    mocks.readSessionStore.mockResolvedValue(true);
  });

  it("scopes a signed-in reader to their own session", async () => {
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
    });

    await expect(resolveWorkspaceViewer()).resolves.toEqual({
      status: "signed-in",
      userId: "00000000-0000-4000-8000-000000000001",
      scope: {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
    });
    expect(mocks.readSessionStore).not.toHaveBeenCalled();
  });

  it("asks a visitor with no session cookie to sign in, without a second read", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    await expect(resolveWorkspaceViewer()).resolves.toEqual({
      status: "sign-in-required",
    });
    expect(mocks.readSessionStore).not.toHaveBeenCalled();
  });

  it("says the store is unreachable when a session cookie resolved to nobody", async () => {
    // Measured behaviour, not a hypothesis: Better Auth answers `null` rather
    // than throwing when its own read fails, so a null session alone would tell
    // a signed-in gardener to sign in during a database outage.
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.cookieHeader.mockReturnValue(
      "overgarden_interface_locale=uk; overgarden.session_token=signed.token",
    );
    mocks.readSessionStore.mockRejectedValue(postgresRejection("ECONNREFUSED"));

    const viewer = await resolveWorkspaceViewer();

    expect(viewer).toMatchObject({
      status: "unavailable",
      failure: { failureClass: "connection_unavailable" },
    });
  });

  it("still asks a stale cookie to sign in while the store answers", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    // The `__Secure-` spelling is what a browser sends over HTTPS, and both
    // are checked so the answer does not depend on which environment serves.
    mocks.cookieHeader.mockReturnValue(
      "__Secure-overgarden.session_token=signed.token",
    );

    await expect(resolveWorkspaceViewer()).resolves.toEqual({
      status: "sign-in-required",
    });
    expect(mocks.readSessionStore).toHaveBeenCalledTimes(1);
  });

  it("reports the class when the session read itself rejects", async () => {
    mocks.getCurrentSession.mockRejectedValue(postgresRejection("57014"));

    await expect(resolveWorkspaceViewer()).resolves.toMatchObject({
      status: "unavailable",
      failure: { failureClass: "query_timeout" },
    });
  });
});

describe("resolveWorkspaceAdminAccess", () => {
  it("allows the owner", async () => {
    const access = {
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: [],
    };
    await expect(
      resolveWorkspaceAdminAccess(async () => access as never),
    ).resolves.toEqual({ status: "allowed", access });
  });

  it("denies a refusal and only a refusal", async () => {
    await expect(
      resolveWorkspaceAdminAccess(() =>
        Promise.reject(new AdminAccessDeniedError()),
      ),
    ).resolves.toEqual({ status: "denied" });
  });

  it("does not report an unreachable role table as a denial", async () => {
    await expect(
      resolveWorkspaceAdminAccess(() =>
        Promise.reject(postgresRejection("ECONNREFUSED")),
      ),
    ).resolves.toMatchObject({
      status: "unavailable",
      failure: { failureClass: "connection_unavailable" },
    });
  });
});
