import { postgresRejection } from "@test/postgres-rejection";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getModerationCopy } from "@/lib/moderation-copy";
import { AdminAccessDeniedError } from "@/server/admin-access";
import type {
  EngagementCommentModerationQueue,
  EngagementCommentModerationQueueItem,
} from "@/server/engagement-repository";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
  resolveWorkspaceViewer: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
  listEngagementCommentModerationQueue: vi.fn(),
  readEngagementCommentModerationReport: vi.fn(),
  confirmSubmit: vi.fn(),
}));

vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
// The owner check is the real `resolveWorkspaceAdminAccess`, so a refusal and
// an outage are told apart the way production tells them apart; only who is
// reading is stated here.
vi.mock("@/server/workspace-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/workspace-access")>()),
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
}));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/admin-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-access")>()),
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));
vi.mock("@/server/engagement-repository", () => ({
  listEngagementCommentModerationQueue:
    mocks.listEngagementCommentModerationQueue,
  readEngagementCommentModerationReport:
    mocks.readEngagementCommentModerationReport,
}));
vi.mock("@/app/(default)/account/moderation/comments/actions", () => ({
  moderateCommentReportAction: vi.fn(),
}));
// The question removal asks lives in a dialog that opens on hydration, so it
// is not in the served markup. The real control still renders — its submit
// button is what works before the bundle does — and the spy records what it
// was told to ask.
vi.mock("@/components/ui/confirm-submit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/ui/confirm-submit")>();
  return {
    ConfirmSubmit: (
      props: React.ComponentProps<typeof actual.ConfirmSubmit>,
    ) => {
      mocks.confirmSubmit(props);
      return <actual.ConfirmSubmit {...props} />;
    },
  };
});
vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: { next?: string; locale?: string }) => (
    <section
      data-sign-in-prompt="true"
      data-next={props.next ?? ""}
      data-locale={props.locale ?? ""}
    >
      Sign in prompt
    </section>
  ),
}));

const PATH = "/account/moderation/comments";
const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000901",
  sessionId: "owner-session",
};
const REPORT_ID = "00000000-0000-4000-8000-000000000920";
const OTHER_REPORT_ID = "00000000-0000-4000-8000-000000000930";
const COMMENT_ID = "00000000-0000-4000-8000-000000000921";
const ENTRY_ID = "00000000-0000-4000-8000-000000000922";

const uk = getModerationCopy("uk");

function commentReport(
  overrides: Partial<EngagementCommentModerationQueueItem> = {},
): EngagementCommentModerationQueueItem {
  return {
    reportId: REPORT_ID,
    commentId: COMMENT_ID,
    targetKind: "journal_entry",
    targetRef: ENTRY_ID,
    reason: "harassment",
    reportState: "submitted",
    createdAt: new Date("2026-09-20T09:00:00.000Z"),
    resolvedAt: null,
    commentState: "active",
    commentExcerpt: "Такі поради дають ті, хто нічого не вирощував.",
    authorHandle: "olena",
    authorDisplayName: "Олена Мельник",
    place: { label: "Томати після граду", href: "/@anna/post/7" },
    ...overrides,
  };
}

function queue(
  items: EngagementCommentModerationQueueItem[] = [commentReport()],
  options: Partial<
    Pick<EngagementCommentModerationQueue, "view" | "counts">
  > = {},
): EngagementCommentModerationQueue {
  return {
    view: options.view ?? "open",
    items,
    counts: options.counts ?? { open: items.length, resolved: 5 },
  };
}

