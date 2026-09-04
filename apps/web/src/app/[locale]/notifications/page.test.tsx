import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
  listNotificationCenterPage: vi.fn(),
  getNotificationPreferences: vi.fn(),
  groupNotificationEvents: vi.fn((events) =>
    events.map((event: Record<string, unknown>) => ({ ...event, count: 1 })),
  ),
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

vi.mock("@/server/social-return-repository", () => ({
  listNotificationCenterPage: mocks.listNotificationCenterPage,
  getNotificationPreferences: mocks.getNotificationPreferences,
  groupNotificationEvents: mocks.groupNotificationEvents,
}));

vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: {
    next?: string;
    locale?: string;
    description?: string;
  }) => (
    <section
      data-sign-in-prompt="true"
      data-next={props.next ?? ""}
      data-locale={props.locale ?? ""}
    >
      Sign in prompt
      {props.description ?? ""}
    </section>
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
    mocks.getNotificationPreferences.mockResolvedValue({
      comments: true,
      replies: true,
      follows: true,
      mentions: true,
      claims: true,
      system: true,
    });
    mocks.listNotificationCenterPage.mockResolvedValue({
      items: [
        {
          key: "a".repeat(32),
          kind: "claim",
          createdAt: "2026-07-04T08:00:00.000Z",
          summaryKey: "claim_decided",
          actorMention: "@green_thumb",
          targetLabel: "Balcony tomato",
          href: "/garden/lineage/claims",
          actionKind: "review_claims",
          groupKey: "claim:safe",
          read: false,
        },
      ],
      nextCursor: null,
      unreadCount: 1,
    });
  });

  it("keeps notification metadata private and localized", async () => {
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "uk" }),
      }),
    ).resolves.toMatchObject({
      title: "Сповіщення | OverGarden",
      description:
        "Відповіді, підписки, згадки та дії з походженням в одному місці.",
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

    expect(html).toContain("Увійдіть, щоб відкрити сповіщення.");
    expect(mocks.listNotificationCenterPage).not.toHaveBeenCalled();
  });

  it("renders bounded notification events without private payload fields", async () => {
    const { default: LocalizedNotificationsRoute } = await import("./page");
    const html = renderToStaticMarkup(
      await LocalizedNotificationsRoute({
        params: Promise.resolve({ locale: "uk" }),
      }),
    );

    expect(mocks.listNotificationCenterPage).toHaveBeenCalledWith(
      {
        userId: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
      },
      "uk",
      expect.objectContaining({ filter: "all", unreadOnly: false }),
    );
    expect(html).toContain("Сповіщення");
    expect(html).toContain("Статус запиту про походження змінено");
    expect(html).toContain("@green_thumb");
    expect(html).toContain("Balcony tomato");
    expect(html).toContain("/garden/lineage/claims");
    expect(html).toContain("/api/notifications/receipts");
    expect(html).toMatch(
      /aria-current="true"[^>]*href="\/notifications\?view=individual"/,
    );
    expect(html).not.toMatch(
      /00000000-0000|session-1|journal body|private journal|quarantine|derivative|media key|ip_address|user_agent|email|phone|coordinates|invite|token|source_reference_label|client_mutation/i,
    );
  });
});
