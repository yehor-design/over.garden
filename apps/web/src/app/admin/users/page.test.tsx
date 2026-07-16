import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
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

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/admin-role-management-repository", () => ({
  readAdminRoleManagementView: mocks.readAdminRoleManagementView,
}));

vi.mock("../../garden/garden-auth-panel", () => ({
  GardenAuthPanel: () => "admin-users-auth-panel",
}));

describe("/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
    });
    mocks.resolveAdminCapabilityAccess.mockResolvedValue({
      status: "allowed",
      mode: "sealed_owner_credential_only",
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
      ],
      auditEntries: [
        {
          id: "00000000-0000-4000-8000-00000000a001",
          actorUserId: "00000000-0000-4000-8000-000000000001",
          targetUserId: "00000000-0000-4000-8000-000000000001",
          action: "grant",
          previousRole: null,
          newRole: "owner",
          reason: "manual_owner_grant",
          createdAt: new Date("2026-07-02T09:00:00.000Z"),
        },
      ],
    });
  });

  it("renders the sign-in boundary for signed-out visitors", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    const { default: AdminUsersPage } = await import("./page");
    const html = renderToStaticMarkup(await AdminUsersPage());

    expect(html).toContain("Захищений власник");
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

    expect(html).toContain("Доступ заборонено.");
    expect(html).not.toContain("Grant a role");
    expect(mocks.readAdminRoleManagementView).not.toHaveBeenCalled();
  });

  it("renders sealed owner status and a redacted audit trail", async () => {
    const { default: AdminUsersPage, generateMetadata } =
      await import("./page");
    const html = renderToStaticMarkup(await AdminUsersPage());

    expect((await generateMetadata()).title).toBe(
      "Захищений власник | OverGarden",
    );
    expect(html).toContain("Доступ захищеного власника");
    expect(html).toContain("Режим доступу: лише захищений власник з паролем");
    expect(html).toContain("одним налаштованим обліковим записом власника");
    expect(html).not.toContain("Grant a role");
    expect(html).not.toContain("Moderator");
    expect(html).toContain("Останній аудит ролей");
    expect(html).toContain("Надано Власник");
    expect(html).toContain("Ручне надання ролі власника");
    expect(html).toContain("Роль власника закріплено");
    expect(html).not.toContain("Revoke role");
    expect(html).toContain("користувач 00000000...0001");
    expect(html).not.toMatch(
      /[^\s@]+@[^\s@]+\.[^\s@]+|DATABASE_URL|auth-secret|provider-token|quarantine\/|derivatives\//i,
    );
    expect(mocks.readAdminRoleManagementView).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "owner-session",
    });
  });
});
