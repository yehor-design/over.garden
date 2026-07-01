import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasUsableBetterAuthSecret: vi.fn(),
  isProductionLikeRuntime: vi.fn(),
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

describe("/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasUsableBetterAuthSecret.mockReturnValue(true);
    mocks.isProductionLikeRuntime.mockReturnValue(false);
    mocks.pingDatabase.mockResolvedValue(true);
    mocks.readRecentHealth.mockResolvedValue([
      { id: "00000000-0000-4000-8000-000000000001" },
    ]);
  });

  it("stays public for smoke checks but noindex for crawlers", async () => {
    const { default: HealthPage, metadata } = await import("./page");
    const html = renderToStaticMarkup(await HealthPage());

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(html).toContain("Public noindex diagnostic");
    expect(html).toContain("manual smoke checks");
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

    expect(html).toContain("Database check unavailable in this environment");
    expect(html).not.toContain("secret-user");
    expect(html).not.toContain("secret-pass");
    expect(html).not.toContain("example.internal");
  });
});
