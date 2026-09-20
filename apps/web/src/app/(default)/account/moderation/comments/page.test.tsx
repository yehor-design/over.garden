import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  listEngagementCommentModerationQueue: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
}));

vi.mock("@/app/(default)/account/moderation/comments/actions", () => ({
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

  it("says what a report is about, in the owner's own language", async () => {
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "allowed",
    });
    mocks.listEngagementCommentModerationQueue.mockResolvedValue([
      {
        reportId: "00000000-0000-4000-8000-000000000920",
        commentId: "00000000-0000-4000-8000-000000000921",
        // The real values. The fixture used to carry `comment` and `open`,
        // which are neither a target kind nor a report state — invisible while
        // the page printed the enum, and `undefined` the moment it looked one
        // up (`OVE-459`).
        targetKind: "journal_entry",
        targetRef: "00000000-0000-4000-8000-000000000922",
        reason: "spam",
        reportState: "submitted",
        createdAt: new Date("2026-09-06T11:00:00.000Z"),
      },
    ]);
    const { default: CommentModerationPage } = await import("./page");
    const html = renderToStaticMarkup(await CommentModerationPage());

    expect(html).toContain('data-private-moderation-queue="true"');
    expect(html).toContain(
      'data-moderation-report="00000000-0000-4000-8000-000000000920"',
    );
    // Localised, not the enum: the page reads in three languages, and an
    // operator surface is still the product.
    expect(html).toContain("Запис");
    expect(html).toContain("Спам");
    expect(html).toContain("Нова");
    expect(html).toContain("Скаргу подано");
    expect(html).not.toContain(">spam<");
    expect(html).not.toContain(">submitted<");
    expect(html).not.toContain(">journal_entry<");
    expect(html).not.toContain("undefined");
  });

  it("puts the three decisions on real forms, and removal behind a question", async () => {
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "allowed",
    });
    mocks.listEngagementCommentModerationQueue.mockResolvedValue([
      {
        reportId: "00000000-0000-4000-8000-000000000920",
        commentId: "00000000-0000-4000-8000-000000000921",
        targetKind: "journal_entry",
        targetRef: "00000000-0000-4000-8000-000000000922",
        reason: "harassment",
        reportState: "reviewed",
        createdAt: new Date("2026-09-06T11:00:00.000Z"),
      },
    ]);
    const { default: CommentModerationPage } = await import("./page");
    const html = renderToStaticMarkup(await CommentModerationPage());

    for (const action of ["review", "dismiss", "remove"]) {
      expect(html, action).toContain(`data-moderation-action="${action}"`);
    }
    // Three forms, one per decision, so each decides before hydration.
    expect(html.match(/<form/gu)?.length ?? 0).toBe(3);
    // Removal takes something off a public page: `danger`, and it asks.
    expect(html).toContain(
      'data-confirm-submit="moderation-remove-00000000-0000-4000-8000-000000000920"',
    );
    // `danger`, never `primary` (DESIGN.md §4.4). The dialog itself opens on
    // hydration, so its words are asserted where they live rather than here.
    expect(html).toContain("bg-danger-fill");
  });

  it("carries the removal question in every locale", async () => {
    const { getOperatorCopy } = await import("@/lib/operator-copy");
    const { PUBLIC_LOCALES } = await import("@/lib/public-localization");
    for (const locale of PUBLIC_LOCALES) {
      const copy = getOperatorCopy(locale).moderation;
      for (const key of [
        "removeTitle",
        "removeBody",
        "removeConfirm",
        "removeCancel",
        "reportedAt",
      ] as const) {
        expect(copy[key].length, `${locale}.${key}`).toBeGreaterThan(0);
      }
      for (const action of ["review", "dismiss", "remove"] as const) {
        expect(copy.actions[action], `${locale}.${action}`).not.toBe(action);
      }
    }
  });
});
