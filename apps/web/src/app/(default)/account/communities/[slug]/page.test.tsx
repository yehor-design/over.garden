import { postgresRejection } from "@test/postgres-rejection";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getModerationCopy } from "@/lib/moderation-copy";
import {
  CommunityMutationError,
  type CommunityModerationQueue,
  type CommunityModerationQueueItem,
} from "@/server/community-repository";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const mocks = vi.hoisted(() => ({
  getRequestInterfaceLocale: vi.fn(),
  resolveWorkspaceViewer: vi.fn(),
  listCommunityModerationQueue: vi.fn(),
  readCommunityModerationReport: vi.fn(),
  confirmSubmit: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
}));

// The repository is imported for real so the page classifies a refusal with
// the real `communityMutationRefusal`; it must not open a pool on the way,
// because every read here is a mock.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
}));
vi.mock("@/server/community-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/community-repository")>()),
  listCommunityModerationQueue: mocks.listCommunityModerationQueue,
  readCommunityModerationReport: mocks.readCommunityModerationReport,
}));
// Mocked only to prove nobody asks it before the queue read: who may
// moderate is the repository's one rule.
vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccessBounded:
    mocks.resolveAdminCapabilityAccessBounded,
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));
vi.mock("@/app/(default)/account/communities/[slug]/actions", () => ({
  moderateCommunityContributionAction: vi.fn(),
  moderateCommunityDiscussionAction: vi.fn(),
  moderateCommunityMembershipAction: vi.fn(),
  resolveCommunityReportAction: vi.fn(),
  setCommunityParticipationAction: vi.fn(),
}));
// The question a destructive control asks lives in a dialog that opens on
// hydration, so it is not in the served markup. The real control still
// renders — its submit button is what works before the bundle does — and the
// spy records what it was told to ask.
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

const SLUG = "observation-and-care";
const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000901",
  sessionId: "moderator-session",
};
const REPORT_ID = "00000000-0000-4000-8000-000000000401";
const OTHER_REPORT_ID = "00000000-0000-4000-8000-000000000402";
const CONTRIBUTION_ID = "00000000-0000-4000-8000-000000000201";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000301";
const CONTRIBUTOR_USER_ID = "00000000-0000-4000-8000-000000000101";

const uk = getModerationCopy("uk");

function report(
  overrides: Partial<CommunityModerationQueueItem> = {},
): CommunityModerationQueueItem {
  return {
    reportId: REPORT_ID,
    reportReason: "off_topic",
    reportState: "submitted",
    reportedAt: new Date("2026-09-20T09:00:00.000Z"),
    resolvedAt: null,
    contributionId: CONTRIBUTION_ID,
    contributionState: "active",
    discussionState: "open",
    contributorUserId: CONTRIBUTOR_USER_ID,
    membershipId: MEMBERSHIP_ID,
    membershipState: "active",
    journalTitle: "Томати після граду",
    journalExcerpt: "Після граду листя посіклося, а зав’язь лишилась.",
    publicSlug: "tomaty-pislia-hradu",
    entryNumber: 7,
    objectDisplayName: "Черрі на балконі",
    objectKind: "plant",
    authorHandle: "anna",
    authorDisplayName: "Анна Коваль",
    addressHandle: "anna",
    ...overrides,
  };
}

function queue(
  items: CommunityModerationQueueItem[] = [report()],
  options: Partial<Pick<CommunityModerationQueue, "view" | "counts">> = {},
) {
  const community: Pick<
    CommunityModerationQueue["community"],
    "id" | "slug" | "contentKey" | "lifecycleState" | "participationState"
  > = {
    id: "00000000-0000-4000-8000-000000000184",
    slug: SLUG,
    contentKey: "observation-and-care",
    lifecycleState: "active",
    participationState: "open",
  };
  return {
    community,
    view: options.view ?? "open",
    items,
    counts: options.counts ?? { open: items.length, resolved: 4 },
  };
}

