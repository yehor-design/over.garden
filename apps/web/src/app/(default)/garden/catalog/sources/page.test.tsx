import { renderServerHtml } from "@test/render-server-html";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
  resolveWorkspaceViewer: vi.fn(),
  resolveWorkspaceAdminAccess: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
  hasAdminCapability: vi.fn(() => true),
  listCatalogSourceCards: vi.fn(),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
  resolveWorkspaceAdminAccess: mocks.resolveWorkspaceAdminAccess,
}));
vi.mock("@/server/admin-access", () => ({
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
  hasAdminCapability: mocks.hasAdminCapability,
}));
vi.mock("@/server/catalog-curation-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/catalog-curation-repository")>()),
  listCatalogSourceCards: mocks.listCatalogSourceCards,
}));
vi.mock("./actions", () => ({ refreshCatalogSourceAction: vi.fn() }));

const EPPO = {
  sourceSlug: "eppo",
  sourceName: "EPPO Global Database",
  sourceVersion: "2026-09",
  sourceUrl: "https://gd.eppo.int/",
  license: "EPPO terms",
  licenseUrl: null,
  attributionText: "Source: EPPO Global Database",
  fetchedAt: new Date("2026-09-01T00:00:00.000Z"),
  status: "imported",
  recordCount: 1200,
  linkedCount: 900,
  identifierCount: 850,
  assertionCount: 1000,
  lastRefreshQueuedAt: null,
  lastRefreshStatus: null,
};

async function render() {
  const { default: Page } = await import("./page");
  return renderServerHtml(await Page());
}

describe("owner catalog sources (ADR-0026 D10)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "ready",
      scope: { userId: "owner-1" },
    });
    mocks.resolveWorkspaceAdminAccess.mockResolvedValue({
      status: "allowed",
      access: { role: "owner", mode: "sealed", capabilities: [] },
    });
    mocks.hasAdminCapability.mockReturnValue(true);
    mocks.listCatalogSourceCards.mockResolvedValue([EPPO]);
  });

  it("shows one card per source with its version, licence, counts and a refresh button", async () => {
    const html = await render();

    expect(html).toContain('data-operator-surface="catalog-sources"');
    expect(html).toContain('data-catalog-source="eppo"');
    expect(html).toContain("EPPO Global Database");
    expect(html).toContain("2026-09");
    expect(html).toContain("EPPO terms");
    expect(html).toContain("1200");
    expect(html).toContain("900");
    expect(html).toContain("Source: EPPO Global Database");
    expect(html).toContain('data-catalog-source-refresh="eppo"');
    expect(html).toContain('href="https://gd.eppo.int/"');
  });

  it("says a refresh is queued while its job is pending", async () => {
    mocks.listCatalogSourceCards.mockResolvedValue([
      {
        ...EPPO,
        lastRefreshQueuedAt: new Date("2026-09-06T09:00:00.000Z"),
        lastRefreshStatus: "pending",
      },
    ]);

    const html = await render();

    expect(html).toContain('data-catalog-source-refresh-status="pending"');
    expect(html).toContain("Оновлення в черзі");
  });

  it("hides the refresh button from a reader who cannot mutate", async () => {
    mocks.hasAdminCapability.mockReturnValue(false);
    const html = await render();
    expect(html).toContain('data-catalog-source="eppo"');
    expect(html).not.toContain("data-catalog-source-refresh=");
  });

  it("says nothing is loaded rather than showing an empty list", async () => {
    mocks.listCatalogSourceCards.mockResolvedValue([]);
    const html = await render();
    expect(html).toContain('data-catalog-sources-empty="true"');
  });

  it("refuses anyone who is not the owner", async () => {
    mocks.resolveWorkspaceAdminAccess.mockResolvedValue({ status: "denied" });
    const html = await render();
    expect(html).toContain('data-operator-access-state="denied"');
    expect(html).not.toContain("data-catalog-source=");
  });

  it("renders a bounded failure with a retry when the read cannot settle", async () => {
    mocks.listCatalogSourceCards.mockRejectedValue(new Error("database away"));
    const html = await render();
    expect(html).toContain('data-operator-access-state="allowed"');
    expect(html).toContain("/garden/catalog/sources");
    expect(html).not.toContain("data-catalog-source=");
  });
});
