import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentRequestScope: vi.fn(),
  grantAdminRole: vi.fn(),
  revokeAdminRole: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/server/auth-session", () => ({
  requireCurrentRequestScope: mocks.requireCurrentRequestScope,
}));

vi.mock("@/server/admin-role-management-repository", () => ({
  grantAdminRole: mocks.grantAdminRole,
  revokeAdminRole: mocks.revokeAdminRole,
}));

describe("admin user role actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentRequestScope.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "owner-session",
    });
    mocks.grantAdminRole.mockResolvedValue(undefined);
    mocks.revokeAdminRole.mockResolvedValue(undefined);
  });

  it("passes bounded grant input through the repository boundary", async () => {
    const { grantAdminRoleAction } = await import("./actions");
    const formData = new FormData();
    formData.set("targetUserId", "00000000-0000-4000-8000-000000000003");
    formData.set("role", "moderator");
    formData.set("reason", "pilot_operator_delegation");

    await grantAdminRoleAction(formData);

    expect(mocks.grantAdminRole).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "owner-session",
      },
      {
        targetUserId: "00000000-0000-4000-8000-000000000003",
        role: "moderator",
        reason: "pilot_operator_delegation",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("does not revalidate after a rejected non-owner grant", async () => {
    mocks.grantAdminRole.mockRejectedValue(new Error("Admin access denied."));

    const { grantAdminRoleAction } = await import("./actions");
    const formData = new FormData();
    formData.set("targetUserId", "00000000-0000-4000-8000-000000000003");
    formData.set("role", "moderator");
    formData.set("reason", "pilot_operator_delegation");

    await expect(grantAdminRoleAction(formData)).rejects.toThrow(
      "Admin access denied.",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("passes revoke input through the repository boundary", async () => {
    const { revokeAdminRoleAction } = await import("./actions");
    const formData = new FormData();
    formData.set("targetUserId", "00000000-0000-4000-8000-000000000003");
    formData.set("reason", "access_revoked");

    await revokeAdminRoleAction(formData);

    expect(mocks.revokeAdminRole).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "owner-session",
      },
      {
        targetUserId: "00000000-0000-4000-8000-000000000003",
        reason: "access_revoked",
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });
});
