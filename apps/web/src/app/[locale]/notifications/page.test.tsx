import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  listNotificationCenter: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: mocks.getSessionId,
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/social-readback-repository", () => ({
  listNotificationCenter: mocks.listNotificationCenter,
}));

vi.mock("../../garden/garden-auth-panel", () => ({
  GardenAuthPanel: ({ initialMessage }: { initialMessage?: string }) => (
    <section>{initialMessage ?? "Sign in"}</section>
  ),
}));

describe("/{locale}/notifications", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getSessionId.mockReturnValue("session-1");
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000001" },
      session: { id: "session-1" },
    });
    mocks.listNotificationCenter.mockResolvedValue([
      {
        key: "notification:safe",
        kind: "lineage_claim_request",
        createdAt: "2026-07-04T08:00:00.000Z",
        summary: "Lineage claim needs review",
        detail: "Balcony tomato claims provenance from Seed mother.",
        primaryObject: {
          displayName: "Balcony tomato",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          varietyState: "selected",
        },
        secondaryObject: {
          displayName: "Seed mother",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          varietyState: "selected",
        },
        actorMention: null,
        actionKind: "review_claims",
      },
      {
        key: "notification:follow",
        kind: "lineage_follow",
        createdAt: "2026-07-04T09:00:00.000Z",
        summary: "@green_thumb followed Seed mother",
        detail: null,
        primaryObject: {
          displayName: "Seed mother",
          objectKind: "plant",
          catalogKind: "plant_variety",
          varietyText: "Red Cherry",
          varietyState: "selected",
        },
        secondaryObject: null,
        actorMention: "@green_thumb",
        actionKind: "open_followed_feed",
      },
    ]);
  });

  it("keeps notification metadata private and localized", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "uk" }),
      }),
    ).resolves.toMatchObject({
      title: "Notifications | OverGarden",
      alternates: {
        canonical: "/notifications",
      },
      robots: {
        index: false,
        follow: false,
      },
    });
  });

  it("requires auth before reading notification events", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);

    const { default: LocalizedNotificationsRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedNotificationsRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(html).toContain("Sign in to open notifications.");
    expect(mocks.listNotificationCenter).not.toHaveBeenCalled();
  });

  it("renders bounded notification events without private payload fields", async () => {
    const { default: LocalizedNotificationsRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedNotificationsRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(mocks.listNotificationCenter).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
    });
    expect(html).toContain("Notifications");
    expect(html).toContain("Lineage claim needs review");
    expect(html).toContain(
      "Balcony tomato claims provenance from Seed mother.",
    );
    expect(html).toContain("@green_thumb followed Seed mother");
    expect(html).toContain("/garden/lineage/claims");
    expect(html).toContain("/feed");
    expect(html).not.toMatch(
      /00000000-0000|session-1|journal body|private journal|quarantine|derivative|media key|ip_address|user_agent|email|phone|coordinates|invite|token|source_reference_label|client_mutation/i,
    );
  });
});
