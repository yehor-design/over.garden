import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtensionPackCenterReadModel } from "@/lib/stable-registry/extension-pack-actions";

const mocks = vi.hoisted(() => ({
  assertCatalogCuratorAccess: vi.fn(),
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  isStableRegistryExtensionPacksEnabled: vi.fn(),
  readExtensionPackCenter: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "extension-session"),
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
  isStableRegistryExtensionPacksEnabled:
    mocks.isStableRegistryExtensionPacksEnabled,
}));
vi.mock("@/server/stable-registry/extension-pack-repository", () => ({
  readExtensionPackCenter: mocks.readExtensionPackCenter,
}));
vi.mock("../extension-actions", () => ({
  decideExtensionPackGroupAction: vi.fn(),
  approveExtensionPackPreviewAction: vi.fn(),
  activateExtensionPackAction: vi.fn(),
  abandonExtensionPackAction: vi.fn(),
}));

function model(
  overrides: Partial<ExtensionPackCenterReadModel> = {},
): ExtensionPackCenterReadModel {
  const pack = {
    id: "00000000-0000-4000-8000-000000328001",
    sourceSlug: "ua-state-register",
    declaredSourceVersion: "2026-06-30",
    packKind: "plant_variety" as const,
    sourceRights: "use" as const,
    state: "classified" as const,
    artifactDigest: "a".repeat(64),
    previewDigest: null,
    releaseId: null,
    version: 1,
    createdAt: "2026-08-28T00:00:00.000Z",
    approvedAt: null,
    activatedAt: null,
    rowCount: 12,
    cleanRowCount: 9,
    productEligibleRowCount: 0,
    exceptionRowCount: 3,
  };
  return {
    packs: [pack],
    selectedPack: pack,
    exceptionGroups: [
      {
        rowClass: "needs_parent",
        rowCount: 3,
        parentBoundCount: 0,
        expectedVersion: 1,
      },
    ],
    userNameGroups: [],
    writesEnabled: true,
    ...overrides,
  };
}

describe("Stable Registry extension pack page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getCurrentSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.assertCatalogCuratorAccess.mockResolvedValue(undefined);
    mocks.isStableRegistryExtensionPacksEnabled.mockReturnValue(true);
    mocks.readExtensionPackCenter.mockResolvedValue(model());
  });

  it("requires a signed-in owner before reading any pack", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-extension-pack-state="sign-in-required"');
    expect(mocks.readExtensionPackCenter).not.toHaveBeenCalled();
  });

  it("denies an ordinary user without exposing pack evidence", async () => {
    mocks.assertCatalogCuratorAccess.mockRejectedValue(new Error("denied"));
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-extension-pack-state="denied"');
    expect(html).not.toContain("ua-state-register");
    expect(mocks.readExtensionPackCenter).not.toHaveBeenCalled();
  });

  it("stays dark and reads nothing while the flag is off", async () => {
    mocks.isStableRegistryExtensionPacksEnabled.mockReturnValue(false);
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-extension-pack-state="disabled"');
    expect(mocks.readExtensionPackCenter).not.toHaveBeenCalled();
  });

  it("renders grouped exceptions and aggregate counts, never a denomination", async () => {
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-row-class="needs_parent"');
    expect(html).toContain('data-exception-row-count="3"');
    // The owner sees counts, not thousands of individual rows.
    expect(html).toContain("Потрібен батьківський вид");
    expect(html).not.toMatch(/Ботсадівський|Sadovo/u);
  });

  it("keeps the cancel and return controls available during review", async () => {
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Скасувати імпорт пакета");
    expect(html).toContain("Повернутися до активного каталогу");
  });

  it("localizes the lane for every shared locale", async () => {
    for (const [locale, title] of [
      ["uk", "Stable Registry — пакети розширень"],
      ["bg", "Stable Registry — пакети разширения"],
      ["ru", "Stable Registry — пакеты расширений"],
    ] as const) {
      vi.resetModules();
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
      const { default: Page } = await import("./page");
      const html = renderToStaticMarkup(await Page());
      expect(html).toContain(title);
    }
  });
});
