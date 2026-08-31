import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EditionCenterReadModel } from "@/lib/stable-registry/edition-actions";

const mocks = vi.hoisted(() => ({
  assertCatalogCuratorAccess: vi.fn(),
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  isStableRegistryEditionsEnabled: vi.fn(),
  readEditionCenter: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "edition-session"),
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
  isStableRegistryEditionsEnabled: mocks.isStableRegistryEditionsEnabled,
}));
vi.mock("@/server/stable-registry/edition-repository", () => ({
  readEditionCenter: mocks.readEditionCenter,
}));
vi.mock("../edition-actions", () => ({
  prepareEditionAction: vi.fn(),
  decideEditionDiffGroupAction: vi.fn(),
  approveEditionPreviewAction: vi.fn(),
  moveEditionPointerAction: vi.fn(),
}));

function model(
  overrides: Partial<EditionCenterReadModel> = {},
): EditionCenterReadModel {
  return {
    edition: {
      id: "00000000-0000-4000-8000-000000258001",
      state: "review_ready",
      priorReleaseId: "00000000-0000-4000-8000-000000258000",
      previewDigest: "a".repeat(64),
      version: 2,
      createdAt: "2026-08-28T00:00:00.000Z",
      approvedAt: null,
      activatedAt: null,
      unchangedCount: 128_000,
      reviewableCount: 4,
      blockingCount: 1,
      totalAffectedObjectCount: 7,
    },
    activeReleaseId: "00000000-0000-4000-8000-000000258000",
    availableCaptures: [
      {
        captureId: "00000000-0000-4000-8000-000000254001",
        observedEndedAt: "2026-08-28T00:00:00.000Z",
      },
    ],
    diffGroups: [
      {
        id: "00000000-0000-4000-8000-000000258100",
        diffClass: "supersession",
        state: "open",
        memberCount: 2,
        affectedObjectCount: 7,
        expectedVersion: 1,
      },
    ],
    activationHistory: [
      {
        sequenceNumber: 2,
        transition: "rollback",
        state: "verified",
        releaseId: "00000000-0000-4000-8000-000000258000",
        priorReleaseId: "00000000-0000-4000-8000-000000258001",
        affectedObjectCount: 7,
        createdAt: "2026-08-28T00:10:00.000Z",
      },
    ],
    writesEnabled: true,
    ...overrides,
  };
}

describe("Stable Registry edition page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getCurrentSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.assertCatalogCuratorAccess.mockResolvedValue(undefined);
    mocks.isStableRegistryEditionsEnabled.mockReturnValue(true);
    mocks.readEditionCenter.mockResolvedValue(model());
  });

  it("requires a signed-in owner before reading an edition", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-edition-state="sign-in-required"');
    expect(mocks.readEditionCenter).not.toHaveBeenCalled();
  });

  it("denies an ordinary user without exposing diff evidence", async () => {
    mocks.assertCatalogCuratorAccess.mockRejectedValue(new Error("denied"));
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-edition-state="denied"');
    expect(html).not.toContain("supersession");
    expect(mocks.readEditionCenter).not.toHaveBeenCalled();
  });

  it("stays dark and reads nothing while the flag is off", async () => {
    mocks.isStableRegistryEditionsEnabled.mockReturnValue(false);
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-edition-state="disabled"');
    expect(mocks.readEditionCenter).not.toHaveBeenCalled();
  });

  it("shows the owner impact before approval, not thousands of rows", async () => {
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-diff-class="supersession"');
    // 128k unchanged records produce zero review work.
    expect(html).toContain("128000");
    expect(html).toContain("Задіяні обʼєкти");
    expect(html).toContain('name="expectedAffectedObjectCount" value="7"');
  });

  it("keeps the rollback receipt visible in the activation history", async () => {
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('data-transition="rollback"');
    expect(html).toContain('data-receipt-state="verified"');
  });

  it("keeps the keep-current and cancel controls available during review", async () => {
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Залишити поточний випуск");
    expect(html).toContain('data-edition-cancel="true"');
  });

  it("localizes the lane for every shared locale", async () => {
    for (const [locale, title] of [
      ["uk", "Stable Registry — видання"],
      ["bg", "Stable Registry — издания"],
      ["ru", "Stable Registry — издания"],
    ] as const) {
      vi.resetModules();
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
      const { default: Page } = await import("./page");
      const html = renderToStaticMarkup(await Page());
      expect(html).toContain(title);
    }
  });
});
