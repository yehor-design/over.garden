import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  listEngagementCommentModerationQueue: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
}));

vi.mock("@/app/account/moderation/comments/actions", () => ({
  moderateCommentReportAction: vi.fn(),
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: mocks.getCurrentSession,
  getSessionId: vi.fn(() => "owner-session"),
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/engagement-repository", () => ({
  listEngagementCommentModerationQueue:
    mocks.listEngagementCommentModerationQueue,
}));
vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccessBounded:
    mocks.resolveAdminCapabilityAccessBounded,
}));
vi.mock("@/server/request-scope", () => ({
  scopedToUser: vi.fn((userId: string, sessionId?: string) => ({
    userId,
    sessionId: sessionId ?? null,
  })),
}));

describe("/account/moderation/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000901" },
    });
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.listEngagementCommentModerationQueue.mockResolvedValue([]);
  });

  it.each(["denied", "timed_out", "cancelled"] as const)(
    "denies %s before reading comment reports",
    async (status) => {
      mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({ status });
      const { default: CommentModerationPage } = await import("./page");
      const html = renderToStaticMarkup(await CommentModerationPage());

      expect(html).toContain('data-operator-access-state="denied"');
      expect(html).not.toContain("data-private-moderation-queue");
      expect(mocks.listEngagementCommentModerationQueue).not.toHaveBeenCalled();
    },
  );

  it("renders the localized empty queue for the sealed owner", async () => {
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "allowed",
    });
    const { default: CommentModerationPage } = await import("./page");
    const html = renderToStaticMarkup(await CommentModerationPage());

    expect(html).toContain("Модерація коментарів");
    expect(html).not.toContain("data-private-moderation-queue");
    expect(mocks.listEngagementCommentModerationQueue).toHaveBeenCalledTimes(1);
  });

  it("marks a non-empty sealed-owner queue as private", async () => {
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "allowed",
    });
    mocks.listEngagementCommentModerationQueue.mockResolvedValue([
      {
        reportId: "00000000-0000-4000-8000-000000000920",
        targetKind: "comment",
        reason: "spam",
        reportState: "open",
      },
    ]);
    const { default: CommentModerationPage } = await import("./page");
    const html = renderToStaticMarkup(await CommentModerationPage());

    expect(html).toContain('data-private-moderation-queue="true"');
  });
});
