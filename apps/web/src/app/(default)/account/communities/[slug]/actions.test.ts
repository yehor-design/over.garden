import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommunityMutationError } from "@/server/community-repository";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  moderateCommunityContribution: vi.fn(),
  moderateCommunityDiscussion: vi.fn(),
  moderateCommunityMembership: vi.fn(),
  resolveCommunityReport: vi.fn(),
  setCommunityParticipation: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  resolveAdminCapabilityAccessBounded: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/mutation-scope", () => ({
  resolveMutationScope: mocks.resolveMutationScope,
  ownerUserIdFromFormData: vi.fn(() => null),
}));
// The repository is imported for real so the action classifies a refusal
// with the real `communityMutationRefusal`; it must not open a pool on the
// way, because every write here is a mock.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/community-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/community-repository")>()),
  moderateCommunityContribution: mocks.moderateCommunityContribution,
  moderateCommunityDiscussion: mocks.moderateCommunityDiscussion,
  moderateCommunityMembership: mocks.moderateCommunityMembership,
  resolveCommunityReport: mocks.resolveCommunityReport,
  setCommunityParticipation: mocks.setCommunityParticipation,
}));
// Mocked only to prove nobody asks it: who may moderate is the repository's
// one rule, asked inside the transaction that makes the change.
vi.mock("@/server/admin-access", () => ({
  resolveAdminCapabilityAccessBounded:
    mocks.resolveAdminCapabilityAccessBounded,
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));

const SLUG = "observation-and-care";
const REPORT_ID = "00000000-0000-4000-8000-000000000401";
const CONTRIBUTION_ID = "00000000-0000-4000-8000-000000000201";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000301";
const REPORTS = `/account/communities/${SLUG}`;
const scope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};

type Action = (previousState: unknown, formData: FormData) => Promise<unknown>;

async function loadActions() {
  const actions = await import("./actions");
  return {
    contribution: actions.moderateCommunityContributionAction,
    discussion: actions.moderateCommunityDiscussionAction,
    membership: actions.moderateCommunityMembershipAction,
    report: actions.resolveCommunityReportAction,
    participation: actions.setCommunityParticipationAction,
  } satisfies Record<string, Action>;
}

const REPOSITORY = {
  contribution: mocks.moderateCommunityContribution,
  discussion: mocks.moderateCommunityDiscussion,
  membership: mocks.moderateCommunityMembership,
  report: mocks.resolveCommunityReport,
  participation: mocks.setCommunityParticipation,
} as const;

/**
 * Where the action sent the owner. The mock throws the way the framework's
 * `redirect` does, so nothing after it runs — and a redirect swallowed by a
 * `catch` would show up as a second call or a missing rejection.
 */
async function redirectedTo(pending: Promise<unknown>): Promise<string> {
  await expect(pending).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.redirect).toHaveBeenCalledTimes(1);
  return String(mocks.redirect.mock.calls[0]?.[0]);
}

function moderatorFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const fields: Record<string, string> = {
    slug: SLUG,
    view: "open",
    reportId: REPORT_ID,
    contributionId: CONTRIBUTION_ID,
    membershipId: MEMBERSHIP_ID,
    reason: "privacy",
    contributionState: "removed",
    discussionState: "closed",
    membershipState: "banned",
    reportState: "actioned",
    participationState: "closed",
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

describe("community moderation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope,
    });
    for (const operation of Object.values(REPOSITORY)) {
      operation.mockResolvedValue({ state: "updated" });
    }
    // The owner check is denied throughout: a community's own moderator is
    // not the operator, and must still reach the repository.
    mocks.resolveAdminCapabilityAccessBounded.mockResolvedValue({
      status: "denied",
    });
    mocks.assertAdminCapabilityForScope.mockRejectedValue(
      new Error("Admin access denied."),
    );
  });

  it("passes the exact targets, the chosen state and an allowlisted reason under the moderator's own scope", async () => {
    const actions = await loadActions();

    for (const action of Object.values(actions)) {
      await redirectedTo(action(undefined, moderatorFormData()));
      mocks.redirect.mockClear();
    }

    expect(mocks.moderateCommunityContribution).toHaveBeenCalledWith(scope, {
      slug: SLUG,
      contributionId: CONTRIBUTION_ID,
      state: "removed",
      reason: "privacy",
    });
    expect(mocks.moderateCommunityDiscussion).toHaveBeenCalledWith(scope, {
      slug: SLUG,
      contributionId: CONTRIBUTION_ID,
      state: "closed",
      reason: "privacy",
    });
    expect(mocks.moderateCommunityMembership).toHaveBeenCalledWith(scope, {
      slug: SLUG,
      membershipId: MEMBERSHIP_ID,
      state: "banned",
      reason: "privacy",
    });
    expect(mocks.resolveCommunityReport).toHaveBeenCalledWith(scope, {
      slug: SLUG,
      reportId: REPORT_ID,
      state: "actioned",
      reason: "privacy",
    });
    expect(mocks.setCommunityParticipation).toHaveBeenCalledWith(scope, {
      slug: SLUG,
      state: "closed",
      reason: "privacy",
    });
  });

  it("reads the way back from each control's own value", async () => {
    const actions = await loadActions();
    const formData = moderatorFormData({
      contributionState: "active",
      discussionState: "open",
      membershipState: "active",
      reportState: "dismissed",
      participationState: "open",
    });

    for (const action of Object.values(actions)) {
      await redirectedTo(action(undefined, formData));
      mocks.redirect.mockClear();
    }

    expect(mocks.moderateCommunityContribution).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ state: "active" }),
    );
    expect(mocks.moderateCommunityDiscussion).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ state: "open" }),
    );
    expect(mocks.moderateCommunityMembership).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ state: "active" }),
    );
    expect(mocks.resolveCommunityReport).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ state: "dismissed" }),
    );
    expect(mocks.setCommunityParticipation).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ state: "open" }),
    );
  });

  // A forged or stale form can only ask for what the repository already
  // allows: an unknown reason is recorded as "other", and the slug is read
  // the way the address spells it.
  it("records an unknown reason as other, and reads the slug as the address spells it", async () => {
    const { contribution } = await loadActions();

    await redirectedTo(
      contribution(
        undefined,
        moderatorFormData({
          reason: "because",
          slug: "  Observation-And-Care ",
        }),
      ),
    );

    expect(mocks.moderateCommunityContribution).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ slug: SLUG, reason: "other" }),
    );
  });

  // `OVE-500`: the operator-only check that stood in front of these refused
  // a community's own moderator whom the repository would have let act.
  it("puts no operator check in front of the repository's own rule", async () => {
    const actions = await loadActions();

    for (const action of Object.values(actions)) {
      await redirectedTo(action(undefined, moderatorFormData()));
      mocks.redirect.mockClear();
    }

    for (const operation of Object.values(REPOSITORY)) {
      expect(operation).toHaveBeenCalledTimes(1);
    }
    expect(mocks.resolveAdminCapabilityAccessBounded).not.toHaveBeenCalled();
    expect(mocks.assertAdminCapabilityForScope).not.toHaveBeenCalled();
  });

  describe("the way back to the queue", () => {
    it.each(["contribution", "discussion", "membership", "report"] as const)(
      "brings the %s decision back to the same report, in the same view",
      async (name) => {
        const actions = await loadActions();

        expect(
          await redirectedTo(actions[name](undefined, moderatorFormData())),
        ).toBe(
          `${REPORTS}?report=${REPORT_ID}&result=done#report-${REPORT_ID}`,
        );

        mocks.redirect.mockClear();
        expect(
          await redirectedTo(
            actions[name](undefined, moderatorFormData({ view: "resolved" })),
          ),
        ).toBe(
          `${REPORTS}?view=resolved&report=${REPORT_ID}&result=done#report-${REPORT_ID}`,
        );
      },
    );

    it("names the report the way the page reads it back", async () => {
      const { report } = await loadActions();
      const reportId = "0a1b2c3d-0000-4000-8000-00000000abcd";

      expect(
        await redirectedTo(
          report(
            undefined,
            moderatorFormData({ reportId: ` ${reportId.toUpperCase()} ` }),
          ),
        ),
      ).toBe(`${REPORTS}?report=${reportId}&result=done#report-${reportId}`);
    });

    it("comes back to the queue itself when the form names no report it can read", async () => {
      const { discussion } = await loadActions();

      expect(
        await redirectedTo(
          discussion(undefined, moderatorFormData({ reportId: "report-1" })),
        ),
      ).toBe(`${REPORTS}?result=done#moderation-queue`);
    });

    it("brings the participation change back to the settings page", async () => {
      const { participation } = await loadActions();

      expect(
        await redirectedTo(participation(undefined, moderatorFormData())),
      ).toBe(`${REPORTS}/settings?result=done`);
    });
  });

  describe("what the owner is told", () => {
    // `denied` and `stale` are the repository's own words for why it
    // refused; anything else changed nothing and is safe to press again.
    it.each([
      ["denied", new CommunityMutationError("moderation_denied")],
      ["stale", new CommunityMutationError("target_unavailable")],
      ["failed", new CommunityMutationError("community_unavailable")],
      ["failed", postgresRejection("40001")],
      ["failed", new Error("connection reset")],
    ] as const)(
      "says %s, with zero cache effects, when the repository refuses with %s",
      async (result, refusal) => {
        const actions = await loadActions();

        for (const [name, action] of Object.entries(actions)) {
          REPOSITORY[name as keyof typeof REPOSITORY].mockRejectedValueOnce(
            refusal,
          );
          const url = await redirectedTo(
            action(undefined, moderatorFormData()),
          );
          mocks.redirect.mockClear();

          const expected =
            name === "participation"
              ? `${REPORTS}/settings?result=${result}`
              : `${REPORTS}?report=${REPORT_ID}&result=${result}` +
                `#report-${REPORT_ID}`;
          expect(url, name).toBe(expected);
        }
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      },
    );

    it("refreshes the queue, the directory and every public page of the community only when something changed", async () => {
      const { contribution } = await loadActions();

      await redirectedTo(contribution(undefined, moderatorFormData()));

      expect(mocks.revalidatePath.mock.calls).toEqual([
        [`/account/communities/${SLUG}`],
        ["/account/communities"],
        ["/communities"],
        [`/communities/${SLUG}`],
        ["/bg/communities"],
        [`/bg/communities/${SLUG}`],
        ["/ru/communities"],
        [`/ru/communities/${SLUG}`],
        ["/", "layout"],
      ]);
    });
  });

  // A stale tab or a signed-out session is answered in place, so the form
  // can say so; nothing is written, refreshed or navigated.
  it.each(["session_required", "session_account_changed"] as const)(
    "has zero repository, cache or navigation effects when the session is %s",
    async (code) => {
      mocks.resolveMutationScope.mockResolvedValue({
        status: "rejected",
        code,
        statusCode: code === "session_required" ? 401 : 409,
      });
      const actions = await loadActions();

      for (const action of Object.values(actions)) {
        await expect(action(undefined, moderatorFormData())).resolves.toEqual({
          mutationScope: code,
        });
      }

      for (const operation of Object.values(REPOSITORY)) {
        expect(operation).not.toHaveBeenCalled();
      }
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );
});
