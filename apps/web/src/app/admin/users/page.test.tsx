import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  resolveAdminCapabilityAccess: vi.fn(),
  readAdminRoleManagementView: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "owner-session"),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccess: mocks.resolveAdminCapabilityAccess,
}));

vi.mock("@/server/admin-role-management-repository", () => ({
  readAdminRoleManagementView: mocks.readAdminRoleManagementView,
}));

vi.mock("../../garden/garden-auth-panel", () => ({
  GardenAuthPanel: () => "admin-users-auth-panel",
}));

vi.mock("./actions", () => ({
  grantAdminRoleAction: vi.fn(),
  revokeAdminRoleAction: vi.fn(),
}));

describe("/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
    });
    mocks.resolveAdminCapabilityAccess.mockResolvedValue({
      status: "allowed",
      mode: "database_role_credential_only",
      role: "owner",
      capabilities: [
        "admin:read",
        "admin:manage_roles",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ],
    });
    mocks.readAdminRoleManagementView.mockResolvedValue({
      assignments: [
        {
          userId: "00000000-0000-4000-8000-000000000001",
          role: "owner",
          grantedByUserId: null,
          grantReason: "manual_bootstrap",
          grantedAt: new Date("2026-07-02T08:00:00.000Z"),
          updatedAt: new Date("2026-07-02T08:00:00.000Z"),
        },
        {
          userId: "00000000-0000-4000-8000-000000000003",
          role: "moderator",
          grantedByUserId: "00000000-0000-4000-8000-000000000001",
          grantReason: "pilot_operator_delegation",
          grantedAt: new Date("2026-07-02T09:00:00.000Z"),
          updatedAt: new Date("2026-07-02T09:00:00.000Z"),
        },
      ],
      auditEntries: [
        {
          id: "00000000-0000-4000-8000-00000000a001",
          actorUserId: "00000000-0000-4000-8000-000000000001",
          targetUserId: "00000000-0000-4000-8000-000000000003",
          action: "grant",
          previousRole: null,
          newRole: "moderator",
          reason: "pilot_operator_delegation",
          createdAt: new Date("2026-07-02T09:00:00.000Z"),
        },
      ],
    });
  });

  it("renders the sign-in boundary for signed-out visitors", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    const { default: AdminUsersPage } = await import("./page");
    const html = renderToStaticMarkup(await AdminUsersPage());

    expect(html).toContain("Admin users");
    expect(html).toContain("admin-users-auth-panel");
    expect(html).not.toContain("Continue with Google");
    expect(html).not.toContain("Continue with Facebook");
    expect(mocks.resolveAdminCapabilityAccess).not.toHaveBeenCalled();
    expect(mocks.readAdminRoleManagementView).not.toHaveBeenCalled();
  });

  it("denies non-owner admin roles before reading assignments", async () => {
    mocks.resolveAdminCapabilityAccess.mockResolvedValue({ status: "denied" });

    const { default: AdminUsersPage } = await import("./page");
    const html = renderToStaticMarkup(await AdminUsersPage());

    expect(html).toContain("Access denied.");
    expect(html).not.toContain("Grant a role");
    expect(mocks.readAdminRoleManagementView).not.toHaveBeenCalled();
  });

  it("renders owner role management and a redacted audit trail", async () => {
    const { default: AdminUsersPage, metadata } = await import("./page");
    const html = renderToStaticMarkup(await AdminUsersPage());

    expect(metadata.title).toBe("Admin users | OverGarden");
    expect(html).toContain("Role management");
    expect(html).toContain("Gate: database_role_credential_only");
    expect(html).toContain("email and password only");
    expect(html).toContain("Grant a role");
    expect(html).toContain("Moderator");
    expect(html).toContain("Recent role audit");
    expect(html).toContain("Granted Moderator");
    expect(html).toContain("Pilot operator delegation");
    expect(html).toContain("Owner role is protected");
    expect(html).toContain("Revoke role");
    expect(html).toContain("user 00000000...0003");
    expect(html).not.toMatch(
      /[^\s@]+@[^\s@]+\.[^\s@]+|DATABASE_URL|auth-secret|provider-token|quarantine\/|derivatives\//i,
    );
    expect(mocks.readAdminRoleManagementView).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "owner-session",
    });
  });
});
