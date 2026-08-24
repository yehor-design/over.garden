import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthoritativeCurrentSession: vi.fn(),
  issueDocumentMutationGeneration: vi.fn(),
  deriveCurrentSessionBinding: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getAuthoritativeCurrentSession: mocks.getAuthoritativeCurrentSession,
  getSessionId: (session: { session?: { id?: unknown } } | null) =>
    typeof session?.session?.id === "string" ? session.session.id : null,
}));

vi.mock("@/lib/auth/document-mutation-generation-contract", () => ({
  issueDocumentMutationGeneration: mocks.issueDocumentMutationGeneration,
}));

vi.mock("@/lib/auth/sign-out-hardening", () => ({
  deriveServerCurrentSessionBinding: mocks.deriveCurrentSessionBinding,
}));

vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccessBounded:
    mocks.resolveAdminCapabilityAccessBounded,
}));

describe("site shell session boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.deriveCurrentSessionBinding.mockReturnValue(
      "opaque-current-session-binding",
    );
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "denied",
    });
  });

  it("serializes only authentication state and the opaque signed generation", async () => {
    mocks.getAuthoritativeCurrentSession.mockResolvedValue({
      user: {
        id: "private-user-id",
        email: "private@example.com",
        name: "Private gardener",
      },
      session: {
        id: "private-session-id",
      },
    });
    mocks.issueDocumentMutationGeneration.mockReturnValue({
      transport: "opaque-signed-document-generation",
    });
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: true,
      documentMutationGeneration: "opaque-signed-document-generation",
      currentSessionBinding: "opaque-current-session-binding",
      hasOperatorAccess: false,
    });
    expect(mocks.issueDocumentMutationGeneration).toHaveBeenCalledWith({
      ownerUserId: "private-user-id",
      sessionId: "private-session-id",
      issuedAtSeconds: expect.any(Number),
    });
    expect(JSON.stringify(await getSiteShellSessionState())).not.toContain(
      "private-user-id",
    );
    expect(JSON.stringify(await getSiteShellSessionState())).not.toContain(
      "private-session-id",
    );
  });

  it("returns the same bounded shape for a guest", async () => {
    mocks.getAuthoritativeCurrentSession.mockResolvedValue(null);
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: false,
      documentMutationGeneration: null,
      currentSessionBinding: null,
      hasOperatorAccess: false,
    });
  });

  it("degrades to guest navigation when session resolution is unavailable", async () => {
    mocks.getAuthoritativeCurrentSession.mockRejectedValue(
      new Error("auth unavailable"),
    );
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: false,
      documentMutationGeneration: null,
      currentSessionBinding: null,
      hasOperatorAccess: false,
    });
  });

  it("keeps authentication truth but closes mutation transport when signing is unavailable", async () => {
    mocks.getAuthoritativeCurrentSession.mockResolvedValue({
      user: { id: "private-user-id" },
      session: { id: "private-session-id" },
    });
    mocks.issueDocumentMutationGeneration.mockImplementation(() => {
      throw new Error("secret unavailable");
    });
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: true,
      documentMutationGeneration: null,
      currentSessionBinding: "opaque-current-session-binding",
      hasOperatorAccess: false,
    });
  });

  it("omits the client adapter when the exact rollback flag is disabled", async () => {
    vi.stubEnv("DOCUMENT_MUTATION_ADMISSION_ENABLED", "false");
    mocks.getAuthoritativeCurrentSession.mockResolvedValue({
      user: { id: "private-user-id" },
      session: { id: "private-session-id" },
    });
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: true,
      documentMutationGeneration: null,
      currentSessionBinding: "opaque-current-session-binding",
      hasOperatorAccess: false,
    });
    expect(mocks.issueDocumentMutationGeneration).not.toHaveBeenCalled();
  });

  it("projects only one sealed-owner capability bit into the shell", async () => {
    mocks.getAuthoritativeCurrentSession.mockResolvedValue({
      user: { id: "private-owner-id" },
      session: { id: "private-session-id" },
    });
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "allowed",
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: ["admin:read", "operator:read", "operator:mutate"],
    });
    mocks.issueDocumentMutationGeneration.mockReturnValue({
      transport: "opaque-signed-document-generation",
    });
    const { getSiteShellSessionState } = await import("./site-shell-session");

    const result = await getSiteShellSessionState();

    expect(result).toEqual({
      isAuthenticated: true,
      documentMutationGeneration: "opaque-signed-document-generation",
      currentSessionBinding: "opaque-current-session-binding",
      hasOperatorAccess: true,
    });
    expect(mocks.resolveAdminCapabilityAccessBounded).toHaveBeenCalledWith(
      {
        userId: "private-owner-id",
        sessionId: "private-session-id",
      },
      "operator:mutate",
    );
    expect(JSON.stringify(result)).not.toMatch(
      /private-owner-id|private-session-id|sealed_owner|operator:mutate/,
    );
  });

  it("fails closed to the ordinary authenticated menu when owner lookup fails", async () => {
    mocks.getAuthoritativeCurrentSession.mockResolvedValue({
      user: { id: "private-user-id" },
      session: { id: "private-session-id" },
    });
    mocks.resolveAdminCapabilityAccessBounded.mockRejectedValue(
      new Error("database unavailable"),
    );
    mocks.issueDocumentMutationGeneration.mockReturnValue({
      transport: "opaque-signed-document-generation",
    });
    const { getSiteShellSessionState } = await import("./site-shell-session");

    await expect(getSiteShellSessionState()).resolves.toEqual({
      isAuthenticated: true,
      documentMutationGeneration: "opaque-signed-document-generation",
      currentSessionBinding: "opaque-current-session-binding",
      hasOperatorAccess: false,
    });
  });

  it("cannot import owner-scoped product loaders", () => {
    const sourcePath = fileURLToPath(
      new URL("./site-shell-session.ts", import.meta.url),
    );
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toMatch(
      /journal-repository|public-profile-repository|request-scope|media|lineage|notification|analytics/i,
    );
  });
});