async function renderComments(
  searchParams: Record<string, string> = {},
): Promise<string> {
  const { default: CommentModerationPage } = await import("./page");
  return renderToStaticMarkup(
    await CommentModerationPage({
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("/account/moderation/comments — the comment reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "signed-in",
      userId: SCOPE.userId,
      scope: SCOPE,
    });
    mocks.assertAdminCapabilityForScope.mockResolvedValue({
      mode: "sealed_owner_credential_only",
      role: "owner",
      capabilities: ["operator:read", "operator:mutate"],
    });
    mocks.listEngagementCommentModerationQueue.mockResolvedValue(queue());
    mocks.readEngagementCommentModerationReport.mockResolvedValue(null);
  });

  describe("who may read the queue", () => {
    it("asks a guest to sign in, and asks nothing else", async () => {
      mocks.resolveWorkspaceViewer.mockResolvedValue({
        status: "sign-in-required",
      });

      const html = await renderComments({
        view: "resolved",
        report: REPORT_ID,
        result: "done",
      });

      expect(html).toContain('data-operator-surface="comment-moderation"');
      expect(html).toContain('data-operator-access-state="sign-in-required"');
      expect(html).toContain(`data-next="${PATH}?view=resolved"`);
      expect(html).not.toContain("data-private-moderation-queue");
      expect(html).not.toContain("data-moderation-tabs");
      expect(html).not.toContain("data-action-outcome");
      expect(mocks.assertAdminCapabilityForScope).not.toHaveBeenCalled();
      expect(mocks.listEngagementCommentModerationQueue).not.toHaveBeenCalled();
      expect(
        mocks.readEngagementCommentModerationReport,
      ).not.toHaveBeenCalled();
    });

    it("says the session could not be read, instead of asking the owner to sign in", async () => {
      mocks.resolveWorkspaceViewer.mockResolvedValue({
        status: "unavailable",
        failure: describeWorkspaceFailure(postgresRejection("08006")),
      });

      const html = await renderComments();

      expect(html).toContain('data-operator-access-state="unavailable"');
      expect(html).toContain('data-section-failure="connection_unavailable"');
      expect(html).not.toContain("data-sign-in-prompt");
      expect(mocks.assertAdminCapabilityForScope).not.toHaveBeenCalled();
      expect(mocks.listEngagementCommentModerationQueue).not.toHaveBeenCalled();
    });

    it("refuses anybody but the owner before a single queue read", async () => {
      mocks.assertAdminCapabilityForScope.mockRejectedValue(
        new AdminAccessDeniedError(),
      );
      mocks.readEngagementCommentModerationReport.mockResolvedValue(
        commentReport(),
      );

      const html = await renderComments({ report: REPORT_ID, result: "done" });

      expect(mocks.assertAdminCapabilityForScope).toHaveBeenCalledWith(
        SCOPE,
        "operator:mutate",
      );
      expect(html).toContain('data-operator-access-state="denied"');
      // Comment moderation is the owner's alone, and the refusal says so —
      // not the community pages' sentence about assigned moderators.
      expect(html).toContain(uk.comments.accessDenied);
      expect(html).not.toContain(uk.accessDenied);
      expect(mocks.listEngagementCommentModerationQueue).not.toHaveBeenCalled();
      expect(
        mocks.readEngagementCommentModerationReport,
      ).not.toHaveBeenCalled();
      for (const leak of [
        "data-private-moderation-queue",
        "data-moderation-report",
        "data-moderation-tabs",
        "data-action-outcome",
        "<form",
        REPORT_ID,
        "Такі поради",
        "Олена Мельник",
      ]) {
        expect(html, leak).not.toContain(leak);
      }
    });

    // Telling the owner "no access" while the role table is unreachable
    // sends them to audit permissions during an outage.
    it("says the owner check could not be made, rather than calling an outage a refusal", async () => {
      mocks.assertAdminCapabilityForScope.mockRejectedValue(
        postgresRejection("08006"),
      );

      const html = await renderComments();

      expect(html).toContain('data-operator-access-state="unavailable"');
      expect(html).toContain('data-section-failure="connection_unavailable"');
      expect(html).not.toContain(uk.comments.accessDenied);
      expect(html).not.toContain(uk.accessDenied);
      expect(mocks.listEngagementCommentModerationQueue).not.toHaveBeenCalled();
      expect(
        mocks.readEngagementCommentModerationReport,
      ).not.toHaveBeenCalled();
    });

    // The owner is confirmed by then, so the frame stays the owner's; only
    // the queue failed, and it says so rather than reading as empty.
    it("renders a failed queue read as its failure class, with a retry that keeps the view", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.listEngagementCommentModerationQueue.mockRejectedValue(
        postgresRejection("57014"),
      );

      const html = await renderComments({ view: "resolved" });

      expect(html).toContain('data-operator-access-state="allowed"');
      expect(html).toContain('data-section-failure="query_timeout"');
      expect(html).toContain(uk.unavailable);
      expect(html).toContain(
        `href="${PATH}?view=resolved" data-workspace-retry="section"`,
      );
      expect(html).not.toContain(uk.comments.emptyResolved);
      expect(html).not.toContain("data-private-moderation-queue");
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        event: "workspace_section_degraded",
        surface: "comment-moderation",
        section: "reports",
        failureClass: "query_timeout",
      });
      log.mockRestore();
    });
  });

  describe("a report, as a task", () => {
    // It used to be three badges and three buttons: an owner asked to remove
    // a comment could not see the comment.
    it("shows the comment, who wrote it and where, the reason and where the report stands — in words", async () => {
      const html = await renderComments();
      const card = elementWith(
        html,
        `data-moderation-report="${REPORT_ID}"`,
        "li",
      );
      const text = visibleText(card);

      expect(html).toContain('data-operator-access-state="allowed"');
      expect(html).toContain('data-private-moderation-queue="true"');
      expect(mocks.listEngagementCommentModerationQueue).toHaveBeenCalledWith(
        SCOPE,
        { view: "open" },
      );
      expect(
        mocks.readEngagementCommentModerationReport,
      ).not.toHaveBeenCalled();

      expect(card).toContain(`id="report-${REPORT_ID}"`);
      expect(card).toMatch(
        /<h3 [^>]*>Коментар до запису: <a [^>]*href="\/@anna\/post\/7">Томати після граду<\/a><\/h3>/u,
      );
      expect(card).toMatch(/<a [^>]*href="\/@olena">Олена Мельник<\/a>/u);
      expect(card).toMatch(
        /<blockquote data-moderation-excerpt="true"[^>]*>Такі поради дають ті, хто нічого не вирощував\.<\/blockquote>/u,
      );
      expect(card).toContain('data-moderation-reason="harassment"');
      expect(text).toContain(uk.reasons.harassment);
      expect(text).toContain(uk.reportStates.submitted);
      expect(text).toContain(uk.reportedOn);
      // The machine values stay in attributes; the reader sees none of them,
      // and no internal id of the comment or the page it is on.
      for (const machine of [
        "harassment",
        "submitted",
        "journal_entry",
        "undefined",
        "null",
      ]) {
        expect(text, machine).not.toContain(machine);
      }
      expect(html).not.toContain(COMMENT_ID);
      expect(html).not.toContain(ENTRY_ID);
    });

    it("carries the exact report, decision and view on each form, and asks only before removing", async () => {
      const html = await renderComments();

      // One real form per decision, so each one decides before hydration.
      expect(html.match(/<form /gu)?.length ?? 0).toBe(3);
      for (const action of ["review", "dismiss", "remove"] as const) {
        const form = elementWith(
          html,
          `data-moderation-action="${action}"`,
          "form",
        );
        expect(hiddenFields(form), action).toEqual({
          reportId: REPORT_ID,
          action,
          view: "open",
        });
      }

      // Removal takes a comment off a public page for good: `danger`, and it
      // asks first. Review and dismissal only move the report.
      const remove = elementWith(
        html,
        'data-moderation-action="remove"',
        "form",
      );
      expect(remove).toContain(`id="moderation-remove-${REPORT_ID}"`);
      expect(remove).toContain(
        `data-confirm-submit="moderation-remove-${REPORT_ID}"`,
      );
      expect(remove).toContain("bg-danger-fill");
      expect(html.match(/data-confirm-submit=/gu)?.length ?? 0).toBe(1);
      expect(mocks.confirmSubmit).toHaveBeenCalledTimes(1);
      expect(mocks.confirmSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          formId: `moderation-remove-${REPORT_ID}`,
          label: uk.comments.actions.remove,
          title: uk.comments.removeTitle,
          description: uk.comments.removeBody,
          confirmLabel: uk.comments.removeConfirm,
          cancelLabel: uk.cancel,
          pendingLabel: uk.pending,
        }),
      );
      expect(visibleText(html)).toContain(uk.comments.actions.review);
      expect(visibleText(html)).toContain(uk.comments.actions.dismiss);
    });

    it("offers review only while a report is new", async () => {
      mocks.listEngagementCommentModerationQueue.mockResolvedValue(
        queue([commentReport({ reportState: "reviewed" })]),
      );

      const html = await renderComments();

      expect(html).not.toContain('data-moderation-action="review"');
      expect(html).toContain('data-moderation-action="dismiss"');
      expect(html).toContain('data-moderation-action="remove"');
      expect(html.match(/<form /gu)?.length ?? 0).toBe(2);
      expect(visibleText(html)).toContain(uk.reportStates.reviewed);
    });

    it("keeps a removed comment's text out, and offers no decision on a resolved report", async () => {
      mocks.listEngagementCommentModerationQueue.mockResolvedValue(
        queue(
          [
            commentReport({
              reportState: "actioned",
              resolvedAt: new Date("2026-09-21T10:00:00.000Z"),
              commentState: "removed",
              commentExcerpt: null,
            }),
          ],
          { view: "resolved", counts: { open: 0, resolved: 1 } },
        ),
      );

      const html = await renderComments({ view: "resolved" });

      expect(mocks.listEngagementCommentModerationQueue).toHaveBeenCalledWith(
        SCOPE,
        { view: "resolved" },
      );
      expect(visibleText(html)).toContain(uk.comments.removedText);
      expect(visibleText(html)).toContain(uk.reportStates.actioned);
      expect(html).not.toContain("data-moderation-excerpt");
      expect(html).not.toContain("<form");
      expect(html).not.toContain("data-moderation-action");
    });

    it("says when the page a comment is on is no longer public, and names an author with no profile without a link", async () => {
      mocks.listEngagementCommentModerationQueue.mockResolvedValue(
        queue([
          commentReport({
            targetKind: "community_contribution",
            place: null,
            authorHandle: null,
            authorDisplayName: null,
          }),
        ]),
      );

      const html = await renderComments();
      const card = elementWith(
        html,
        `data-moderation-report="${REPORT_ID}"`,
        "li",
      );
      const text = visibleText(card);

      expect(text).toContain(uk.comments.targets.community_contribution);
      expect(text).toContain(uk.comments.placeUnavailable);
      expect(text).toContain(uk.noPublicAuthor);
      expect(card).not.toContain("href=");
    });
  });

  describe("open and resolved views", () => {
    it("filters by address, counts both, and marks the one shown", async () => {
      mocks.listEngagementCommentModerationQueue.mockResolvedValue(
        queue([], { view: "resolved", counts: { open: 3, resolved: 0 } }),
      );

      const html = await renderComments({ view: "resolved" });
      const open = elementWith(html, 'data-moderation-view="open"', "a");
      const resolved = elementWith(
        html,
        'data-moderation-view="resolved"',
        "a",
      );

      expect(open).toContain(`href="${PATH}"`);
      expect(open).not.toContain("aria-current");
      expect(open).toContain(
        `${uk.views.open}<span class="tabular-nums">3</span>`,
      );
      expect(resolved).toContain(`href="${PATH}?view=resolved"`);
      expect(resolved).toContain('aria-current="page"');
      expect(resolved).toContain(
        `${uk.views.resolved}<span class="tabular-nums">0</span>`,
      );
      expect(html).toContain(uk.comments.emptyResolved);
      expect(html).not.toContain(uk.comments.emptyOpen);
    });

    it("says an empty open queue in words", async () => {
      mocks.listEngagementCommentModerationQueue.mockResolvedValue(queue([]));

      const html = await renderComments({ view: "everything" });

      expect(mocks.listEngagementCommentModerationQueue).toHaveBeenCalledWith(
        SCOPE,
        { view: "open" },
      );
      expect(html).toContain(uk.comments.emptyOpen);
      expect(html).not.toContain("data-moderation-report");
    });

    it("links the two moderation areas, the comments marked as current", async () => {
      const html = await renderComments();
      const areas = elementWith(html, 'data-moderation-tabs="true"', "nav");

      expect(areas).toMatch(
        /<a aria-current="page"[^>]*href="\/account\/moderation\/comments">Коментарі<\/a>/u,
      );
      expect(areas).toMatch(
        /<a (?![^>]*aria-current)[^>]*href="\/account\/communities">Спільноти<\/a>/u,
      );
    });
  });

  // An action comes back to the same view, and its outcome is read back from
  // the record: in the report's own card while it is still in the view, above
  // the list when the action moved it out.
  describe("what the last action did", () => {
    it.each([
      ["done", uk.outcome.savedTitle, null],
      ["stale", uk.outcome.staleTitle, uk.outcome.staleBody],
      ["failed", uk.outcome.failedTitle, uk.outcome.failedBody],
      // Only the owner may act here, so a refusal names the owner — not a
      // community's moderators.
      ["denied", uk.outcome.deniedTitle, uk.comments.deniedBody],
    ] as const)(
      "says %s in the report's own card while the report is still in the view",
      async (result, title, body) => {
        mocks.listEngagementCommentModerationQueue.mockResolvedValue(
          queue([
            commentReport(),
            commentReport({ reportId: OTHER_REPORT_ID }),
          ]),
        );
        mocks.readEngagementCommentModerationReport.mockResolvedValue(
          commentReport({ reportState: "reviewed" }),
        );

        const html = await renderComments({ report: REPORT_ID, result });
        const card = elementWith(
          html,
          `data-moderation-report="${REPORT_ID}"`,
          "li",
        );
        const other = elementWith(
          html,
          `data-moderation-report="${OTHER_REPORT_ID}"`,
          "li",
        );

        expect(
          mocks.readEngagementCommentModerationReport,
        ).toHaveBeenCalledWith(SCOPE, REPORT_ID);
        expect(html.match(/data-action-outcome=/gu)?.length ?? 0).toBe(1);
        expect(card).toContain(`data-action-outcome="${result}"`);
        expect(card).toContain(title);
        if (body) expect(card).toContain(body);
        expect(card).not.toContain(uk.outcome.deniedBody);
        // The record as it stands now, read back — not the button's intent.
        expect(card).toContain(
          `<p data-moderation-now="true">${uk.outcome.now}: коментар показується; скарга: у роботі.</p>`,
        );
        expect(other).toContain(`id="report-${OTHER_REPORT_ID}"`);
        expect(other).not.toContain("data-action-outcome");
        expect(html).not.toContain('id="moderation-outcome"');
      },
    );

    it("says the outcome above the list when the action moved the report out of the view", async () => {
      mocks.listEngagementCommentModerationQueue.mockResolvedValue(
        queue([commentReport({ reportId: OTHER_REPORT_ID })]),
      );
      mocks.readEngagementCommentModerationReport.mockResolvedValue(
        commentReport({
          reportState: "actioned",
          resolvedAt: new Date("2026-09-21T10:00:00.000Z"),
          commentState: "removed",
          commentExcerpt: null,
        }),
      );

      const html = await renderComments({ report: REPORT_ID, result: "done" });
      const notice = elementWith(html, 'id="moderation-outcome"', "div");
      const other = elementWith(
        html,
        `data-moderation-report="${OTHER_REPORT_ID}"`,
        "li",
      );

      expect(notice).toContain('data-action-outcome="done"');
      expect(notice).toContain(uk.outcome.savedTitle);
      expect(notice).toContain(
        `<p data-moderation-now="true">${uk.outcome.now}: коментар прибрано з публічної сторінки; скарга: вжито заходів.</p>`,
      );
      expect(html.indexOf('id="moderation-outcome"')).toBeLessThan(
        html.indexOf("data-moderation-report="),
      );
      expect(other).toContain(`id="report-${OTHER_REPORT_ID}"`);
      expect(other).not.toContain("data-action-outcome");
    });

    it.each([
      ["failed", uk.outcome.failedBody],
      ["denied", uk.comments.deniedBody],
    ] as const)(
      "words %s above the list when it names no report, without a second read",
      async (result, body) => {
        const html = await renderComments({ result });
        const notice = elementWith(html, 'id="moderation-outcome"', "div");

        expect(
          mocks.readEngagementCommentModerationReport,
        ).not.toHaveBeenCalled();
        expect(notice).toContain(`data-action-outcome="${result}"`);
        expect(notice).toContain(body);
        expect(notice).not.toContain(uk.outcome.deniedBody);
        expect(notice).not.toContain("data-moderation-now");
      },
    );
  });

  it.each(["bg", "ru"] as const)(
    "refuses a reader who is not the owner in %s, with the owner-only sentence",
    async (locale) => {
      const copy = getModerationCopy(locale);
      mocks.getRequestInterfaceLocale.mockResolvedValue(locale);
      mocks.assertAdminCapabilityForScope.mockRejectedValue(
        new AdminAccessDeniedError(),
      );

      const html = await renderComments();

      expect(html).toContain('data-operator-access-state="denied"');
      expect(html).toContain(copy.comments.accessDenied);
      expect(html).not.toContain(copy.accessDenied);
      expect(mocks.listEngagementCommentModerationQueue).not.toHaveBeenCalled();
    },
  );

  it("speaks Russian to a Russian-reading owner, and links the author in Russian", async () => {
    const ru = getModerationCopy("ru");
    mocks.getRequestInterfaceLocale.mockResolvedValue("ru");

    const html = await renderComments();
    const text = visibleText(html);

    expect(html).toContain('lang="ru"');
    expect(text).toContain(ru.comments.title);
    expect(text).toContain(ru.comments.description);
    expect(text).toContain(`${ru.comments.targets.journal_entry}:`);
    expect(text).toContain(ru.reasons.harassment);
    expect(text).toContain(ru.reportStates.submitted);
    expect(text).toContain(ru.comments.actions.review);
    expect(text).not.toContain(uk.comments.actions.review);
    expect(html).toContain('href="/ru/@olena"');
    expect(mocks.confirmSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: ru.comments.removeTitle,
        cancelLabel: ru.cancel,
      }),
    );
  });
});

/** The element that carries `marker`, with everything inside it. */
function elementWith(html: string, marker: string, tag: string): string {
  const at = html.indexOf(marker);
  if (at < 0) return "";
  const start = html.lastIndexOf(`<${tag}`, at);
  const pattern = new RegExp(`<${tag}[\\s>]|</${tag}>`, "gu");
  pattern.lastIndex = start;
  let depth = 0;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  return html.slice(start);
}

/** What one form posts, by field name. */
function hiddenFields(form: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(
      form.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"\/>/gu),
      (match) => [match[1], match[2]],
    ),
  );
}

/** What a reader sees: the text, with every tag and attribute gone. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ");
}
