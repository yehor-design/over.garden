import { postgresRejection } from "@test/postgres-rejection";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAccessDeniedError } from "@/server/admin-access";
import { describeWorkspaceFailure } from "@/server/workspace-failure";

const mocks = vi.hoisted(() => ({
  resolveMutationScope: vi.fn(),
  moderateEngagementCommentReport: vi.fn(),
  resolveWorkspaceAdminAccess: vi.fn(),
  assertAdminCapabilityForScope: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
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
vi.mock("@/server/engagement-repository", () => ({
  moderateEngagementCommentReport: mocks.moderateEngagementCommentReport,
}));
vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceAdminAccess: mocks.resolveWorkspaceAdminAccess,
}));
// The real module's refusal class, so the real owner check (swapped in by one
// case below) can tell a refusal from an outage.
vi.mock("@/server/admin-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/admin-access")>()),
  assertAdminCapabilityForScope: mocks.assertAdminCapabilityForScope,
}));
// Nothing here may open a pool or load Better Auth: every read is a mock.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/auth-session", () => ({
  getCurrentSession: vi.fn(),
  getSessionId: vi.fn(),
}));

const PATH = "/account/moderation/comments";
const REPORT_ID = "00000000-0000-4000-8000-000000000401";
const scope = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const OWNER_ACCESS = {
  mode: "sealed_owner_credential_only",
  role: "owner",
  capabilities: ["operator:read", "operator:mutate"],
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

async function moderate(fields: Record<string, string> = {}) {
  const { moderateCommentReportAction } = await import("./actions");
  return moderateCommentReportAction(undefined, commentFormData(fields));
}

function commentFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const fields: Record<string, string> = {
    reportId: REPORT_ID,
    action: "dismiss",
    view: "open",
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

describe("account comment moderation action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.resolveMutationScope.mockResolvedValue({
      status: "admitted",
      scope,
    });
    // An allowed owner check still runs the load it was given, so the suite
    // sees which capability was asked for, and for whom.
    mocks.resolveWorkspaceAdminAccess.mockImplementation(
      async (load: () => Promise<unknown>) => ({
        status: "allowed",
        access: await load(),
      }),
    );
    mocks.assertAdminCapabilityForScope.mockResolvedValue(OWNER_ACCESS);
    mocks.moderateEngagementCommentReport.mockResolvedValue({
      state: "dismissed",
      changed: true,
    });
  });

  it("asks for the owner's mutation right, then makes exactly the change asked for", async () => {
    const url = await redirectedTo(moderate());

    expect(mocks.resolveWorkspaceAdminAccess).toHaveBeenCalledTimes(1);
    expect(mocks.assertAdminCapabilityForScope).toHaveBeenCalledWith(
      scope,
      "operator:mutate",
    );
    expect(mocks.moderateEngagementCommentReport).toHaveBeenCalledTimes(1);
    expect(mocks.moderateEngagementCommentReport).toHaveBeenCalledWith(scope, {
      reportId: REPORT_ID,
      action: "dismiss",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(PATH);
    // Back to the same report, which the page reads back to word the outcome.
    expect(url).toBe(
      `${PATH}?report=${REPORT_ID}&result=done#report-${REPORT_ID}`,
    );
  });

  it.each(["review", "dismiss", "remove"] as const)(
    "passes %s through as the decision",
    async (action) => {
      await redirectedTo(moderate({ action }));

      expect(mocks.moderateEngagementCommentReport).toHaveBeenCalledWith(
        scope,
        { reportId: REPORT_ID, action },
      );
    },
  );

  it("comes back to the resolved view when that is where the owner acted", async () => {
    expect(await redirectedTo(moderate({ view: "resolved" }))).toBe(
      `${PATH}?view=resolved&report=${REPORT_ID}&result=done#report-${REPORT_ID}`,
    );
  });

  it("names the report the way the page reads it back", async () => {
    const reportId = "0a1b2c3d-0000-4000-8000-00000000abcd";

    const url = await redirectedTo(
      moderate({ reportId: ` ${reportId.toUpperCase()} ` }),
    );

    expect(mocks.moderateEngagementCommentReport).toHaveBeenCalledWith(scope, {
      reportId,
      action: "dismiss",
    });
    expect(url).toBe(
      `${PATH}?report=${reportId}&result=done#report-${reportId}`,
    );
  });

  // Somebody decided the report first: nothing changed, and the page says so
  // rather than "saved".
  it("says stale, with no cache effect, when the report had already been decided", async () => {
    mocks.moderateEngagementCommentReport.mockResolvedValue({
      state: "actioned",
      changed: false,
    });

    expect(await redirectedTo(moderate())).toBe(
      `${PATH}?report=${REPORT_ID}&result=stale#report-${REPORT_ID}`,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("says failed, with no cache effect, when the change could not be made", async () => {
    mocks.moderateEngagementCommentReport.mockRejectedValue(
      new Error("Comment report is not available."),
    );

    expect(await redirectedTo(moderate())).toBe(
      `${PATH}?report=${REPORT_ID}&result=failed#report-${REPORT_ID}`,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("says stale for a decision it does not know, without asking the repository", async () => {
    expect(await redirectedTo(moderate({ action: "delete" }))).toBe(
      `${PATH}?report=${REPORT_ID}&result=stale#report-${REPORT_ID}`,
    );
    expect(mocks.moderateEngagementCommentReport).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("comes back to the queue itself, changing nothing, when the form names no report it can read", async () => {
    expect(await redirectedTo(moderate({ reportId: "report-1" }))).toBe(
      `${PATH}?result=stale#moderation-queue`,
    );
    expect(mocks.moderateEngagementCommentReport).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  // A refusal is said as one. An owner check that could not be read refused
  // nothing: it changed nothing, and pressing again is safe.
  it.each([
    ["denied", { status: "denied" }, "denied"],
    [
      "unavailable",
      {
        status: "unavailable",
        failure: describeWorkspaceFailure(postgresRejection("08006")),
      },
      "failed",
    ],
  ] as const)(
    "has zero repository or cache effect when the owner check is %s",
    async (_status, access, result) => {
      mocks.resolveWorkspaceAdminAccess.mockResolvedValue(access);

      const url = await redirectedTo(moderate({ view: "resolved" }));

      expect(mocks.moderateEngagementCommentReport).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(url).toBe(
        `${PATH}?view=resolved&report=${REPORT_ID}&result=${result}#report-${REPORT_ID}`,
      );
    },
  );

  // The same two answers from the real owner check, which is what tells
  // them apart: a database that cannot be reached used to reach the owner as
  // "no access", and sent them to audit permissions during an outage.
  it("tells a refused owner check from one that could not be read", async () => {
    const actual = await vi.importActual<
      typeof import("@/server/workspace-access")
    >("@/server/workspace-access");
    mocks.resolveWorkspaceAdminAccess.mockImplementation(
      actual.resolveWorkspaceAdminAccess,
    );

    mocks.assertAdminCapabilityForScope.mockRejectedValue(
      postgresRejection("08006"),
    );
    expect(await redirectedTo(moderate())).toBe(
      `${PATH}?report=${REPORT_ID}&result=failed#report-${REPORT_ID}`,
    );

    mocks.redirect.mockClear();
    mocks.assertAdminCapabilityForScope.mockRejectedValue(
      new AdminAccessDeniedError(),
    );
    expect(await redirectedTo(moderate())).toBe(
      `${PATH}?report=${REPORT_ID}&result=denied#report-${REPORT_ID}`,
    );

    expect(mocks.assertAdminCapabilityForScope).toHaveBeenCalledWith(
      scope,
      "operator:mutate",
    );
    expect(mocks.moderateEngagementCommentReport).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  // A stale tab or a signed-out session is answered in place, so the form
  // can say so; nothing is checked, written, refreshed or navigated.
  it.each(["session_required", "session_account_changed"] as const)(
    "has zero access, repository, cache or navigation effects when the session is %s",
    async (code) => {
      mocks.resolveMutationScope.mockResolvedValue({
        status: "rejected",
        code,
        statusCode: code === "session_required" ? 401 : 409,
      });

      await expect(moderate()).resolves.toEqual({ mutationScope: code });

      expect(mocks.resolveWorkspaceAdminAccess).not.toHaveBeenCalled();
      expect(mocks.assertAdminCapabilityForScope).not.toHaveBeenCalled();
      expect(mocks.moderateEngagementCommentReport).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );
});
