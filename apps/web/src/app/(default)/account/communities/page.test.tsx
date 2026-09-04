import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  listCommunityModerationQueue: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
}));

vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "moderator-session"),
}));

vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId: string) => ({
    userId,
    sessionId,
  })),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));

vi.mock("@/server/community-repository", () => ({
  listCommunityModerationQueue: mocks.listCommunityModerationQueue,
}));

vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccessBounded:
    mocks.resolveAdminCapabilityAccessBounded,
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

describe("/account/communities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000901" },
    });
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.listCommunityModerationQueue.mockResolvedValue({ items: [] });
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "allowed",
    });
  });

  it("keeps the signed-out boundary localized without reading moderation", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    const { default: CommunityModerationDirectory } = await import("./page");
    const html = renderToStaticMarkup(await CommunityModerationDirectory());

    expect(html).toContain("Модерація спільнот");
    expect(html).toContain('data-sign-in-prompt="true"');
    expect(html).toContain('data-next="/account/communities"');
    expect(mocks.listCommunityModerationQueue).not.toHaveBeenCalled();
    expect(mocks.resolveAdminCapabilityAccessBounded).not.toHaveBeenCalled();
  });

  it.each([
    ["uk", "Модерація спільнот", "відкритих скарг: 0"],
    ["bg", "Модерация на общности", "отворени сигнали: 0"],
    ["ru", "Модерация сообществ", "открытых жалоб: 0"],
  ] as const)(
    "renders selected %s moderation copy",
    async (locale, title, countLabel) => {
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
      const { default: CommunityModerationDirectory } = await import("./page");
      const html = renderToStaticMarkup(await CommunityModerationDirectory());

      expect(html).toContain(title);
      expect(html).toContain(countLabel);
      expect(html).toContain("observation-and-care");
      expect(html).toContain('data-private-moderation-queue="true"');
    },
  );

  it("marks a fail-closed moderation lookup without exposing the queue", async () => {
    mocks.listCommunityModerationQueue.mockRejectedValue(new Error("denied"));
    const { default: CommunityModerationDirectory } = await import("./page");
    const html = renderToStaticMarkup(await CommunityModerationDirectory());

    expect(html).toContain('data-operator-access-state="unavailable"');
    expect(html).not.toContain("відкритих скарг:");
    expect(html).not.toContain("data-private-moderation-queue");
  });

  it("denies an authenticated ordinary user before reading moderation", async () => {
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "denied",
    });
    const { default: CommunityModerationDirectory } = await import("./page");
    const html = renderToStaticMarkup(await CommunityModerationDirectory());

    expect(html).toContain('data-operator-access-state="unavailable"');
    expect(html).not.toContain("data-private-moderation-queue");
    expect(mocks.listCommunityModerationQueue).not.toHaveBeenCalled();
  });
});