async function renderReports(
  searchParams: Record<string, string> = {},
  slug = SLUG,
): Promise<string> {
  const { default: CommunityModerationPage } = await import("./page");
  return renderToStaticMarkup(
    await CommunityModerationPage({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("/account/communities/:slug — one community's reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "signed-in",
      userId: SCOPE.userId,
      scope: SCOPE,
    });
    mocks.listCommunityModerationQueue.mockResolvedValue(queue());
    mocks.readCommunityModerationReport.mockResolvedValue(null);
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "denied",
    });
    mocks.assertAdminCapabilityForScope.mockRejectedValue(
      new Error("Admin access denied."),
    );
  });

  describe("who may read the queue", () => {
    it("asks a guest to sign in and reads nothing of the queue, whatever the address asks for", async () => {
      mocks.resolveWorkspaceViewer.mockResolvedValue({
        status: "sign-in-required",
      });

      const html = await renderReports({
        view: "resolved",
        report: REPORT_ID,
        result: "done",
      });

      expect(html).toContain('data-operator-surface="community-moderation"');
      expect(html).toContain('data-operator-access-state="sign-in-required"');
      // The way back after signing in is the view the guest asked for.
      expect(html).toContain(
        `data-next="/account/communities/${SLUG}?view=resolved"`,
      );
      expect(html).not.toContain("data-private-moderation-queue");
      expect(html).not.toContain("data-moderation-tabs");
      expect(html).not.toContain("data-action-outcome");
      expect(mocks.listCommunityModerationQueue).not.toHaveBeenCalled();
      expect(mocks.readCommunityModerationReport).not.toHaveBeenCalled();
    });

    it("says the session could not be read, instead of asking a signed-in moderator to sign in", async () => {
      mocks.resolveWorkspaceViewer.mockResolvedValue({
        status: "unavailable",
        failure: describeWorkspaceFailure(postgresRejection("08006")),
      });

      const html = await renderReports();

      expect(html).toContain('data-operator-access-state="unavailable"');
      expect(html).toContain('data-section-failure="connection_unavailable"');
      expect(html).not.toContain("data-sign-in-prompt");
      expect(html).not.toContain("data-private-moderation-queue");
      expect(mocks.listCommunityModerationQueue).not.toHaveBeenCalled();
      expect(mocks.readCommunityModerationReport).not.toHaveBeenCalled();
    });

    // The queue read *is* the access check: the repository refuses before it
    // selects a row, so there is no pre-check to count. What the page owes is
    // to render nothing of what a refused read might have brought back — here
    // a report read that answered anyway.
    it("tells a reader who may not moderate so, with not one byte of the queue", async () => {
      mocks.listCommunityModerationQueue.mockRejectedValue(
        new CommunityMutationError("moderation_denied"),
      );
      mocks.readCommunityModerationReport.mockResolvedValue(report());

      const html = await renderReports({ report: REPORT_ID, result: "done" });

      expect(html).toContain('data-operator-access-state="denied"');
      expect(html).toContain(uk.accessDenied);
      expect(mocks.listCommunityModerationQueue).toHaveBeenCalledTimes(1);
      expect(mocks.listCommunityModerationQueue).toHaveBeenCalledWith(
        SCOPE,
        SLUG,
        { view: "open" },
      );
      for (const leak of [
        "data-private-moderation-queue",
        "data-moderation-report",
        "data-moderation-tabs",
        "data-action-outcome",
        "<form",
        REPORT_ID,
        CONTRIBUTION_ID,
        MEMBERSHIP_ID,
        "Томати після граду",
        "Після граду листя",
        "Анна Коваль",
        uk.reasons.off_topic,
      ]) {
        expect(html, leak).not.toContain(leak);
      }
    });

    // `OVE-500`, criterion 5. An operator-only check used to stand in front
    // of the queue, so a community's own moderator — whom the server lets
    // act — was shown "no access". The operator here is denied everywhere,
    // and the moderator still gets the queue the repository hands back.
    it("lets a community's own moderator in on the repository's word, with no operator check in front", async () => {
      const html = await renderReports();

      expect(html).toContain('data-operator-access-state="allowed"');
      expect(html).toContain(`data-moderation-report="${REPORT_ID}"`);
      expect(mocks.resolveAdminCapabilityAccessBounded).not.toHaveBeenCalled();
      expect(mocks.assertAdminCapabilityForScope).not.toHaveBeenCalled();
    });

    it("answers 404 for a community that does not exist", async () => {
      mocks.listCommunityModerationQueue.mockRejectedValue(
        new CommunityMutationError("community_unavailable"),
      );

      await expect(renderReports()).rejects.toThrowError(
        /NEXT_HTTP_ERROR_FALLBACK;404/u,
      );
    });

    it("answers 404 for a slug nobody can spell, before any queue read", async () => {
      await expect(renderReports({}, "Not A Slug")).rejects.toThrowError(
        /NEXT_HTTP_ERROR_FALLBACK;404/u,
      );
      expect(mocks.listCommunityModerationQueue).not.toHaveBeenCalled();
    });

    // A queue that could not be read is not an empty queue: "no reports"
    // would tell the moderator there is nothing to do.
    it("renders a failed read as its failure class, with a retry that keeps the view", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.listCommunityModerationQueue.mockRejectedValue(
        postgresRejection("57014"),
      );

      const html = await renderReports({ view: "resolved" });

      expect(html).toContain('data-operator-access-state="unavailable"');
      expect(html).toContain('data-section-failure="query_timeout"');
      expect(html).toContain(uk.unavailable);
      expect(html).toContain(
        `href="/account/communities/${SLUG}?view=resolved" data-workspace-retry="section"`,
      );
      expect(html).not.toContain("data-private-moderation-queue");
      expect(html).not.toContain(uk.community.emptyResolved);
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        event: "workspace_section_degraded",
        surface: "community-moderation",
        section: "reports",
        failureClass: "query_timeout",
      });
      log.mockRestore();
    });
  });

  describe("a report, as a task", () => {
    it("says what was reported, by whom, about what, and where it stands — in words, not enums", async () => {
      const html = await renderReports();
      const card = elementWith(
        html,
        `data-moderation-report="${REPORT_ID}"`,
        "li",
      );
      const text = visibleText(card);

      expect(html).toContain('data-operator-access-state="allowed"');
      expect(html).toContain('data-private-moderation-queue="true"');
      expect(mocks.listCommunityModerationQueue).toHaveBeenCalledWith(
        SCOPE,
        SLUG,
        { view: "open" },
      );
      // No outcome to word, so no second read.
      expect(mocks.readCommunityModerationReport).not.toHaveBeenCalled();

      expect(card).toContain(`id="report-${REPORT_ID}"`);
      expect(card).toContain('data-moderation-reason="off_topic"');
      expect(text).toContain(uk.reasons.off_topic);
      expect(text).toContain(uk.reportStates.submitted);
      expect(text).toContain(uk.reportedOn);
      // The entry at its one address, and its author at theirs.
      expect(card).toMatch(
        /<a [^>]*href="\/@anna\/post\/7">Томати після граду<\/a>/u,
      );
      expect(card).toMatch(/<a [^>]*href="\/@anna">Анна Коваль<\/a>/u);
      expect(text).toContain("Черрі на балконі (рослина)");
      expect(card).toMatch(
        /<blockquote data-moderation-excerpt="true"[^>]*>Після граду листя посіклося, а зав’язь лишилась\.<\/blockquote>/u,
      );
      expect(text).toContain(uk.community.stateTitle);
      expect(text).toContain(uk.community.contributionStates.active);
      expect(text).toContain(uk.community.discussionStates.open);
      expect(text).toContain(uk.community.memberStates.active);

      // The machine values stay in attributes; the reader sees none of them,
      // and no internal id of the person reported.
      for (const machine of ["off_topic", "submitted", "undefined", "null"]) {
        expect(text, machine).not.toContain(machine);
      }
      expect(html).not.toContain(CONTRIBUTOR_USER_ID);
    });

    it("names an author with no public profile without linking one, and keeps a withdrawn entry's text out", async () => {
      mocks.listCommunityModerationQueue.mockResolvedValue(
        queue([
          report({
            authorHandle: null,
            authorDisplayName: null,
            addressHandle: null,
            journalTitle: null,
            journalExcerpt: null,
            publicSlug: null,
            entryNumber: null,
          }),
        ]),
      );

      const html = await renderReports();
      const card = elementWith(
        html,
        `data-moderation-report="${REPORT_ID}"`,
        "li",
      );

      expect(visibleText(card)).toContain(uk.noPublicAuthor);
      expect(visibleText(card)).toContain(uk.community.entryUnavailable);
      expect(card).not.toContain('href="/@');
      expect(card).not.toContain("data-moderation-excerpt");
    });

    it("falls back to the handle when the display name is blank", async () => {
      mocks.listCommunityModerationQueue.mockResolvedValue(
        queue([report({ authorDisplayName: "   " })]),
      );

      const html = await renderReports();

      expect(html).toMatch(/<a [^>]*href="\/@anna">@anna<\/a>/u);
    });

    it("carries the exact report, contribution and membership — and the view — on every form", async () => {
      const html = await renderReports();
      const common = {
        slug: SLUG,
        view: "open",
        reportId: REPORT_ID,
        contributionId: CONTRIBUTION_ID,
        membershipId: MEMBERSHIP_ID,
        reason: "off_topic",
      };

      // One real form per decision, so each one decides before hydration.
      expect(html.match(/<form /gu)?.length ?? 0).toBe(5);
      for (const [action, field] of [
        ["remove-contribution", { contributionState: "removed" }],
        ["close-discussion", { discussionState: "closed" }],
        ["ban-member", { membershipState: "banned" }],
        ["resolve-actioned", { reportState: "actioned" }],
        ["dismiss-report", { reportState: "dismissed" }],
      ] as const) {
        const form = elementWith(
          html,
          `data-moderation-action="${action}"`,
          "form",
        );
        expect(form, action).toContain(
          `id="moderation-${action}-${REPORT_ID}"`,
        );
        expect(hiddenFields(form), action).toEqual({ ...common, ...field });
      }
    });

    // DESIGN.md §4.4: what takes something away from people asks first, is
    // `danger`, and names what it takes. What only moves a report does not
    // stop to ask.
    it("asks before the two decisions that take something away, and only before those", async () => {
      const html = await renderReports();

      expect(html.match(/data-confirm-submit=/gu)?.length ?? 0).toBe(2);
      for (const action of ["remove-contribution", "ban-member"]) {
        const form = elementWith(
          html,
          `data-moderation-action="${action}"`,
          "form",
        );
        expect(form, action).toContain(
          `data-confirm-submit="moderation-${action}-${REPORT_ID}"`,
        );
        expect(form, action).toContain("bg-danger-fill");
      }
      for (const action of [
        "close-discussion",
        "resolve-actioned",
        "dismiss-report",
      ]) {
        const form = elementWith(
          html,
          `data-moderation-action="${action}"`,
          "form",
        );
        expect(form, action).not.toContain("data-confirm-submit");
        expect(form, action).not.toContain("bg-danger-fill");
      }

      expect(mocks.confirmSubmit).toHaveBeenCalledTimes(2);
      expect(mocks.confirmSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          formId: `moderation-remove-contribution-${REPORT_ID}`,
          label: uk.community.actions.removeContribution,
          title: "Прибрати «Томати після граду» зі спільноти?",
          description: uk.community.confirmRemoveBody,
          confirmLabel: uk.community.confirmRemove,
          cancelLabel: uk.cancel,
          pendingLabel: uk.pending,
        }),
      );
      expect(mocks.confirmSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          formId: `moderation-ban-member-${REPORT_ID}`,
          label: uk.community.actions.banMember,
          title: "Заборонити Анна Коваль участь у спільноті?",
          description: uk.community.confirmBanBody,
          confirmLabel: uk.community.confirmBan,
          cancelLabel: uk.cancel,
        }),
      );
    });

    it("offers the way back for what was taken away, without asking, and no decision on a resolved report", async () => {
      mocks.listCommunityModerationQueue.mockResolvedValue(
        queue(
          [
            report({
              reportState: "actioned",
              resolvedAt: new Date("2026-09-21T10:00:00.000Z"),
              contributionState: "removed",
              discussionState: "closed",
              membershipState: "banned",
            }),
          ],
          { view: "resolved", counts: { open: 0, resolved: 1 } },
        ),
      );

      const html = await renderReports({ view: "resolved" });
      const text = visibleText(html);

      for (const action of [
        "restore-contribution",
        "open-discussion",
        "restore-member",
      ]) {
        expect(html, action).toContain(`data-moderation-action="${action}"`);
      }
      for (const action of [
        "remove-contribution",
        "close-discussion",
        "ban-member",
        "resolve-actioned",
        "dismiss-report",
      ]) {
        expect(html, action).not.toContain(
          `data-moderation-action="${action}"`,
        );
      }
      expect(html).not.toContain("data-confirm-submit");
      expect(mocks.confirmSubmit).not.toHaveBeenCalled();
      expect(
        hiddenFields(
          elementWith(html, 'data-moderation-action="restore-member"', "form"),
        ),
      ).toMatchObject({ view: "resolved", membershipState: "active" });
      expect(text).toContain(uk.reportStates.actioned);
      expect(text).toContain(uk.resolvedOn);
      expect(text).toContain(uk.community.contributionStates.removed);
      expect(text).toContain(uk.community.discussionStates.closed);
      expect(text).toContain(uk.community.memberStates.banned);
    });

    it("keeps a report in review open to a decision", async () => {
      mocks.listCommunityModerationQueue.mockResolvedValue(
        queue([report({ reportState: "reviewed" })]),
      );

      const html = await renderReports();

      expect(html).toContain('data-moderation-action="resolve-actioned"');
      expect(html).toContain('data-moderation-action="dismiss-report"');
      expect(visibleText(html)).toContain(uk.reportStates.reviewed);
    });
  });

  describe("open and resolved views", () => {
    it("filters by address, counts both, and marks the one shown", async () => {
      mocks.listCommunityModerationQueue.mockResolvedValue(
        queue([], { view: "resolved", counts: { open: 2, resolved: 0 } }),
      );

      const html = await renderReports({ view: "resolved" });
      const open = elementWith(html, 'data-moderation-view="open"', "a");
      const resolved = elementWith(
        html,
        'data-moderation-view="resolved"',
        "a",
      );

      expect(mocks.listCommunityModerationQueue).toHaveBeenCalledWith(
        SCOPE,
        SLUG,
        { view: "resolved" },
      );
      expect(open).toContain(`href="/account/communities/${SLUG}"`);
      expect(open).not.toContain("aria-current");
      expect(open).toContain(
        `${uk.views.open}<span class="tabular-nums">2</span>`,
      );
      expect(resolved).toContain(
        `href="/account/communities/${SLUG}?view=resolved"`,
      );
      expect(resolved).toContain('aria-current="page"');
      expect(resolved).toContain(
        `${uk.views.resolved}<span class="tabular-nums">0</span>`,
      );
      expect(html).toContain(uk.community.emptyResolved);
      expect(html).not.toContain(uk.community.emptyOpen);
    });

    it("reads an unknown view as the open queue, and says an empty one in words", async () => {
      mocks.listCommunityModerationQueue.mockResolvedValue(
        queue([], { counts: { open: 0, resolved: 3 } }),
      );

      const html = await renderReports({ view: "everything" });

      expect(mocks.listCommunityModerationQueue).toHaveBeenCalledWith(
        SCOPE,
        SLUG,
        { view: "open" },
      );
      expect(elementWith(html, 'data-moderation-view="open"', "a")).toContain(
        'aria-current="page"',
      );
      expect(html).toContain(uk.community.emptyOpen);
    });

    it("links the community's two sections, the reports marked as current", async () => {
      const html = await renderReports();
      const tabs = elementWith(html, 'data-moderation-tabs="true"', "nav");

      expect(tabs).toMatch(
        new RegExp(
          `<a aria-current="page"[^>]*href="/account/communities/${SLUG}">${uk.community.tabs.reports}</a>`,
          "u",
        ),
      );
      expect(tabs).toContain(`href="/account/communities/${SLUG}/settings"`);
      expect(html).toContain('href="/account/communities"');
    });
  });

  // An action comes back to the same view, and its outcome is read back from
  // the record: in the report's own card while it is still in the view, above
  // the list when the action moved it out — so the notice is never lost with
  // the row it acted on.
  describe("what the last action did", () => {
    it.each([
      ["done", uk.outcome.savedTitle, null],
      ["stale", uk.outcome.staleTitle, uk.outcome.staleBody],
      ["failed", uk.outcome.failedTitle, uk.outcome.failedBody],
      ["denied", uk.outcome.deniedTitle, uk.outcome.deniedBody],
    ] as const)(
      "says %s in the report's own card while the report is still in the view",
      async (result, title, body) => {
        mocks.listCommunityModerationQueue.mockResolvedValue(
          queue([report(), report({ reportId: OTHER_REPORT_ID })]),
        );
        mocks.readCommunityModerationReport.mockResolvedValue(
          report({ discussionState: "closed", reportState: "reviewed" }),
        );

        const html = await renderReports({ report: REPORT_ID, result });
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

        expect(mocks.readCommunityModerationReport).toHaveBeenCalledWith(
          SCOPE,
          SLUG,
          REPORT_ID,
        );
        expect(html.match(/data-action-outcome=/gu)?.length ?? 0).toBe(1);
        expect(card).toContain(`data-action-outcome="${result}"`);
        expect(card).toContain(title);
        if (body) expect(card).toContain(body);
        // The record as it stands now, read back — not the button's intent.
        expect(card).toContain(
          `${uk.outcome.now}: запис показується в спільноті; обговорення закрите; автор бере участь; скарга: у роботі.`,
        );
        expect(other).toContain(`id="report-${OTHER_REPORT_ID}"`);
        expect(other).not.toContain("data-action-outcome");
        expect(html).not.toContain('id="moderation-outcome"');
      },
    );

    it("says the outcome above the list when the action moved the report out of the view", async () => {
      mocks.listCommunityModerationQueue.mockResolvedValue(
        queue([report({ reportId: OTHER_REPORT_ID })]),
      );
      mocks.readCommunityModerationReport.mockResolvedValue(
        report({
          reportState: "actioned",
          resolvedAt: new Date("2026-09-21T10:00:00.000Z"),
          contributionState: "removed",
        }),
      );

      const html = await renderReports({ report: REPORT_ID, result: "done" });
      const notice = elementWith(html, 'id="moderation-outcome"', "div");

      expect(notice).toContain('data-action-outcome="done"');
      expect(notice).toContain(uk.outcome.savedTitle);
      expect(notice).toContain(
        `${uk.outcome.now}: «Томати після граду» — запис прибрано зі спільноти; обговорення відкрите; автор бере участь; скарга: вжито заходів.`,
      );
      expect(html.indexOf('id="moderation-outcome"')).toBeLessThan(
        html.indexOf("data-moderation-report="),
      );
      const other = elementWith(
        html,
        `data-moderation-report="${OTHER_REPORT_ID}"`,
        "li",
      );
      expect(other).toContain(`id="report-${OTHER_REPORT_ID}"`);
      expect(other).not.toContain("data-action-outcome");
    });

    it("words an outcome that names no report above the list, without a second read", async () => {
      const html = await renderReports({
        report: "not-a-report",
        result: "denied",
      });
      const notice = elementWith(html, 'id="moderation-outcome"', "div");

      expect(mocks.readCommunityModerationReport).not.toHaveBeenCalled();
      expect(notice).toContain('data-action-outcome="denied"');
      expect(notice).toContain(uk.outcome.deniedBody);
      expect(notice).not.toContain("data-moderation-now");
    });

    it("ignores a result it does not know", async () => {
      const html = await renderReports({ report: REPORT_ID, result: "maybe" });

      expect(html).not.toContain("data-action-outcome");
      expect(mocks.readCommunityModerationReport).not.toHaveBeenCalled();
    });
  });

  it("speaks Bulgarian to a Bulgarian moderator, and links the public pages in Bulgarian", async () => {
    const bg = getModerationCopy("bg");
    mocks.getRequestInterfaceLocale.mockResolvedValue("bg");

    const html = await renderReports();
    const text = visibleText(html);

    expect(html).toContain('lang="bg"');
    expect(text).toContain("Наблюдения и грижи");
    expect(text).toContain(bg.community.eyebrow);
    expect(text).toContain(bg.reasons.off_topic);
    expect(text).toContain(bg.reportStates.submitted);
    expect(text).toContain(bg.community.actions.removeContribution);
    expect(text).not.toContain(uk.community.actions.removeContribution);
    expect(html).toContain(`href="/bg/communities/${SLUG}"`);
    expect(html).toContain('href="/bg/@anna"');
    // An entry is never translated, so its address has no locale prefix.
    expect(html).toContain('href="/@anna/post/7"');
    expect(mocks.confirmSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Да се премахне ли „Томати після граду“ от общността?",
        cancelLabel: bg.cancel,
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
