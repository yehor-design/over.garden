import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
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

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("../garden/garden-auth-panel", () => ({
  GardenAuthPanel: () => "admin-auth-panel",
}));

describe("/admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
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

    expect(html).toContain('data-operator-surface="admin"');
    expect(html).toContain('data-operator-access-state="sign-in-required"');
    expect(html).toContain("Адміністрування");
    expect(html).toContain("admin-auth-panel");
    expect(html).not.toContain("Continue with Google");
    expect(html).not.toContain("Continue with Facebook");
    expect(html).not.toContain("Перевірка пілоту");
  });

  it("denies signed-in users before rendering admin links", async () => {
    mocks.resolveAdminAccess.mockResolvedValue({ status: "denied" });

    const { default: AdminPage } = await import("./page");
    const html = renderToStaticMarkup(await AdminPage());

    expect(html).toContain('data-operator-surface="admin"');
    expect(html).toContain('data-operator-access-state="denied"');
    expect(html).toContain("Доступ заборонено.");
    expect(html).not.toContain("Перевірка пілоту");
    expect(html).not.toContain("Курація каталогу");
  });

  it("renders a redacted owner dashboard", async () => {
    const { default: AdminPage, generateMetadata } = await import("./page");
    const html = renderToStaticMarkup(await AdminPage());

    expect(html).toContain('data-operator-surface="admin"');
    expect(html).toContain('data-operator-access-state="allowed"');
    expect((await generateMetadata()).title).toBe(
      "Адміністрування | OverGarden",
    );
    expect(html).toContain("Роль: Власник");
    expect(html).toContain("Режим доступу: лише захищений власник з паролем");
    expect(html).toContain("Захищений власник");
    expect(html).toContain("Лише читання: тільки налаштований власник");
    expect(html).toContain("Перевірка пілоту");
    expect(html).toContain("Курація каталогу");
    expect(html).toContain("Запити на видалення");
    expect(html).toContain("Лише власник");
    expect(html).toContain("перегляд захищеного власника");
    expect(html).not.toContain("00000000-0000-4000-8000-000000000999");
    expect(html).not.toMatch(/email|cookie|token|ip address|user agent/i);
  });

  it.each([
    ["uk", "Панель керування"],
    ["bg", "Контролен панел"],
    ["ru", "Панель управления"],
  ] as const)("renders selected %s operator copy", async (locale, marker) => {
    mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
    const { default: AdminPage } = await import("./page");
    expect(renderToStaticMarkup(await AdminPage())).toContain(marker);
  });
});
