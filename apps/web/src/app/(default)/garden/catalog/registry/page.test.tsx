import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCatalogCuratorAccess: vi.fn(),
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  isStableRegistryReleaseCenterEnabled: vi.fn(),
  readStableRegistryReleaseCenter: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "registry-session"),
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));
vi.mock("@/server/catalog-curator-auth", () => ({
  assertCatalogCuratorAccess: mocks.assertCatalogCuratorAccess,
}));
vi.mock("@/lib/stable-registry/feature-gate", () => ({
  isStableRegistryReleaseCenterEnabled:
    mocks.isStableRegistryReleaseCenterEnabled,
}));
vi.mock("@/server/stable-registry/release-repository", () => ({
  readStableRegistryReleaseCenter: mocks.readStableRegistryReleaseCenter,
}));
vi.mock("./release-center", () => ({
  StableRegistryReleaseCenter: ({
    model,
  }: {
    model: { completedCaptureCount: number };
  }) => (
    <div data-registry-center="safe">
      completed-captures:{model.completedCaptureCount}
    </div>
  ),
}));
vi.mock("./actions", () => ({
  abandonFoundationReleaseAction: vi.fn(),
  activateFoundationReleaseAction: vi.fn(),
  approveFoundationPreviewAction: vi.fn(),
  buildFoundationReleaseAction: vi.fn(),
  decideFoundationExceptionGroupAction: vi.fn(),
}));

describe("/garden/catalog/registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
    });
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.assertCatalogCuratorAccess.mockResolvedValue({ role: "owner" });
    mocks.isStableRegistryReleaseCenterEnabled.mockReturnValue(true);
    mocks.readStableRegistryReleaseCenter.mockResolvedValue({
      completedCaptureCount: 1,
      writesEnabled: true,
      latestRelease: null,
      exceptionGroups: [],
    });
  });

  it("returns a bounded sign-in state before reading release data", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    const { default: Page } = await import("./page");
    const html = renderToStaticMarkup(await Page());

    expect(html).toContain('data-release-center-state="sign-in-required"');
    expect(mocks.readStableRegistryReleaseCenter).not.toHaveBeenCalled();
  });

  it("returns a bounded denial before reading release data", async () => {
    mocks.assertCatalogCuratorAccess.mockRejectedValue(new Error("denied"));
    const { default: Page } = await import("./page");
    const html = renderToStaticMarkup(await Page());

    expect(html).toContain('data-release-center-state="denied"');
    expect(mocks.readStableRegistryReleaseCenter).not.toHaveBeenCalled();
  });

  it("keeps the Release Center dark without leaking release evidence", async () => {
    mocks.isStableRegistryReleaseCenterEnabled.mockReturnValue(false);
    const { default: Page } = await import("./page");
    const html = renderToStaticMarkup(await Page());

    expect(html).toContain('data-release-center-state="disabled"');
    expect(html).not.toContain("completed-captures");
    expect(mocks.readStableRegistryReleaseCenter).not.toHaveBeenCalled();
  });

  it.each(["uk", "bg", "ru"] as const)(
    "renders a localized safe aggregate center for %s",
    async (locale) => {
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
      const { default: Page } = await import("./page");
      const html = renderToStaticMarkup(await Page());

      expect(html).toContain('data-registry-center="safe"');
      expect(html).toContain("completed-captures:1");
      expect(html).not.toMatch(
        /raw_payload|source_only_fields|latitude|longitude/i,
      );
      expect(mocks.readStableRegistryReleaseCenter).toHaveBeenCalledWith({
        writesEnabled: true,
      });
    },
  );
});
