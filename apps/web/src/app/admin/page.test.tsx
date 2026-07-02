import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  resolveAdminAccess: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "admin-session"),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/admin-access", () => ({
  resolveAdminAccess: mocks.resolveAdminAccess,
}));

vi.mock("../garden/garden-auth-panel", () => ({
  GardenAuthPanel: () => "admin-auth-panel",
}));

describe("/admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000999" },
    });
    mocks.resolveAdminAccess.mockResolvedValue({
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
  });

  it("renders the sign-in boundary for signed-out visitors", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    mocks.resolveAdminAccess.mockResolvedValue({ status: "sign_in_required" });

    const { default: AdminPage } = await import("./page");
    const html = renderToStaticMarkup(await AdminPage());

    expect(html).toContain("Admin");
    expect(html).toContain("admin-auth-panel");
    expect(html).not.toContain("Continue with Google");
    expect(html).not.toContain("Continue with Facebook");
    expect(html).not.toContain("Pilot smoke");
  });

  it("denies signed-in users before rendering admin links", async () => {
    mocks.resolveAdminAccess.mockResolvedValue({ status: "denied" });

    const { default: AdminPage } = await import("./page");
    const html = renderToStaticMarkup(await AdminPage());

    expect(html).toContain("Access denied.");
    expect(html).not.toContain("Pilot smoke");
    expect(html).not.toContain("Catalog curation");
  });

  it("renders a redacted owner dashboard", async () => {
    const { default: AdminPage, metadata } = await import("./page");
    const html = renderToStaticMarkup(await AdminPage());

    expect(metadata.title).toBe("Admin | OverGarden");
    expect(html).toContain("Role: Owner");
    expect(html).toContain("Gate: sealed_owner_credential_only");
    expect(html).toContain("Sealed owner");
    expect(html).toContain("Read-only: configured owner only");
    expect(html).toContain("Pilot smoke");
    expect(html).toContain("Catalog curation");
    expect(html).toContain("Erasure requests");
    expect(html).toContain("Owner only");
    expect(html).toContain("sealed owner readback");
    expect(html).not.toContain("00000000-0000-4000-8000-000000000999");
    expect(html).not.toMatch(/email|cookie|token|ip address|user agent/i);
  });
});
