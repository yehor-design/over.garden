import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthSecretHealth: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  pingDatabase: vi.fn(),
  readRecentHealth: vi.fn(),
  getCurrentSession: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: () => "session-1",
}));
vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccessBounded:
    mocks.resolveAdminCapabilityAccessBounded,
}));

vi.mock("@/lib/auth-secret", () => ({
  getAuthSecretHealth: mocks.getAuthSecretHealth,
}));

vi.mock("@/server/health-repository", () => ({
  pingDatabase: mocks.pingDatabase,
  readRecentHealth: mocks.readRecentHealth,
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

describe("/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");
    mocks.getAuthSecretHealth.mockReturnValue({
      class: "versioned_current",
      activeVersion: 2,
    });
    mocks.pingDatabase.mockResolvedValue(true);
    mocks.readRecentHealth.mockResolvedValue([
      { id: "00000000-0000-4000-8000-000000000001" },
    ]);
    mocks.getCurrentSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "allowed",
    });
  });

  it("is not found for guests and for signed-in non-owners (ADR-0022, D5)", async () => {
    const { default: HealthPage } = await import("./page");

    mocks.getCurrentSession.mockResolvedValueOnce(null);
    await expect(HealthPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.pingDatabase).not.toHaveBeenCalled();

    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValueOnce({
      status: "denied",
    });
    await expect(HealthPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.resolveAdminCapabilityAccessBounded).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "owner-1" }),
      "operator:mutate",
    );
  });

  it("renders the diagnostics for the sealed owner, noindex for crawlers", async () => {
    const { default: HealthPage, generateMetadata } = await import("./page");
    const html = renderToStaticMarkup(await HealthPage());

    expect((await generateMetadata()).robots).toMatchObject({
      index: false,
      follow: false,
    });
    expect(html).toContain("Публична noindex диагностика");
    expect(html).toContain("ръчни smoke проверки");
    expect(html).not.toMatch(
      /\b(journal text|media key|invite link|email|ip_address|user[_ -]?agent)\b/i,
    );
  });

  it("does not echo raw database exception details", async () => {
    mocks.pingDatabase.mockRejectedValue(
      new Error("postgres://secret-user:secret-pass@example.internal/db"),
    );

    const { default: HealthPage } = await import("./page");
    const html = renderToStaticMarkup(await HealthPage());

    expect(html).toContain(
      "Диагностиката е показана в ограничен режим; наличните проверки продължават без отговор от базата данни",
    );
    expect(html).toContain('data-operator-db-serve-class="seam_unmet"');
    expect(html).not.toContain("secret-user");
    expect(html).not.toContain("secret-pass");
    expect(html).not.toContain("example.internal");
  });

  it("renders only the declared version class when auth is ready", async () => {
    const { default: HealthPage } = await import("./page");
    const html = renderToStaticMarkup(await HealthPage());

    expect(html).toContain("versioned_current_v2");
    expect(html).not.toMatch(/BETTER_AUTH_SECRETS|[A-Za-z0-9_-]{43}/);
  });
});
