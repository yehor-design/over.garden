import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasUsableBetterAuthSecret: vi.fn(),
  isProductionLikeRuntime: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  pingDatabase: vi.fn(),
  readRecentHealth: vi.fn(),
}));

vi.mock("@/lib/auth-secret", () => ({
  hasUsableBetterAuthSecret: mocks.hasUsableBetterAuthSecret,
  isProductionLikeRuntime: mocks.isProductionLikeRuntime,
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
    mocks.hasUsableBetterAuthSecret.mockReturnValue(true);
    mocks.isProductionLikeRuntime.mockReturnValue(false);
    mocks.pingDatabase.mockResolvedValue(true);
    mocks.readRecentHealth.mockResolvedValue([
      { id: "00000000-0000-4000-8000-000000000001" },
    ]);
  });

  it("stays public for smoke checks but noindex for crawlers", async () => {
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
      "Проверката на базата данни не е налична в тази среда",
    );
    expect(html).not.toContain("secret-user");
    expect(html).not.toContain("secret-pass");
    expect(html).not.toContain("example.internal");
  });
});
