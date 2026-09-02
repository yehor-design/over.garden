import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  getOwnerProfileWorkspace: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  getCurrentAccountMethodProjection: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));
vi.mock("@/server/owner-profile-repository", () => ({
  getOwnerProfileWorkspace: mocks.getOwnerProfileWorkspace,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/auth/account-methods", () => ({
  getCurrentAccountMethodProjection: mocks.getCurrentAccountMethodProjection,
}));
vi.mock("../garden-auth-panel", () => ({
  GardenAuthPanel: () => <section>Sign in panel</section>,
}));
vi.mock("../account-methods-panel", () => ({
  AccountMethodsPanel: ({
    readbackState,
    hasCredential,
    hasGoogle,
    canLinkGoogle,
  }: {
    readbackState: "ready" | "retry";
    hasCredential: boolean;
    hasGoogle: boolean;
    canLinkGoogle: boolean;
  }) => (
    <section
      data-account-methods={`${readbackState}:${hasCredential}:${hasGoogle}:${canLinkGoogle}`}
    >
      Account sign-in methods
    </section>
  ),
}));
vi.mock("@/components/auth/sign-out-control", () => ({
  SignOutControl: ({ presentation }: { presentation: string }) => (
    <button
      type="button"
      data-sign-out-control={presentation}
      className="w-full"
    >
      Вийти з облікового запису
    </button>
  ),
}));
vi.mock("./owner-profile-editor", () => ({
  OwnerProfileEditor: ({
    workspace,
  }: {
    workspace: { preview: { mention: string } };
  }) => (
    <section data-owner-profile-editor="v2">
      {workspace.preview.mention}
    </section>
  ),
}));
vi.mock("./actions", () => ({
  unblockProfileAction: vi.fn(),
}));

const WORKSPACE = {
  editor: {
    handle: "green_thumb",
    avatarMediaAssetId: null,
    displayName: "Olena",
    bio: null,
    languages: ["uk"],
    locationVisibility: "hidden",
    coarseRegionCode: null,
    relationshipVisibility: "counts",
  },
  handleRename: {
    currentHandle: "green_thumb",
    nextEligibleAt: "2026-07-18T00:00:00.000Z",
    canRename: true,
  },
  preview: { mention: "@green_thumb" },
  avatarOptions: [],
  relationshipCounts: { followers: 0, following: 0 },
  blockedProfiles: [
    {
      blockId: "00000000-0000-4000-8000-000000000222",
      handle: "blocked_keeper",
      displayName: "Blocked Keeper",
    },
  ],
};

describe("/garden/profile", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.getOwnerProfileWorkspace.mockResolvedValue(WORKSPACE);
    mocks.getCurrentAccountMethodProjection.mockResolvedValue({
      readbackState: "ready",
      hasCredential: true,
      hasGoogle: true,
      canSetPassword: false,
      canLinkGoogle: false,
    });
  });

  it("loads the scoped owner workspace and exact preview", async () => {
    const { default: Page } = await import("./page");
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );

    expect(mocks.getOwnerProfileWorkspace).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      "uk",
    );
    expect(html).toContain('data-owner-profile-editor="v2"');
    expect(html).toContain('href="/@green_thumb"');
    expect(html).toContain("Blocked Keeper");
    expect(html).toContain("Account sign-in methods");
    expect(html).toContain('data-account-methods="ready:true:true:false"');
    expect(mocks.getCurrentAccountMethodProjection).toHaveBeenCalledOnce();
    expect(html).toContain("Обліковий запис і безпека");
    expect(html).toContain('data-sign-out-control="profile"');
    expect(html).toContain("Вийти з облікового запису");
    expect(html).toContain('class="w-full"');
    expect(html).not.toMatch(/email|provider|session-1|quarantine|token/i);
  });

  it("localizes blocked-state management", async () => {
    mocks.getRequestInterfaceLocale.mockResolvedValueOnce("bg");
    const { default: Page } = await import("./page");
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({ relationshipStatus: "unblocked" }),
      }),
    );

    expect(html).toContain("Блокирани профили");
    expect(html).toContain("Профилът е разблокиран.");
    expect(html).toContain("Профил и сигурност");
  });

  it("shows auth without creating an owner workspace when signed out", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const { default: Page } = await import("./page");
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Sign in panel");
    expect(mocks.getOwnerProfileWorkspace).not.toHaveBeenCalled();
    expect(mocks.getCurrentAccountMethodProjection).not.toHaveBeenCalled();
    expect(html).toContain('data-garden-profile-auth-shell="guest"');
  });
});
